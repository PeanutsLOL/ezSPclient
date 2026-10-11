# 设计文档

> 记录 ezSPclient 的目标、架构、数据模型与关键取舍。改动设计时先改这份文档。

## 1. 目标与非目标

### 目标

1. 让"多个服务器之间切换"这件事变得一键完成：地址簿 + 记住上次使用 + 探活显示延迟。
2. 把网页游戏包成**原生窗口**：全屏、无浏览器地址栏、可后台常驻，桌面与移动端体验一致。
3. 配置**完全本地**：不登录、不联网（除游戏服务器本身）、可导出导入、重启不丢。
4. 保持极小：只做外壳，不碰游戏逻辑；游戏更新不需要重编客户端。

### 非目标（至少 v0.1 不做）

- 不重写游戏、不注入脚本修改游戏行为、不做加速/代理。
- 不做账号体系、不做云同步、不做联机大厅。
- 不内置服务器列表分发（避免变成"公共服务器目录"）。
- 不做自动更新（Tauri 的 updater 留到以后按需接）。

## 2. 为什么是 WebView 外壳

游戏本体是纯前端网页（HTTP + WebSocket，含 WebGL 渲染），任何"重写客户端"的工作量都远超收益，而且会随游戏更新不断失配。外壳方案的关键收益来自浏览器没有或做得不好的部分：

| 浏览器痛点 | 外壳的解法 |
|---|---|
| 换服务器要重新输地址、清缓存 | 地址簿 + 每个服务器独立 storage 分区 |
| 地址栏、标签页、滚动条挤占画面 | 无边框全屏窗口 |
| 手机上是竖屏浏览器、状态栏遮挡 | 锁横屏 + 沉浸模式 |
| 连不上时看到浏览器的错误页 | 自己的错误页（重试 / 换服务器 / 清缓存） |
| 房间密钥要靠聊天软件转发 | 直接输入密钥进房（`?room=KEY`） |

## 3. 多平台策略

Tauri v2 一套 Rust 核心 + 一份前端，覆盖 Windows / macOS / Linux / Android / iOS。但**窗口模型在桌面和移动端不同**，这是本设计里最重要的分叉：

| | 桌面 | 移动 |
|---|---|---|
| 启动器 UI | 主窗口（本地页面） | 主 WebView（本地页面） |
| 打开游戏 | **新开一个窗口**加载远端地址，启动器窗口保留 | **全屏 iframe 内嵌**在当前界面里（移动端没有多窗口） |
| 返回启动器 | 关闭游戏窗口 | 顶部「返回启动器」条 / Android 返回键 / ESC |
| 缓存隔离 | `data_directory`（WebView2 user data folder），可关 | iframe 按域名天然隔离，无需配置 |

移动端选 iframe 而不是"导航整个 WebView"的原因：导航走了以后启动器页面就没了，只能靠系统返回键
（Tauri 在 Android 上并不保证把它映射成 WebView 历史后退）；iframe 让启动器和游戏共存，返回入口
永远在，还顺带把各服务器的存储按域名隔离开了。前提是游戏服务器不禁止被内嵌——已确认它不返回
`X-Frame-Options` / `frame-ancestors`。

实现上用一个 `open_game` 命令封装差异，前端按返回的 `mode` 分流：

```rust
#[tauri::command]
fn open_game(...) -> Result<GameTarget, String>;   // GameTarget { mode: "window" | "embed", label, url }
```

- 桌面：`WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))`，label 用 `game-<serverId>`，
  重复点击同一服务器就聚焦已有窗口；「打开后最小化启动器」也在 Rust 侧做（前端不需要 window 权限）。
- 移动：不建窗口，回 `mode = "embed"` 与 url，前端渲染 `#embed-layer`（一条顶栏 + 一个 `allowfullscreen` 的 iframe）。

## 4. 架构与目录

```
src/                     前端（启动器 UI：纯 HTML/CSS/JS，无构建步骤）
  index.html
  styles.css
  main.js                UI 逻辑：渲染地址簿、调后端命令、探测进度
  icon.png               应用图标源图（交给 tauri icon 生成各平台图标）
src-tauri/               Rust 后端
  src/main.rs            入口
  src/lib.rs             Tauri 应用装配（commands、plugins、setup）
  src/state.rs           地址簿 + 设置的内存模型与读写（原子写）
  src/probe.rs           /healthz 探活（std::net 实现，零额外依赖）
  src/commands.rs        暴露给前端的命令
  tauri.conf.json        窗口、CSP、打包配置
  capabilities/          权限（远端页面不授予任何权限）
```

数据流：前端 `invoke('load_state')` → 渲染列表 → `invoke('probe', {host, port})` 拿状态 → 点击 → `invoke('open_game')`。

## 5. 数据模型

