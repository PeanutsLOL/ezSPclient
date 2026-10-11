//! 暴露给前端的命令。
//!
//! 约定：凡是会改状态的命令都返回**新的完整快照**，前端直接整体重绘，省掉一套本地状态同步逻辑。
//! 网络 I/O（探活）用 `async` 命令 + `spawn_blocking`，不占主线程，界面不会卡。

use crate::probe::{self, ProbeResult};
use crate::state::{
    self, AddressBook, AppSnapshot, Server, ServerInput, Settings, SCHEMA_VERSION, SERVERS_FILE, SETTINGS_FILE,
};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State as TauriState, WebviewUrl, WebviewWindowBuilder};

/// 应用运行期状态：配置目录 + 内存里的地址簿与设置。
pub struct AppState {
    pub dir: PathBuf,
    pub book: Mutex<AddressBook>,
    pub settings: Mutex<Settings>,
}

impl AppState {
    /// 启动时从磁盘加载（文件缺失/损坏都能拿到可用默认值）。
    pub fn load(dir: PathBuf) -> Self {
        let book: AddressBook = state::read_json(&dir.join(SERVERS_FILE));
        let settings: Settings = state::read_json(&dir.join(SETTINGS_FILE));
        Self { dir, book: Mutex::new(book), settings: Mutex::new(settings) }
    }

    fn snapshot(&self) -> AppSnapshot {
        let book = self.book.lock().expect("地址簿锁中毒");
        let settings = self.settings.lock().expect("设置锁中毒");
        AppSnapshot {
            version: SCHEMA_VERSION,
            active_id: book.active_id.clone(),
            servers: book.servers.clone(),
            settings: settings.clone(),
            config_dir: self.dir.display().to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    fn persist_book(&self, book: &AddressBook) -> Result<(), String> {
        state::write_json_atomic(&self.dir.join(SERVERS_FILE), book)
    }

    fn persist_settings(&self, settings: &Settings) -> Result<(), String> {
        state::write_json_atomic(&self.dir.join(SETTINGS_FILE), settings)
    }
}

/// 校验并规整前端提交的服务器信息。端口留空 / 非法都表示"自动探测"（存 `None`）。
fn clean_input(input: &ServerInput) -> Result<(String, String, Option<u16>), String> {
    let host = state::normalize_host(&input.host);
    if host.is_empty() {
        return Err("请填写服务器地址".to_string());
    }
    if host.chars().any(char::is_whitespace) {
        return Err("地址里不能有空格".to_string());
    }
    let name = {
        let trimmed = input.name.trim();
        if trimmed.is_empty() {
            host.clone()
        } else {
            trimmed.to_string()
        }
    };
    let port = match input.port {
        Some(p) if (1..=u16::MAX).contains(&p) => Some(p),
        _ => None,
    };
    Ok((name, host, port))
}

#[tauri::command]
pub fn load_state(state: TauriState<'_, AppState>) -> AppSnapshot {
    state.snapshot()
}

#[tauri::command]
pub fn add_server(state: TauriState<'_, AppState>, input: ServerInput) -> Result<AppSnapshot, String> {
    let (name, host, port) = clean_input(&input)?;
    let mut book = state.book.lock().expect("地址簿锁中毒");
    if book.servers.iter().any(|s| s.host == host && s.port == port) {
        return Err(match port {
            Some(p) => format!("{host}:{p} 已经在列表里了"),
            None => format!("{host}（自动探测端口）已经在列表里了"),
        });
    }
    let id = state::new_id(&book.servers);
    book.servers.push(Server {
        id: id.clone(),
        name,
        host,
        port,
        note: input.note.clone().unwrap_or_default().trim().to_string(),
        last_seen_at: None,
        last_latency_ms: None,
    });
    if book.active_id.is_none() {
        book.active_id = Some(id);
    }
    state.persist_book(&book)?;
    drop(book);
    Ok(state.snapshot())
}

#[tauri::command]
pub fn update_server(state: TauriState<'_, AppState>, id: String, input: ServerInput) -> Result<AppSnapshot, String> {
    let (name, host, port) = clean_input(&input)?;
    let mut book = state.book.lock().expect("地址簿锁中毒");
    let server = book.servers.iter_mut().find(|s| s.id == id).ok_or_else(|| format!("找不到服务器 {id}"))?;
    server.name = name;
    server.host = host;
    server.port = port;
    server.note = input.note.clone().unwrap_or_default().trim().to_string();
    // 换了地址，上次的探活结果就不再适用。
    server.last_seen_at = None;
    server.last_latency_ms = None;
    state.persist_book(&book)?;
    drop(book);
    Ok(state.snapshot())
}

#[tauri::command]
pub fn remove_server(state: TauriState<'_, AppState>, id: String) -> Result<AppSnapshot, String> {
    let mut book = state.book.lock().expect("地址簿锁中毒");
    book.servers.retain(|s| s.id != id);
    if book.active_id.as_deref() == Some(id.as_str()) {
        book.active_id = book.servers.first().map(|s| s.id.clone());
    }
    state.persist_book(&book)?;
    drop(book);
    Ok(state.snapshot())
}

#[tauri::command]
pub fn set_active(state: TauriState<'_, AppState>, id: Option<String>) -> Result<AppSnapshot, String> {
    let mut book = state.book.lock().expect("地址簿锁中毒");
    if let Some(ref id) = id {
        if !book.servers.iter().any(|s| &s.id == id) {
            return Err(format!("找不到服务器 {id}"));
        }
    }
    book.active_id = id;
    state.persist_book(&book)?;
    drop(book);
    Ok(state.snapshot())
}

#[tauri::command]
pub fn update_settings(state: TauriState<'_, AppState>, settings: Settings) -> Result<AppSnapshot, String> {
    let mut current = state.settings.lock().expect("设置锁中毒");
    let ports: Vec<u16> = settings.probe_ports.iter().copied().filter(|p| *p > 0).collect();
    *current = Settings {
        probe_ports: if ports.is_empty() { state::DEFAULT_PORTS.to_vec() } else { ports },
        ..settings
    };
    state.persist_settings(&current)?;
    drop(current);
    Ok(state.snapshot())
}

/// 探测一台服务器（阻塞网络 I/O 放到独立线程，不占主线程）。
#[tauri::command]
pub async fn probe_server(host: String, port: u16) -> Result<ProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || probe::probe(&host, port))
        .await
        .map_err(|e| format!("探活任务失败：{e}"))
}

