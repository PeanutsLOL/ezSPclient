# 更新日志

本文件格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.2.0] - 2026-10-12

移动端打包（Android）。桌面端行为不变。

### 新增

- **Android 支持**：`pnpm android:init` / `android:dev` / `android:build`（arm64 release APK，实测 5.54 MB，
  V2 签名）；运行需要 JDK 21 + Android SDK（platform/build-tools 37）+ NDK 27.3 + 四个 Rust android target，
  详见 [docs/DEV.md](docs/DEV.md) 第 6 节
- 移动端窗口模型：没有多窗口，`open_game` 改为返回 `{ mode, label, url }`。移动端用全屏 iframe 内嵌游戏，
  顶部保留「返回启动器」（Android 返回键 / ESC 同样可用）；iframe 按域名天然隔离各服务器存储
- `tools/patch-android.py`：`gen/android` 是可再生的，用它幂等地补两处模板缺失
  —— **release 的明文 HTTP**（模板只给 debug 开 `usesCleartextTraffic`，游戏服务器是明文 HTTP）
  和 **release 签名配置**（模板完全不带签名，有 `keystore.properties` 时才注入）

### 修复

- 注入签名配置时不能用 `java.util.Properties()`：Kotlin DSL 里 `java` 会解析成 Gradle 的 `Project.java`
  扩展，导致 `Unresolved reference 'util'`；改用文件顶部 import 进来的 `Properties`

### 文档

- `docs/DEV.md` 第 6 节写下这轮踩到的坑：Windows 必须开**开发人员模式**（Tauri 要建符号链接）、
  Gradle 发行包走镜像下载、keystore 与 `keystore.properties` 的写法与存放位置
- `docs/DESIGN.md` 第 3 节改为 iframe 内嵌方案，并说明为什么不用"导航整个 WebView"

## [0.1.0] - 2026-10-12

第一个可用版本：把《卫戍协议：盟约》网页版包成桌面客户端，解决"多台服务器之间来回切换"的问题。

### 新增

- **服务器地址簿**：手动添加 / 编辑 / 删除，一键切换，记住上次使用的服务器
- **地址解析**：`192.168.1.10`、`192.168.1.10:3000`、`http://game.example.com/`、IPv6 字面量都支持
- **端口自动探测**：地址里不写端口时依次尝试 3000 / 80 / 54321，命中即停并把结果写回地址簿
- **探活与延迟**：请求服务器的 `/healthz`，列表里显示在线状态、毫秒延迟和上次在线时间；支持一键全部测速
- **配置本地持久化**：`servers.json` / `settings.json` 放在系统配置目录，原子写入（临时文件 + fsync + rename），
  文件损坏时备份为 `.bak` 并回退默认值
- **游戏窗口**：独立窗口打开游戏，可全屏；打开后按设置最小化启动器；重复点击同一服务器只会聚焦已有窗口
- **缓存隔离**：可选让每台服务器使用独立的 WebView 数据目录，房间密钥与缓存互不影响
- **房间密钥直连**：输入 4 位同盟密钥直接进房（`?room=KEY`）
- **配置导入 / 导出**：JSON 文本框（WebView 里剪贴板不可靠），导入按 `地址:端口` 去重合并
- **中英双语界面**：右上角一键切换，选择会被记住

### 安全

- 远端游戏页面**不授予任何 Tauri IPC 能力**（capabilities 只作用于启动器窗口、不声明 `remote`）
- 启动器页面使用严格 CSP；配置文件中不含任何凭据

### 已知限制

- v0.1 只支持明文 HTTP 的游戏服务器（不支持 https）
- 移动端（Android / iOS）与桌面共用同一套代码，但尚未打包验证；移动端为单 WebView 导航模型，
  没有多余窗口，详见 [docs/DESIGN.md](docs/DESIGN.md) 第 3 节