配置文件放系统用户配置目录（Windows：`%APPDATA%\top.rakkasei.ezspclient\`；由 Tauri 的 `app_config_dir()` 决定）：

### `servers.json`

```jsonc
{
  "version": 1,                     // schema 版本，升级时用于迁移
  "activeId": "s-3f2a1b",           // 上次使用的服务器（启动时自动探活）
  "servers": [
    {
      "id": "s-3f2a1b",             // 稳定 id，窗口 label / storage 分区用它
      "name": "家里主机",            // 显示名
      "host": "192.168.1.10",       // 只存主机名/IP，不带协议
      "port": 3000,                 // 端口；为 null 表示"自动探测"
      "autodetect": [3000, 80, 54321], // 该条记录上次探测命中的端口顺序（可覆盖全局默认）
      "note": "局域网直连",
      "lastSeenAt": 1760000000000,  // 毫秒时间戳，列表排序/展示用
      "lastLatencyMs": 12
    }
  ]
}
```

### `settings.json`

```jsonc
{
  "version": 1,
  "probePorts": [3000, 80, 54321],  // 未写端口时依次探测的顺序
  "autoProbe": true,                // 启动后自动探活上次使用的服务器（只探活，不自动开窗）
  "gameFullscreen": true,           // 游戏窗口默认全屏
  "isolateStorage": false,          // 每个服务器独立缓存（仅桌面；首次加载会慢一点）
  "minimizeOnConnect": true,        // 打开游戏后把启动器最小化
  "language": "zh"                  // zh / en
}
```

写入策略：**原子写**（先写 `<name>.json.tmp`，`fsync` 后 `rename` 覆盖），避免断电/崩溃留下半个文件；读取失败时回退到默认值并把坏文件重命名为 `.bak` 而不是静默丢弃。

## 6. 地址解析规则

前端解析、后端只收 `host` + `port`，规则单一实现（`main.js` 的 `parseAddress`）：

| 输入 | host | port |
|---|---|---|
| `192.168.1.10` | `192.168.1.10` | `null`（自动探测） |
| `192.168.1.10:3000` | `192.168.1.10` | `3000` |
| `http://192.168.1.10/` | `192.168.1.10` | `80` |
| `https://game.example.com` | `game.example.com` | `443`（v0.1 仅支持 http，给出提示） |
| `[::1]:3000` | `::1` | `3000`（IPv6 字面量） |

校验：host 允许 IPv4 / IPv6 字面量 / 域名（含中文域名的 punycode 不做处理）；端口 1–65535；去掉尾部斜杠与路径（v0.1 不支持子路径，游戏要求挂在根路径）。

## 7. 探活设计

判定标准与游戏本体一致：`GET /healthz` 返回 `{"ok":true,"uptimeSec":N}`（见游戏仓库 `server/http`）。实现要点：

- **纯 `std::net` 实现**（`TcpStream::connect_timeout` + 手写 HTTP/1.1 请求，`Connection: close` 读到 EOF），不引入 HTTP 客户端依赖；用 Tauri 自带的 `serde_json` 解析响应。
- 超时：连接 1.5s、读 2s；探测总时长上限 3s，避免拖住 UI。
- 并发：前端用 `Promise.allSettled` 并发探测（上限 6 个），"全部测速"不会串行卡住。
- 端口自动探测：按 `probePorts` 顺序试，**命中即停**并把结果写回该服务器记录。
- 缓存：`lastSeenAt` / `lastLatencyMs` 持久化，离线时列表仍能显示"上次在线时间"。

## 8. 安全与合规

- **远端页面不授予任何 Tauri 权限**：capabilities 里只对本地启动器页面生效；游戏页面拿不到 IPC。这是外壳类应用最常见的漏洞点。
- CSP：启动器页面限制为 `default-src 'self'`，但**必须额外放行 `frame-src http: https:`** —— 移动端要把游戏内嵌进启动器页面，
  否则会被 `ERR_BLOCKED_BY_CSP` 拦掉（桌面端走独立窗口，看不到这个问题）。
- 移动端：整机锁 `sensorLandscape` + 沉浸式全屏（`WindowInsetsControllerCompat` 隐藏系统栏、下滑可临时唤出），
  因为游戏是横屏的、需要占满整屏；内嵌层只留一个半透明浮标作为返回入口。
- **明文 HTTP**：游戏走 http/ws（无证书），所以必须显式允许明文：Android 需要 `usesCleartextTraffic`/network-security-config，iOS 需要 ATS 例外，桌面无限制。这点在打包移动端时必须做，否则连接会静默失败。
- 配置文件不含任何凭据（只有地址），可以放心导出分享。
- 不采集任何遥测。

## 9. 版本管理约定

- 分支：`main` 保持可构建；功能用 `feat/<主题>`，修 bug 用 `fix/<主题>`。
- 提交信息：[Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：
  `feat: 服务器地址簿支持拖拽排序`、`fix(probe): 读超时未覆盖分块响应`。
- 版本号：SemVer。`0.x` 期间不保证兼容；配置 schema 变化时同时升 `version` 字段并写迁移。
- 发布：更新 `CHANGELOG.md` → 提交 `chore(release): vX.Y.Z` → 打 `vX.Y.Z` tag（附注 tag）。
- `CHANGELOG.md` 按 Keep a Changelog；`[未发布]` 段落随开发累积。

## 10. 后续计划（不在 v0.1）

- 移动端打包（Android 需要 SDK/NDK/JDK；iOS 需要 macOS + Xcode）。
- 服务器列表导入分享（二维码 / 链接）、房间密钥扫码。
- 断线自动重连与延迟曲线、服务器分组与标签筛选。
- 每服务器独立窗口尺寸记忆、多显示器下的全屏选择。
- 自动更新（Tauri updater + 自建静态源）。
