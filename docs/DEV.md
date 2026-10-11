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

## 6. 移动端（Android / iOS）

### Android

除第 1 节的要求外，还需要（下表是本机已验证的组合）：

| 组件 | 版本 / 位置 | 说明 |
|---|---|---|
| JDK | **21**（`C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`） | Gradle 9 + AGP 不认 JDK 25。用 `winget install Microsoft.OpenJDK.21`（Temurin 从 GitHub 拉，国内常失败） |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` | 需要 `platforms;android-37.0` 和 `build-tools;37.0.0`（CLI 模板里 `compileSdk = 37`、`minSdk = 24`） |
| NDK | `ndk/27.3.13750724` | Rust 交叉编译要用；模板不 pin 版本，`NDK_HOME` 指到它即可 |
| Rust targets | `aarch64-linux-android`、`armv7-linux-androideabi`、`i686-linux-android`、`x86_64-linux-android` | `rustup target add …` |

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_HOME = $sdk
$env:NDK_HOME     = "$sdk\ndk\27.3.13750724"
$env:JAVA_HOME    = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:JAVA_HOME\bin;$env:Path"

pnpm android:init          # tauri android init --ci && python tools/patch-android.py
pnpm android:dev           # 连上手机/模拟器直接跑
pnpm android:build:debug   # 可安装的 debug APK（arm64）
pnpm android:build         # release APK（需要签名，见下）
```

**Windows 上必须先开「开发人员模式」**：Tauri 在打包时会把交叉编译出来的 `.so`
**符号链接**进 `jniLibs/`，没有开发者模式会直接失败：

```
Failed to create a symbolic link ... Creation symbolic link is not allowed for this system.
```

开启方式：设置 → 系统 → 开发者选项 → 开发人员模式；或以管理员身份执行

```powershell
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /v AllowDevelopmentWithoutDevLicense /d 1 /f
```

开启后**不需要重新登录**，新起的进程立刻可用（实测过）。硬链接、复制都不行 —— Tauri 会先删掉目标再建符号链接。

**Gradle 发行包下载**：`gradlew` 首次运行要从 `services.gradle.org` 下 `gradle-9.6.1-bin.zip`
（约 134 MB），国内经常超时。两个办法：

```powershell
# 办法一：从镜像下载后放进 wrapper 的缓存目录，让它跳过下载
$ver = 'gradle-9.6.1-bin'; $dir = Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\$ver" -Directory | Select-Object -First 1
Invoke-WebRequest "https://mirrors.cloud.tencent.com/gradle/$ver.zip" -OutFile "$($dir.FullName)\$ver.zip"

# 办法二：改 src-tauri/gen/android/gradle/wrapper/gradle-wrapper.properties 里的 distributionUrl 指向镜像
```

**明文 HTTP 必须处理**：`tauri android init` 生成的 `app/build.gradle.kts` 里，
`usesCleartextTraffic` 在 **debug 是 `true`、release 是 `false`**（manifest 用
`${usesCleartextTraffic}` 占位符）。游戏服务器是明文 HTTP，release 不改就会静默连不上
（请求被系统掐掉，页面报错也不明显）。因为 `src-tauri/gen/` 是可再生的（被 gitignore），
这一步交给幂等的 `tools/patch-android.py`，`pnpm android:*` 会自动调用。

**release 签名**：模板不带任何签名配置，所以脚本会在 `keystore.properties` 存在时
自动往 `app/build.gradle.kts` 里插入 `signingConfigs` 并挂到 release 构建类型上。生成 keystore：

```powershell
$keytool = "$env:JAVA_HOME\bin\keytool.exe"      # JDK 21 自带的 keytool
$dir = "$env:USERPROFILE\.ezspclient"; New-Item -ItemType Directory -Force $dir | Out-Null
& $keytool -genkeypair -v -keystore "$dir\ezspclient-release.jks" -alias ezspclient `
  -keyalg RSA -keysize 2048 -validity 10000 -storepass <你的密码> -keypass <你的密码> `
  -dname "CN=ezSPclient, O=ezSPclient, C=CN"
```

然后在 `src-tauri/gen/android/keystore.properties` 里写（**路径用正斜杠**，java.util.Properties
会把反斜杠当转义符；这个文件和 keystore 都不要入库）：

```properties
storeFile=C:/Users/<你>/.ezspclient/ezspclient-release.jks
storePassword=<你的密码>
keyAlias=ezspclient
keyPassword=<你的密码>
```

keystore 丢了就没法给同一个包名（`top.rakkasei.ezspclient`）发布更新，只能让用户卸载重装 —— 自己留好备份。

**移动端窗口模型**：没有多窗口，`open_game` 返回 `mode = "embed"`，前端用全屏 iframe 内嵌游戏，
顶部留一条「返回启动器」（Android 返回键 / ESC 也一样）。iframe 天然按域名隔离各服务器的存储，
所以移动端不需要桌面那套 `isolateStorage` 配置。

### iOS

需要 macOS + Xcode，Windows 上无法构建。代码已经按 `#[cfg(mobile)]` 分支写好，
在 macOS 上 `pnpm tauri ios init` 后即可；同样要注意明文 HTTP 需要在 `Info.plist`
里加 ATS 例外（`NSAppTransportSecurity` → `NSAllowsArbitraryLoads`）。

## 7. 常见问题

| 现象 | 处理 |
|---|---|
| `link.exe not found` / `LINK : fatal error` | 没装 C++ 工具集，或装了但 vswhere 查不到；按第 1 节检测并安装 |
| `failed to find WebView2` | 装 WebView2 Runtime（Win10 老系统常见） |
| 首次 `cargo build` 很慢 | 正常：要编译约 400 个 crate，5–15 分钟；之后增量构建是秒级 |
| `pnpm dev` 窗口空白 | 打开 devtools 看控制台；多半是 `index.html` 路径或 CSP 问题 |
| 想重置全部状态 | 删掉配置目录下的两个 json（界面里的"清空数据"也会做同样的事） |
