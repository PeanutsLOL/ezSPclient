# 更新日志

本文件格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 性能与移动端兼容

- **后台防发热（P0）**：在 Android 原生生命周期重写 `onPause` / `onResume`，切后台或锁屏时暂停 Chromium JS 定时器（`pauseTimers()`），切回时恢复；彻底消除退后台后游戏循环持续高占用发热的问题
- **系统返回键拦截（P0）**：注册 `OnBackPressedCallback` 拦截物理返回键与手势，优先退出内嵌游戏与模态框，避免误触直接杀死客户端
- **低端设备语法平替（P0）**：前端全盘平替 ES2020 语法（`?.` 与 `??`），Android 7.0~9.0 老旧系统 WebView（Chromium < 80）不再触发 `SyntaxError` 白屏
- **启动脚本异步注入竞态保护（P0）**：`init()` 入口加入 `waitForTauri` 轮询等待，解决老旧内核异步 `evaluateJavascript` 慢于本地页面加载导致的误判退出
- **内嵌游戏 Iframe 资源回收（P1）**：退出内嵌游戏时显式重置 `iframe.src = 'about:blank'`，释放残留的 WebGL 上下文、AudioContext 与 WebSocket
- **本地性能接管与提速开关（实装）**：
  - 设置弹窗新增“开启本地接管与渲染提速（实验性）”持久化开关
  - 开启时硬件级锁定 60Hz 屏幕刷新率（`preferredDisplayMode=3`），降低显示功耗
  - DocumentStart 特权脚本注入：锁定 `devicePixelRatio = 1.5` 与 60 FPS 帧率上限，彻底减轻 2.8K 屏幕下的顶点批处理与光栅化过载
  - 原生层 `shouldInterceptRequest` 劫持 `simWorker.js`，改为线性队列调度，消除 Promise 链堆积与 GC 顿挫；静态大资源本地持久化缓存
- **渲染倍率可调（本轮新增）**：设置弹窗新增「渲染倍率上限」（不限制 / 1.0× / 1.25× / 1.5× / 2.0×，默认 1.5×），
  直接钳制游戏的 `devicePixelRatio`；倍率 ≤ 1.0 时还会把游戏画面质量默认设为「低」（关掉 MSAA 与阴影）。
  实测（MuMu 模拟器 / 成对 canvas）：1.5× → 1.0× 后 Pixi 与 Three 的画布由 `1647×927` 降到 `1098×618`，
  像素量降到 **44%**；同一场景下 Pixi/Three/Spine 的每秒 JS 耗时分别下降约 13%/12%/23%，GC 时间降到原来的 1/6
- **修复：本地接管设置项一直没生效**：`MainActivity` 读的是 `filesDir/settings.json`，而 Tauri 在 Android 上把配置写在
  `dataDir` 根目录，导致「本地接管」与「渲染倍率」两个开关读到的永远是默认值。改读 `dataDir` 后实测
  `devicePixelRatio` 随设置从 1.5 变为 1.0、游戏侧 `sp.pref.settings.quality` 变为 `low`
- **修复：`generated/*.kt` 每次构建被重写导致本地拦截补丁静默丢失**：`tauri android build` 会在编译前重新生成
  `gen/android/.../generated/RustWebViewClient.kt`，之前「打补丁 → 构建」的顺序等于没打（已确认旧包 dex 里没有拦截代码）。
  现在补丁拆到 `tools/patch-client.py`，并由 `app/build.gradle.kts` 里的 `ezspPatchClient` 任务在 Kotlin 编译前重打；
  实测新包 dex 含拦截实现，真机/模拟器上 `fetch('/js/battle/simWorker.js')` 返回的是优化版（含 `Local Interceptor` 标记）

### 迭代二（渲染倍率自适应与缓存治理）

- **渲染倍率新增「自动」档（新默认）**：按设备内存与核心数选倍率 —— `isLowRamDevice` / 总内存 ≤ 4 GB / 核心数 ≤ 4 时用 1.0×，
  其余 1.5×。高配机与原来的 1.5× 完全等价（观感不变），低端机自动省一半像素。实测模拟器（4 核 / 3939 MB / lowRam）
  日志为 `renderScale auto -> 1`，`devicePixelRatio` 生效为 1