/// 把一次成功的探活结果写回地址簿（端口自动探测命中的端口也会落盘）。
#[tauri::command]
pub fn record_probe(
    state: TauriState<'_, AppState>,
    id: String,
    port: u16,
    latency_ms: u64,
    ok: bool,
) -> Result<AppSnapshot, String> {
    let mut book = state.book.lock().expect("地址簿锁中毒");
    if let Some(server) = book.servers.iter_mut().find(|s| s.id == id) {
        if ok {
            server.port = Some(port);
            server.last_seen_at = Some(state::now_ms());
            server.last_latency_ms = Some(latency_ms);
        } else {
            server.last_latency_ms = None;
        }
    }
    state.persist_book(&book)?;
    drop(book);
    Ok(state.snapshot())
}

/// 打开游戏窗口。
///
/// - 桌面：新开一个窗口，已经是打开状态就聚焦（不会开出第二个）。
/// - 移动端：返回 `mobile` 提示，前端改为导航当前 WebView（见 docs/DESIGN.md 第 3 节）。
#[tauri::command]
pub fn open_game(
    app: AppHandle,
    state: TauriState<'_, AppState>,
    id: String,
    room: Option<String>,
    fullscreen: Option<bool>,
    isolate: Option<bool>,
) -> Result<String, String> {
    let (host, port) = {
        let book = state.book.lock().expect("地址簿锁中毒");
        let server = book.servers.iter().find(|s| s.id == id).ok_or_else(|| format!("找不到服务器 {id}"))?;
        let port = server.port.ok_or_else(|| "这台服务器还没探测出端口，先点一次「测速」".to_string())?;
        (server.host.clone(), port)
    };

    let room = room.unwrap_or_default().trim().to_string();
    if !room.is_empty() && !room.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("房间密钥只能是字母和数字".to_string());
    }

    let authority = if host.contains(':') { format!("[{host}]:{port}") } else { format!("{host}:{port}") };
    let mut url = format!("http://{authority}/");
    if !room.is_empty() {
        url.push_str(&format!("?room={room}"));
    }

    let label = format!("game-{id}");
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        if let Some(fullscreen) = fullscreen {
            let _ = existing.set_fullscreen(fullscreen);
        }
        return Ok(label);
    }

    let parsed = url.parse::<tauri::Url>().map_err(|e| format!("地址不合法（{url}）：{e}"))?;
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("卫戍协议 · {authority}"))
        .inner_size(1280.0, 760.0)
        .min_inner_size(720.0, 480.0)
        .fullscreen(fullscreen.unwrap_or(true))
        .center();

    // 每个服务器一个 WebView2 用户数据目录：房间密钥、缓存、localStorage 互不影响。
    // 仅 Windows / Linux 支持；移动端受平台限制（见 DESIGN 第 3 节）。
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    if isolate.unwrap_or(false) {
        let dir = app
            .path()
            .app_local_data_dir()
            .map_err(|e| format!("无法定位数据目录：{e}"))?
            .join("profiles")
            .join(&label);
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建缓存目录失败：{e}"))?;
        builder = builder.data_directory(dir);
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    let _ = isolate;

    let window = builder.build().map_err(|e| format!("打开游戏窗口失败：{e}"))?;
    let _ = window.set_focus();

    // 打开游戏后按设置把启动器收起来（做在 Rust 侧，前端不需要 window 权限）。
    if state.settings.lock().expect("设置锁中毒").minimize_on_connect {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.minimize();
        }
    }
    Ok(window.label().to_string())
}

