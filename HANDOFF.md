# HANDOFF — 交接文档

> 写给下一个窗口的开场。读完这份就能直接接着干，不用重看长对话。
> 最后更新：2026-11-03 · `main` @ `0ad4089`

---

## 0. 一句话现状

**手机发热/白屏的问题已经修完并发布了 v0.3.0**（真机量化验证）；当前 `main` 上另有 9 个
「测试环境 + 采样脚本」的提交**未发布**（只动工具与文档，没动应用代码，不需要重新出包）。

眼下正在做的事：**用可控波次的本地压力服务器，在模拟器上做渲染负载的 A/B**。
4K 下已拿到稳定结论（接管开 0.38 核 vs 关 0.53 核，战斗段 −28%），
但「长时间高负载」还需要自动部署防守才做得到，这一步没做。

---

## 1. 版本与分支状态

| 项目 | 状态 |
|---|---|
| `main` | `0ad4089`，与 `origin/main` 同步 |
| 已发布 | **v0.3.0**（tag `v0.3.0`，GitHub Release 已建，3 个资产：arm64 APK / x64 setup.exe / x64 msi） |
| v0.3.0 之后的提交 | 9 个，全部是 `testserver/`、`tools/`、`docs/`、`.gitignore`、`README` —— **`src/` 与 `src-tauri/src` 零改动** |
| 其他分支 | `ci/ios-release`（内容已并入 main，远端还留着，可删） |
| 工作区 | 干净 |

推送注意：这台机器直连 GitHub 会拿到代理的 fake-IP，必须用 SOCKS5：

```powershell
$env:HTTPS_PROXY='socks5h://127.0.0.1:7897'
$env:HTTP_PROXY='socks5h://127.0.0.1:7897'
git push origin main        # 必须 socks5h://，http:// 或 -c http.proxy=... 都不行
```

---

## 2. 已完成并验证的结论（可直接引用，别重测）

### 2.1 v0.3.0 的真机结果（Redmi 25053RT47C / Android 16 / WebView 156）

同一张图、同样 168 秒墙钟对照：

| | 接管关 | 接管开 |
|---|---|---|
| 进程 CPU | 216.2 s（1.29 核） | **179.2 s（1.07 核）** |
| 电池温度 | 40.5 → 42.5 ℃ | **40.1 → 40.6 ℃** |
| CPU 均温 | 70.6 → 76.0 ℃（仍在爬） | **66.4 → 64.7 ℃（走平）** |

同时修掉两个 P0：后台 `pauseTimers`（退后台不再烧）、老旧内核白屏（ES2020 平替 + 启动竞态）。

### 2.2 模拟器 4K 的渲染 A/B（MuMu，2160×3840 / 490 dpi，warm cache，40 只/轮）

只统计 `gm--combat` 相位：

| 接管 | in-game dpr | canvas | 战斗段 CPU | 整局 |
|---|---|---|---|---|
| **开** | **1.0** | 1254×706 | **0.38 核**（21.1 s / 56 s） | 0.41 核 |
| **关** | 3.0625 | 2508×1412 | **0.53 核**（28.3 s / 53 s） | 0.57 核 |

重复多次一致：开 0.35 / 0.38，关 0.53 / 0.56 → **−28%~−33%**。

### 2.3 已被证伪的假设（别再试）

- **堆怪提高压力**：20 只/轮 → 120 只/轮，CPU 0.32 → 0.29 核，**没用**。
  原因：rAF 钳 60fps + 模拟器 GPU 快；且没有防守时漏怪上限很快到，对局提前结束，
  采样反而大量落在准备/结算页。
- **60Hz 屏幕锁省电**：实测让 rAF 掉到 30fps，已撤。
- **rAF 自适应降档**：会不可逆地锁 30fps，已撤。
- **自己做素材缓存**：游戏已用 CacheStorage 缓存（18534/18561），重复实现只会双下载。

---

## 3. 代码与工具地图

### 应用侧（v0.3.0 的内容，已发布，别乱动）

| 路径 | 作用 |
|---|---|
| `src-tauri/src/state.rs` | `Settings`（新增 `performance_acceleration`、`render_scale`） |
| `tools/patch-android.py` | **权威来源**。`src-tauri/gen/` 每次构建都会重新生成，所有 Android Kotlin 改动必须写在这里 |
| `tools/patch-client.py` + `tools/android/LocalInterceptor.kt` | 本地劫持（`shouldInterceptRequest`）：替换 simWorker 队列、改 simWorkerRuntime 单点 |
| `src/main.js` / `src/index.html` | 启动器 UI；设置里有渲染倍率与「本地接管」开关 |

### 测试环境侧（v0.3.0 之后新增，当前主要工作面）