- **本地资源缓存治理**：缓存上限 256 MB、超限按最后修改时间淘汰；缓存文件名改为「双路 hash + 原扩展名」，
  避免长 URL 截断后互相覆盖；只缓存二进制资源（字体/贴图/音频/Spine），**js/css/json 一律不缓存**，
  保证游戏更新后能拿到新代码
- **修复：计量网络下重复下载**：原来每次缓存未命中都会在后台为同一 URL 再拉一份，和 WebView 自身的下载重复。
  现在只在非计量网络（`NET_CAPABILITY_NOT_METERED`）才预热，蜂窝网络下不再产生双倍流量
- **修复：拦截器实现只存在于可再生的 `gen/` 里**：`LocalInterceptor.kt` 之前只写在 `src-tauri/gen/`（被 gitignore），
  新克隆仓库跑 `android:init` 会因为 `MainActivity` 引用不到它而编译失败。现在源码放在 `tools/android/LocalInterceptor.kt`，
  由 `patch-client.py` 在每次构建前复制进生成工程，`gen/` 保持“随时可删可重建”
- 诊断：`LocalInterceptor` 在 logcat（tag `ezSPclient`）打印倍率决策与缓存命中/未命中（限前 20 条）

### 迭代三（撤掉重复的素材缓存，改攻 CPU 侧）

- **撤掉外壳自建的素材磁盘缓存**：游戏自己已经用 CacheStorage 持久化素材（`js/assetCache.js` 的
  `cache.put(url, response)`，配套「下载完整素材 / 导入素材包 / 申请持久化存储」），外壳再存一份是双倍占用、
  双倍下载；而且 CacheStorage 的读取不经过 `shouldInterceptRequest`，那层缓存几乎打不中。现在 `LocalInterceptor`
  只做 JS 改写，不碰任何素材
- **修复：拦截补丁在构建时被 `rustBuild*` 覆盖**（上一轮“已修复”其实没有）：`tauri android build` 里
  `rustBuild*` 任务会在 Kotlin 编译前重新生成 `generated/*.kt`，只靠 `compileKotlin dependsOn patch` 仍会被冲掉。
  现在给 `rustBuild*` 加 `finalizedBy("ezspPatchClient")` + 给补丁任务加 `mustRunAfter`。
  实测：构建结束后 `RustWebViewClient.kt` 仍是 `CLIENT PATCHED`，运行期 logcat 出现 `[intercept] interceptor active`
- **`simWorkerRuntime.js` 单点改写**：把 `Array(b.enemies?.length || 0).fill(null)` 换成 `new Array(...)`。
  消费方只取 `.length`（`runner.js` 的 `uniteLeftMark`），原写法每个包都要写满 n 个指针。
  实测：首次请求返回原版（4787 B），后台改写落盘后再次请求即为改写版（含 `new Array(b.enemies`、无 `fill(null)`）
- **帧率自适应降档**：注入的 rAF 节流器统计帧间隔 EMA，连续 150 帧仍慢于 20 ms（≈<50 fps）时把上限从 60 压到 30，
  只降不升避免抖动。跑得动的设备完全不变；跑不动的设备少排一半无效帧。实测注入已生效
  （`requestAnimationFrame.toString()` 含该逻辑），这台模拟器场景下 EMA 未越阈值故未触发
- **内嵌时摘掉启动器界面**：游戏 iframe 与启动器共享同一个渲染进程与主线程，内嵌后给 `body` 加
  `is-embedded`，把 `.topbar / .layout / .statusbar` 设为 `display:none`。实测内嵌时
  `getComputedStyle('.layout').display === 'none'`，退出后恢复 `grid`、`#embed-layer` 已移除

### 迭代四（真机实测：撤掉两处「自以为省电」的改动）

在 Redmi 25053RT47C（Android 16 / WebView 156 / 1280×2772 / DPR 3.25 / 8 核 / 11233 MB）上接入 CDP 实测：

