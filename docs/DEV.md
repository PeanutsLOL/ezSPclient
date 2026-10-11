# 开发说明

## 1. 环境要求

| 组件 | 版本 | 用途 | 检查方式 |
|---|---|---|---|
| Rust（stable-msvc） | ≥ 1.77.2 | 编译后端 | `rustc --version` |
| MSVC C++ 生成工具 | VS 2022 生成工具或 VS Community（含 `VC.Tools.x86.x64`） | 链接 Rust 产物 | 见下方"检测" |
| WebView2 Runtime | 任意较新版本 | 运行窗口（Win10/11 通常自带） | 见下方"检测" |
| Node.js + pnpm | Node ≥ 18 | 只用 Tauri CLI，不参与构建前端 | `node -v` / `pnpm -v` |

Linux 需要 `webkit2gtk-4.1`、`libayatana-appindicator3` 等（见 Tauri 官方前置要求）；macOS 需要 Xcode Command Line Tools。

### 检测 MSVC 是否就绪

```powershell
# 列出具名 C++ 工具集的 VS 实例（有输出就说明不用再装）
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" `
    -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
```

有输出即可；Rust 会自己通过注册表/vswhere 找到 `link.exe`，**不需要**在"Developer Command Prompt"里构建。
如果确实没有，装生成工具（约 2–4 GB，需要管理员权限）：

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override `
  "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

### 安装 Rust（Windows）

```powershell
winget install Rustlang.Rustup        # 装 rustup
rustup default stable-x86_64-pc-windows-msvc
```

> ⚠️ 注意：`winget install Rustlang.Rustup` 在**没有终端的自动化环境**（CI、后台任务）里会卡在
> `rustup-init` 的交互确认上。那种场景直接下载安装器并加 `-y`：
>
> ```powershell
> curl.exe -L -o "$env:TEMP\rustup-init.exe" https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
> & "$env:TEMP\rustup-init.exe" -y --profile default --default-toolchain stable-x86_64-pc-windows-msvc
> ```

## 2. 开发与构建

```bash
pnpm install            # 只装 @tauri-apps/cli

pnpm dev                # = tauri dev：编译并以调试模式启动（前端改动即时生效）
pnpm build              # = tauri build：生成安装包
pnpm check              # = cargo check：只做类型/借用检查，比完整构建快
pnpm fmt                # = cargo fmt
pnpm lint               # = cargo clippy
pnpm test               # = cargo test（probe/config 的单元测试）
```

前端没有构建步骤：`src/` 下的 HTML/CSS/JS 直接由 Tauri 加载（`frontendDist` 指向 `src`），
后端命令通过 `window.__TAURI__.core.invoke` 调用（`withGlobalTauri: true`，不需要打包 JS SDK）。

产物位置：

| 平台 | 路径 |
|---|---|
| Windows | `src-tauri/target/release/bundle/msi/*.msi`、`.../nsis/*-setup.exe` |
| macOS | `src-tauri/target/release/bundle/dmg/*.dmg` |
| Linux | `src-tauri/target/release/bundle/deb/*.deb`、`.../appimage/*.AppImage` |

## 3. 图标

应用图标是脚本生成的，不依赖设计工具：

```bash
python tools/make-icon.py        # 生成 src/icon.png（1024×1024，纯标准库）
pnpm icon                        # = tauri icon src/icon.png，派生各平台图标到 src-tauri/icons/
```

改了徽记配色/形状就改 `tools/make-icon.py` 里的常量，然后重跑这两条命令；`src-tauri/icons/` 需要一起提交。

## 4. 配置与数据位置

启动器把两个 JSON 放在系统配置目录（`app_config_dir()`）：

| 平台 | 目录 |
|---|---|
| Windows | `%APPDATA%\top.rakkasei.ezspclient\` |
| macOS | `~/Library/Application Support/top.rakkasei.ezspclient/` |
| Linux | `~/.config/top.rakkasei.ezspclient/` |

- `servers.json` —— 地址簿（可安全分享，不含凭据）
- `settings.json` —— 本机设置
- 写入是原子的（临时文件 + rename）；文件损坏时会重命名为 `*.bak` 并回退默认值
- 每个服务器的独立缓存（勾选"独立缓存"时）在 `app_local_data_dir()/profiles/game-<id>/`

界面右下角会显示当前配置目录，方便排查。

## 5. 调试

- 启动器窗口：`F12` 或右键 → 检查（仅调试构建；发布构建里 devtools 默认关闭）。
- 游戏窗口：按 `Ctrl+Shift+I`（调试构建）。
- Rust 日志：`RUST_LOG=debug pnpm dev`。
- 探活不通过时先手动验一遍游戏服务器：
  `curl http://<地址>/healthz` 应返回 `{"ok":true,...}`。

### 没有真实服务器时怎么调

```bash
python tools/fake-health-server.py --port 3000     # 只在 127.0.0.1:3000 应答 /healthz
```

它把收到的每个请求写进 `probe-hit.log`（含 `Host` 与 `User-Agent`）。把 `127.0.0.1:3000`
加进地址簿，就能验证「前端 → IPC → Rust 探活 → HTTP」整条链路：日志里出现
`UA=ezSPclient/…` 的 `/healthz` 行即为通。这条链路也是发布前的验收步骤之一。

## 6. 移动端

Tauri v2 支持 Android / iOS，但需要额外工具链（v0.1 未验证）：

```bash
# Android：需要 JDK 17/21、Android SDK + NDK，并设置环境变量
export ANDROID_HOME=<sdk>  NDK_HOME=<sdk>/ndk/<ver>
pnpm tauri android init
pnpm tauri android dev
```

移动端的两点差异（见 [DESIGN.md](DESIGN.md) 第 3 节）：

1. 没有多窗口，打开游戏是**导航当前 WebView**，返回启动器用系统返回键。
2. 游戏走明文 HTTP，Android 需要开启 `usesCleartextTraffic`（或 network-security-config），
   iOS 需要 ATS 例外，否则连接会静默失败。

## 7. 常见问题

| 现象 | 处理 |
|---|---|
| `link.exe not found` / `LINK : fatal error` | 没装 C++ 工具集，或装了但 vswhere 查不到；按第 1 节检测并安装 |
| `failed to find WebView2` | 装 WebView2 Runtime（Win10 老系统常见） |
| 首次 `cargo build` 很慢 | 正常：要编译约 400 个 crate，5–15 分钟；之后增量构建是秒级 |
| `pnpm dev` 窗口空白 | 打开 devtools 看控制台；多半是 `index.html` 路径或 CSP 问题 |
| 想重置全部状态 | 删掉配置目录下的两个 json（界面里的"清空数据"也会做同样的事） |