/// 关闭某个服务器的游戏窗口。
#[tauri::command]
pub fn close_game(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&format!("game-{id}")) {
        window.close().map_err(|e| format!("关闭窗口失败：{e}"))?;
    }
    Ok(())
}

/// 导出地址簿（可分享的 JSON，不含任何凭据）。
#[tauri::command]
pub fn export_state(state: TauriState<'_, AppState>) -> Result<String, String> {
    let book = state.book.lock().expect("地址簿锁中毒");
    serde_json::to_string_pretty(&*book).map_err(|e| format!("导出失败：{e}"))
}

/// 导入地址簿：按 `host:port` 去重合并，已有的条目不动。
#[tauri::command]
pub fn import_state(state: TauriState<'_, AppState>, json: String) -> Result<AppSnapshot, String> {
    let incoming: AddressBook = serde_json::from_str(&json).map_err(|e| format!("导入内容不是合法的地址簿 JSON：{e}"))?;
    let mut book = state.book.lock().expect("地址簿锁中毒");
    let mut added = 0usize;
    for server in incoming.servers {
        let duplicate = book.servers.iter().any(|s| s.host == server.host && s.port == server.port);
        if duplicate {
            continue;
        }
        let id = state::new_id(&book.servers);
        book.servers.push(Server { id, ..server });
        added += 1;
    }
    if added == 0 {
        return Err("没有可导入的新服务器（地址都已存在）".to_string());
    }
    state.persist_book(&book)?;
    drop(book);
    Ok(state.snapshot())
}

/// 清空全部本地数据（地址簿 + 设置回到默认值）。
#[tauri::command]
pub fn reset_state(state: TauriState<'_, AppState>) -> Result<AppSnapshot, String> {
    {
        let mut book = state.book.lock().expect("地址簿锁中毒");
        *book = AddressBook::default();
        state.persist_book(&book)?;
    }
    {
        let mut settings = state.settings.lock().expect("设置锁中毒");
        *settings = Settings::default();
        state.persist_settings(&settings)?;
    }
    Ok(state.snapshot())
}
