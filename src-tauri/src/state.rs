//! 地址簿与设置的持久化。
//!
//! 两个文件放在系统配置目录（`app_config_dir()`）：`servers.json`（地址簿，可分享）与
//! `settings.json`（本机设置）。写入一律走**原子替换**（临时文件 → fsync → rename），
//! 读取失败时把坏文件改名 `.bak` 并回退默认值，不静默丢数据。

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const SERVERS_FILE: &str = "servers.json";
pub const SETTINGS_FILE: &str = "settings.json";
/// 配置文件结构版本，改动字段语义时递增并在这里写迁移。
pub const SCHEMA_VERSION: u32 = 1;
/// 没写端口时依次探测的顺序（对应实战里的 frp 80、直连 3000、备用 54321）。
pub const DEFAULT_PORTS: [u16; 3] = [3000, 80, 54321];

/// 一台服务器。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    /// 稳定 id：窗口 label、独立缓存目录都用它。
    pub id: String,
    pub name: String,
    /// 只存主机名 / IP，不带协议、不带端口。
    pub host: String,
    /// `None` 表示"自动探测"。
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub note: String,
    /// 毫秒时间戳，最后一次探活成功的时间。
    #[serde(default)]
    pub last_seen_at: Option<u64>,
    #[serde(default)]
    pub last_latency_ms: Option<u64>,
}

/// 前端提交的新增 / 修改内容。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInput {
    pub name: String,
    pub host: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub note: Option<String>,
}

/// 本机设置。`#[serde(default)]` 让旧配置文件缺字段时也能读。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// 没写端口时依次探测的顺序。
    pub probe_ports: Vec<u16>,
    /// 启动后自动探活上次使用的服务器（只探活、不自动开窗）。
    pub auto_probe: bool,
    /// 游戏窗口默认全屏。
    pub game_fullscreen: bool,
    /// 每个服务器独立的 WebView 缓存目录（仅桌面）。
    pub isolate_storage: bool,
    /// 打开游戏后把启动器最小化。
    pub minimize_on_connect: bool,
    /// 界面语言：zh / en。
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            probe_ports: DEFAULT_PORTS.to_vec(),
            auto_probe: true,
            game_fullscreen: true,
            isolate_storage: false,
            minimize_on_connect: true,
            language: "zh".to_string(),
        }
    }
}

/// 地址簿文件的内容。容器级 `default`：旧文件缺字段时回退到 `Default`（含 schema 版本）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AddressBook {
    pub version: u32,
    pub active_id: Option<String>,
    pub servers: Vec<Server>,
}

impl Default for AddressBook {
    fn default() -> Self {
        Self { version: SCHEMA_VERSION, active_id: None, servers: Vec::new() }
    }
}

/// 一次性发给前端的完整状态快照（避免和 `tauri::State` 提取器混淆，故不叫 State）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub version: u32,
    pub active_id: Option<String>,
    pub servers: Vec<Server>,
    pub settings: Settings,
    /// 配置目录（界面上显示，方便排查）。
    pub config_dir: String,
    pub app_version: String,
}

/// 读 JSON：不存在或解析失败都回退默认值；解析失败时把坏文件留一份 `.bak`。
pub fn read_json<T>(path: &Path) -> T
where
    T: serde::de::DeserializeOwned + Default,
{
    let Ok(text) = fs::read_to_string(path) else { return T::default() };
    match serde_json::from_str::<T>(&text) {
        Ok(value) => value,
        Err(err) => {
            let backup = path.with_extension("json.bak");
            eprintln!("[config] {} 解析失败（{err}），已备份为 {}", path.display(), backup.display());
            let _ = fs::rename(path, &backup);
            T::default()
        }
    }
}

/// 原子写：同目录临时文件 → fsync → rename 覆盖，避免崩溃时留下半个文件。
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("创建目录 {} 失败：{e}", dir.display()))?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| format!("序列化失败：{e}"))?;
    let tmp: PathBuf = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&tmp).map_err(|e| format!("写 {} 失败：{e}", tmp.display()))?;
        file.write_all(text.as_bytes()).map_err(|e| format!("写 {} 失败：{e}", tmp.display()))?;
        file.write_all(b"\n").map_err(|e| format!("写 {} 失败：{e}", tmp.display()))?;
        file.sync_all().map_err(|e| format!("fsync {} 失败：{e}", tmp.display()))?;
    }
    fs::rename(&tmp, path).map_err(|e| format!("替换 {} 失败：{e}", path.display()))
}

/// 毫秒时间戳。
pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// 生成一个短 id（时间戳 + 序号，够用且无需引入随机数依赖）。
pub fn new_id(existing: &[Server]) -> String {
    let stamp = now_ms();
    for salt in 0u32..1000 {
        let id = format!("s-{:x}{:02x}", stamp, salt);
        if !existing.iter().any(|s| s.id == id) {
            return id;
        }
    }
    format!("s-{stamp:x}")
}

/// 主机名规整：去掉协议、路径、端口和方括号，只留主机名。
pub fn normalize_host(raw: &str) -> String {
    let mut host = raw.trim().to_string();
    if let Some(rest) = host.split_once("://") {
        host = rest.1.to_string();
    }
    if let Some((before, _)) = host.split_once('/') {
        host = before.to_string();
    }
    if host.starts_with('[') {
        // IPv6 字面量 [::1]:3000
        if let Some(end) = host.find(']') {
            host = host[1..end].to_string();
        }
    } else if host.matches(':').count() == 1 {
        if let Some((before, _)) = host.split_once(':') {
            host = before.to_string();
        }
    }
    host.trim_end_matches('.').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_normalization_strips_protocol_port_and_path() {
        assert_eq!(normalize_host("  http://192.168.1.10:3000/  "), "192.168.1.10");
        assert_eq!(normalize_host("192.168.1.10"), "192.168.1.10");
        assert_eq!(normalize_host("game.example.com:54321"), "game.example.com");
        assert_eq!(normalize_host("[::1]:3000"), "::1");
        assert_eq!(normalize_host("::1"), "::1");
        assert_eq!(normalize_host("example.com."), "example.com");
    }

    #[test]
    fn new_id_does_not_collide_with_existing() {
        let mut servers = Vec::new();
        for _ in 0..5 {
            let id = new_id(&servers);
            servers.push(Server {
                id: id.clone(),
                name: "n".into(),
                host: "h".into(),
                port: None,
                note: String::new(),
                last_seen_at: None,
                last_latency_ms: None,
            });
        }
        let unique: std::collections::HashSet<_> = servers.iter().map(|s| &s.id).collect();
        assert_eq!(unique.len(), servers.len());
    }

    #[test]
    fn settings_survive_missing_fields() {
        let parsed: Settings = serde_json::from_str("{\"language\":\"en\"}").unwrap();
        assert_eq!(parsed.language, "en");
        assert_eq!(parsed.probe_ports, DEFAULT_PORTS.to_vec());
        assert!(parsed.auto_probe);
    }

    #[test]
    fn address_book_falls_back_to_defaults_when_empty_object() {
        let parsed: AddressBook = serde_json::from_str("{}").unwrap();
        assert!(parsed.servers.is_empty());
        assert_eq!(parsed.version, SCHEMA_VERSION);
        assert_eq!(parsed.active_id, None);
    }
}