- **撤掉「钉死 60Hz 屏幕刷新率」**：同一画面（`gm--prep` 商店阶段）对比 —
  钉 60Hz 时 WebView 的 rAF 只有 **30 fps**；恢复面板默认刷新率后 **59.9 fps**；完全关掉接管的基线是 120.5 fps。
  也就是说「把面板钉到 60Hz」在这台机器上等于把 vsync 减半，观感直接崩掉。省电改由渲染倍率与画质承担
- **撤掉 rAF「自适应降档到 30fps」**：真机上它一旦因启动抖动越阈值就永久锁 30fps（只降不升），属于自伤
- 保留并实测有效的项：`renderScale auto → 1.5`（8 核 / 11 GB 判为高配）、`devicePixelRatio` 在游戏 iframe 内生效为 1.5、
  `[intercept] interceptor active`、`simWorker.js` 被替换为优化实现、注入层成功抓到 Pixi 实例（`__ezspRender()` 可读 fps/resolution）
- 真机（接管开、无刷新率锁、1.5 倍率）复测：**59.9 fps 稳定**，`gfxinfo` 50th **11 ms**（钉 60Hz 时是 17 ms），GPU 50th 3 ms，
  整机 CPU ≈105%（接管关闭时为 129%，但那是以 120 fps 跑的，场景与帧率都不同，不能直接当同比）
- **排除的怀疑**：曾怀疑浮球（`box-shadow` + `translateZ` + 半透明）压着 WebGL 导致掉帧，
  用「每秒窗口」方式连测 12 秒发现 fps 与浮球显隐无关（59/60/57 → 30/30/30），该假设不成立

### 迭代五（真机 168 秒温度/CPU 对照：接管确实降温）

同一张图（独立模拟 / 标准模拟 AC-1）、同一套自动化、各 168 秒，用 `tools/sample-heat.ps1` 每 5 秒采样
（电池温度 / CPU 各核温度 / 进程累计 CPU 秒数）：

| 配置 | 进程 CPU | 平均占用核数 | 电池温度 | CPU 均温 |
|---|---|---|---|---|
| 接管开（DPR 1.5 / 60fps） | 179.2 s | **1.07 核** | 40.1 → **40.6 ℃**（峰值 40.7） | 66.4 → **64.7 ℃**（不升反降） |
| 接管关（DPR 3.25 / 120fps） | 216.2 s | **1.29 核** | 40.5 → **42.5 ℃**（峰值 42.5） | 70.6 → **76.0 ℃**（仍在爬升） |

结论：CPU 时间 **−17%**；接管关的一组在三分钟内电池温度 +2.0 ℃、CPU 均温 +5.4 ℃ 且未见平台，
接管开的一组两项都基本走平。注意接管开是先跑的那组（起始更热），所以这个对比对结论是偏保守的。

- 新增 `tools/sample-heat.ps1`：抓 `dumpsys thermalservice`（电池/CPU 温度）+ `/proc/<pid>/stat`（累计 CPU  ticks）
  + 当前界面，输出 CSV 并给出「平均占用核数」。比瞬时 `top %CPU` 稳定得多

### 工具

- 新增 `tools/cdp.mjs`：本机 WebView2 / Android WebView 的 CDP 客户端（`list` / `eval` / `contexts` / `nav` / `logs` / `profile` / `metrics`）
- 新增 `tools/prof.mjs`：解析 `.cpuprofile`，输出自耗时排行与按文件归类（含 idle / GC / program 占比）
- 新增 `tools/patch-client.py`：单独给 `generated/RustWebViewClient.kt` 打本地拦截补丁（幂等，构建期由 Gradle 调用）

### 变更

- **内嵌游戏的地址浮球改为可贴边收起**：收起时是一颗 40px 的圆球，永远吸在屏幕的**任意一条边**
  （左 / 右 / 上 / 下）上，只显示图标与在线状态点；单击在球旁边展开卡片（地址、延迟、返回按钮），
  闲置 4 秒自动贴边收起，卡片底部有倒计时进度条