| 路径 | 作用 |
|---|---|
| `testserver/server.mjs` | 代理（3000）→ 上游游戏服务器（3100）；替换 `/data/waves.json`；启动时自检两份素材清单 |
| `testserver/patch-waves.mjs` | `NODE_OPTIONS=--import` 在上游启动前接管 `fs.readFileSync`，让**服务端**用改过的波次 |
| `testserver/waves.mjs` | 波次改写逻辑（按 `usedBy` 匹配 mode+round，重算 `totalCount`/`slotCounts`） |
| `testserver/stress.json` | 配方：`mode_single_normal`、9 轮、2×20 只、第 9 轮 2×28 |
| `testserver/setup.ps1` | 克隆上游 → `npm ci` → 素材（copy/link/download/extract）→ local-assets → 覆盖率闸门 |
| `testserver/asset-coverage.py` | 按类别统计覆盖率，美术 <95% 直接失败（含 `local/official`） |
| `tools/stress.ps1` | 一键跑：healthz → adb reverse → 进局 → 采样（温度/tick/相位）→ 汇总 |
| `tools/sample-heat.ps1` | 5 秒一条的温度/CPU 采样器（被 stress.ps1 调用，也可单独用） |
| `tools/cdp.mjs` / `tools/prof.mjs` | CDP 客户端（eval/contexts/profile/metrics）与 cpuprofile 解析 |

### 文档

- [docs/STRESS.md](docs/STRESS.md) —— 压力测试环境、相位采样、缓存策略、调压杠杆
- [testserver/README.md](testserver/README.md) —— 两份素材清单、`-lite` 为什么不能用、配方写法
- [docs/ROADMAP.md](docs/ROADMAP.md) —— 未来计划（P1 合成侧 / P2 游戏侧小优化 / P3 低端机 / P4 工程）
- [CHANGELOG.md](CHANGELOG.md) —— 0.3.0 全量记录与实测数字

---

## 4. 环境前置（下个窗口先确认这些）

```powershell
# 1) 设备在不在（模拟器要自己先启动 MuMu）
adb devices            # 真机 e9c8f40f / 模拟器 127.0.0.1:16384

# 2) 压力服务器起没起（上次会话结束时是停的）
Get-NetTCPConnection -LocalPort 3000 -State Listen
#    没起就：node testserver/server.mjs    （最好用 Start-Process 重定向到 .tmp/stress-logs/server.log，
#    不要用 `| Select-Object -First N`，管道关闭会让 node 收到 EPIPE 直接退出）
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/__stress/info      # 看 rounds / assets 两项

# 3) 设备侧端口映射
adb -s <serial> reverse tcp:3000 tcp:3000
```

当前模拟器环境（若被重置，需重新确认）：`2160x3840` / `490 dpi` / 4 核 / 3939 MB → `renderScale=auto` 解析为 **1.0**。

---

## 5. 复现一次测量

```powershell
# 起压力服务器（另开窗口，或用 Start-Process 重定向日志）
node testserver/server.mjs

# A 组：接管开（脚本会自己写 performanceAcceleration=true 并重启应用）
powershell -File tools/stress.ps1 -Serial 127.0.0.1:16384 -Label emu4k-on -Seconds 70

# B 组：接管关
powershell -File tools/stress.ps1 -Serial 127.0.0.1:16384 -Label emu4k-off -Seconds 70 -AccelOff
```

产物在 `.tmp/stress/<label>-<时间戳>/`：

- `summary.txt` —— 其中 **`combat-only`** 才是可比的数（整局会被准备/结算稀释）
- `metadata.txt` —— `wm size` / `wm density` / **launcher 的** dpr / 生效设置
- `samples.csv` —— 每 5 秒一条，含 `screen` 列
- `phase.csv` —— 每 3 秒一条（界面 + 进程 CPU 秒），用于事后按相位切窗口
- `combat.cpuprofile` —— 中段 20 秒的主线程 profile

⚠️ `metadata.txt` 的 `dpr` 是**启动器页面**的，不是游戏 iframe 的。要确认钳位是否生效，
必须在游戏 context 里读（见 §6 第 9 条）。

---

## 6. 踩过的坑（下个窗口别再踩）

1. **`.ps1` 必须存成 UTF-8 with BOM**。Windows PowerShell 5.1 无 BOM 会按 ANSI 读，中文直接语法错误。
   仓库里有 `.tmp/fix_ps1_bom.py` 这种一次性脚本可以照抄思路。
2. **`Adb @("a","b")` 会把数组当单个参数**。用 `& $adb @args` 形式，调用端写 `Adb a b`。
3. **game iframe 的 `contextId` 会变**（reload、重建页面都会换）。必须每次从 `cdp.mjs contexts`
   按 origin 动态解析，不能写死 `--context=3`。