- **拖到哪条边就贴哪条边**：松手时按距离吸附到最近的边，位置只记"贴哪条边 + 沿边偏移"，
  旋转屏幕、改窗口尺寸都不会把球丢到画面外；0.2.2 存的绝对坐标会自动迁移
- **返回启动器改为卡片上的显式按钮**：再点浮球只是收起卡片，不再直接退出 —— 对局中不会因为
  误触浮球而中断；点一下展开中的卡片可以重新计时，方便多看两眼
- 浮球会避开刘海 / 挖孔的安全区（`env(safe-area-inset-*)` 探针），展开的卡片按剩余空间自适应宽度

### iOS

- **iOS release 构建链路**：新增 `.github/workflows/ios-release.yml`（`macos-15` + Xcode 16）：
  `tauri ios init` → 无签名 archive → 有 Apple secrets 时用 `xcodebuild -exportArchive` 导出签名 IPA；
  没有 secrets 时产出未签名 `.ipa` / `.xcarchive`，可在本地重签后安装
- **`src-tauri/Info.ios.plist`**：由 `tauri ios build` 自动合并 —— ATS 放行明文 HTTP、本地网络用途说明、
  锁横屏 + 全屏（对应 Android 的 `sensorLandscape` + 沉浸式）
- **`tools/sync-ios-icons.py`**：`tauri ios init` 用的是模板占位图标，构建前把 `src-tauri/icons/ios`
  同步进去（`pnpm ios:init` 会自动调用）

## [0.2.2] - 2026-10-12

### 变更

- **内嵌游戏的地址浮标改为两步操作**：单击先展开成小卡片（显示地址、在线状态与延迟），
  **再次点击才返回启动器** —— 之前单击直接退出，对局中很容易误触
- 浮标**可拖动**，位置记在本地（`localStorage`）；展开或旋转屏幕后会自动夹回视口内

## [0.2.1] - 2026-10-12

在真机（Redmi 25053RT47C / Android 16 / arm64-v8a）上把整套流程跑通后修掉的一批移动端问题。

### 修复

- **窄屏布局**：手机竖屏下双栏被挤扁（详情栏只剩一条，文字竖排）。现在窄屏改单栏两视图
  —— 点服务器进详情、详情里有「返回列表」
- **游戏必须全屏**：游戏是横屏的，现在整机锁 `sensorLandscape` 并进沉浸式全屏
  （隐藏状态栏与导航栏，下滑可临时唤出）
- **内容被系统栏遮住**：`viewport-fit=cover` + `env(safe-area-inset-*)`，标题不再压在状态栏底下
- **内嵌游戏被 CSP 拦掉**：启动器 CSP 里的 `default-src 'self'` 同时限制了 `frame-src`，
  真机上表现为 `net::ERR_BLOCKED_BY_CSP`。补上 `frame-src http: https:`
  （桌面端游戏走独立窗口、不经过启动器 CSP，所以之前没暴露）
- 内嵌层从整条顶栏改为一个半透明浮标（`‹ 服务器名`），全屏下把画面都留给游戏

### 变更

- `tools/patch-android.py` 现在补四处模板缺失：release 明文 HTTP、release 签名、锁横屏、沉浸式全屏

### 验证（真机）

添加服务器 → 探活 `在线 / 75 ms` → 进入游戏（游戏内显示「已连接服务器」，WebSocket 通）
→ 选模式/难度、输入代号开局（`PhoneTest DOCTOR #4542`，触控与键盘输入正常）
→ 点浮标返回启动器（状态保留）

### 文档

- 公开到 GitHub 前脱敏：README / CHANGELOG / 界面示例里的真实服务器地址改成 `game.example.com`；
  截图裁掉本机用户目录路径与真实地址（截图用中性示例数据重新生成）
- 明确许可证：**Unlicense**（公有领域；见 [LICENSE](LICENSE)）
- `.gitignore` 补上 `.env` / `credentials*.json` / `*.pem` / `*.p12` 等凭据类文件的兜底规则

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