4. **`snap` 不会因为 `invoke('add_server')` 自动刷新**。脚本直接改 Rust 状态后必须先
   `refresh(await invoke('load_state'))`，否则 `connect()` 里 `findServer` 返回假 → 静默 return，iframe 永不出现。
5. **「准备就绪」是两步**：第一下弹确认框，第二下才开打。只点一次会一直停在准备页。
6. **结算页的按钮是「下一步」**，不是「返回/离开」。重跑前要一路点到 `title-screen` 为止。
7. **别用 `pm clear` 清会话**：它会把 WebView 缓存（18534 个文件）一起清掉，4K 下重拉极慢。
   会话恢复靠 §6 第 6 条解决。
8. **`connect()` 在 `server.port == null` 时会走探测**，探测失败就 toast 后返回。压测用的服务器
   一律显式带端口。
9. **确认 DPR 钳位生效要看游戏 context**：`dpr=1` + canvas 1254×706 才算生效；
   启动器页面永远是物理 dpr（3.0625）。
10. **`npm run assets` 会改写 `data/assets.json`**（克隆内部 `git status` 会脏，不影响使用）；
    有 27 个 sfx 在社区 dump 里本来就没有。
11. **代理只改 HTTP 层是骗不到服务端的**：`b.start` 的 spec 是服务端用内存数据构造的，
    必须用 `patch-waves.mjs` 在上游启动前接管 `fs.readFileSync`。
12. **`data/local-assets.json` 缺失 = 3D 棋盘不加载**（`docs/ASSETS.md:76`）。只拷
    `public/assets/local/` 的文件而不拷清单，等于白拷。

---

## 7. 未完成 / 待办

### 高优先
- [ ] **自动部署防守**：目前没有防守单位 → 敌人全部漏过 → 对局很快结束，
      拿不到「长时间高负载」。这是唯一能既堆怪又不输的路子，工作量不小（DOM 拖拽/事件模拟最易碎）。
- [ ] **合成侧成本**（ROADMAP P1）：战斗剖面里 RenderThread 48~58%、VizWebView 15~19%，
      主线程只有 11~18%。要减的是合成，不是 JS。候选：减少图层 / 去掉 iframe 这层合成树 /
      评估 SurfaceView 直通（需人工验证，没法靠注入猜）。

### 中优先
- [ ] 把 4K 的 A/B 各跑 3 轮取均值与方差（现在每组只有 1~2 次有效样本）。
- [ ] `facingWheel.js:355` 每帧 `getBoundingClientRect`（311 ms/20 s ≈ 主线程活跃 4%），
      可用现有拦截层下发改写版。
- [ ] `simWorkerRuntime` 的 `ops`/`meter`/`meta` 改差量发送（需先确认消费方）。
- [ ] iOS 侧完全没实测：`pauseTimers`、返回键、注入都没在 iOS 上验证过。

### 低优先
- [ ] `settings.json` 没有 schema 版本（`servers.json` 已有），字段多了要迁移。
- [ ] 远端 `ci/ios-release` 分支可删（内容已并入 main）。

---

## 8. 下个窗口的推荐起手动作

```powershell
# 1) 状态确认
git status -sb; git log --oneline -3
adb devices                                  # 没有设备就先开 MuMu
Get-NetTCPConnection -LocalPort 3000 -State Listen

# 2) 起服务器（记得重定向日志，别用管道截断）
Start-Process node -ArgumentList 'testserver/server.mjs' `
  -RedirectStandardOutput '.tmp/stress-logs/server.log' `
  -RedirectStandardError  '.tmp/stress-logs/server.err' -PassThru
curl http://127.0.0.1:3000/__stress/info     # 确认 rounds=9、assets.local.present=true

# 3) 跑一组，先看 summary 里有没有 combat-only（没有就是又落到结算页了）
powershell -File tools/stress.ps1 -Serial 127.0.0.1:16384 -Label check -Seconds 40
```

如果 `combat-only` 是空的：说明进局失败，按顺序排查
`samples.csv` 的 `screen` 列 → `metadata.txt` 的 settings → 游戏 context 里的 `dpr`。

---

## 9. 关键数字速查

| 项 | 值 |
|---|---|
| 真机 | Redmi 25053RT47C，`e9c8f40f`，Android 16，1280×2772，DPR 3.25，8 核，11233 MB |
| 模拟器 | MuMu `127.0.0.1:16384`，2160×3840 / 490 dpi，4 核，3939 MB（`lowRam=true`） |
| 真实负载基线 | 战斗主线程只占 11~18%，合成（RenderThread+Viz）占 63~77% |
| 客户端缓存 | 18534 / 18561 个文件（27 个 sfx 社区 dump 里没有） |
| 上游游戏 | 克隆在 `testserver/upstream`（v0.3.3），gitignore |
| 打包 | `pnpm android:build`（arm64）/ `pnpm build`（Windows 双包） |
