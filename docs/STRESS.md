# 本地压力测试（专属测试环境）

## 为什么要本地服务器

线上服务器每局波次、单位数都不一样。同一个「接管开 / 关」的对比，如果两次撞上不同波次，
数据会被内容差异污染 —— 0.3.0 的第一轮对照就吃过这个亏（接管那组帧率只有一半，
pixi/spine 的绝对耗时反而更高，说明两次采样根本不在同一场景）。

本机起一份游戏服务器之后：

- **版本固定**：不会因为线上更新而前后不一致；
- **内容固定**：固定难度（AC-1 是固定战场#01）+ 固定开局流程；
- **可离线**：不依赖外网，模拟器也能连（`adb reverse` 把设备的端口打到主机）。

⚠️ 注意：本地的游戏仓库版本（当前 `0.2.1`）与线上（`0.3.3`）不同。**只在本地版本内部做对比**，
不要拿本地数据和线上数据混在一起看绝对值。

## 一次性准备

**推荐用仓库自带的压力服务器**（[testserver/](../testserver/README.md)）：它会从 GitHub
克隆一份干净的上游服务器到 `testserver/upstream/`（gitignore），把 `data/waves.json`
在服务端换成本仓库的配方，再套一层代理对外提供 —— 游戏代码一个字节都不改。

```powershell
# 1) 克隆 + 装依赖 + 备素材（美术覆盖率低于 95% 会直接报错，防止拿占位图测性能）
powershell -File testserver/setup.ps1
powershell -File testserver/setup.ps1 -Assets download     # 素材不全时：从社区 dump 拉全量

# 2) 起压力服务器（3000 对外，上游 3100）
node testserver/server.mjs
#    自检：
#    curl http://127.0.0.1:3000/healthz
#    curl http://127.0.0.1:3000/__stress/info
```

⚠️ **不要用 `-lite` 包**：它没有美术，跑起来全是占位图，渲染负载完全不对。
本仓库的做法是 `setup.ps1` 的素材模式（`copy` / `download` / `extract`），并用
[asset-coverage.py](../testserver/asset-coverage.py) 按类别校验覆盖率。

也可以直接用游戏仓库自己的服务器（没有波次控制，内容随机）：

```powershell
cd D:\Git\Stronghold-Protocol
node server/index.js            # 监听 3000，/healthz 返回 {"ok":true,...}
```

## 跑一组

```powershell
# 真机（USB）
powershell -File tools/stress.ps1 -Serial e9c8f40f -Label accel-on  -Seconds 90

# 同一个环境，关掉接管再跑一组（脚本自己重启应用）
powershell -File tools/stress.ps1 -Serial e9c8f40f -Label accel-off -Seconds 90 -AccelOff

# 模拟器（MuMu 走 127.0.0.1:16384；脚本会自己做 adb reverse）
powershell -File tools/stress.ps1 -Serial 127.0.0.1:16384 -Label emu-on -Seconds 90
```

脚本做的事：

1. 校验 `http://<server>/healthz`；
2. `adb reverse tcp:3000 tcp:3000`（设备侧的 `127.0.0.1:3000` 打到主机）；
3. 启动应用 → 把 `127.0.0.1:3000` 加进地址簿 → 进「独立模拟 / AC-1」；
4. 采样：每 5 秒一条（电池温度 / CPU 各核温度 / 进程累计 CPU ticks / 当前界面），
   中段再抓 20 秒主线程 CPU profile；
5. 全程每 8 秒检查一次：在商店阶段就点「准备就绪」，让回合持续推进；
6. 输出 `<dir>/samples.csv`、`<dir>/combat.cpuprofile`、`<dir>/summary.txt`，并直接打印 profile Top 6。

## 怎么读这些数

| 指标 | 用途 | 注意 |
|---|---|---|
| `app CPU ... cores` | **主指标**：窗口内平均占用核数 | 由 `/proc/<pid>/stat` 前后差值算出，比瞬时 `top %CPU` 稳得多 |
| `battery temp` | 真机发热 | 模拟器没有意义（VM 里是主机侧的） |
| `cpu temp avg` | 真机热趋势 | 看「是否走平」，比绝对值更有意义 |
| `combat.cpuprofile` 的 idle/GC/文件占比 | 定位热点 | 比帧率更能说明「谁在花钱」 |

**模拟器能测什么、不能测什么**：

- 能：CPU 侧的相对差异（我们的注入、倍率、画质档位对主线程与 JS 的影响），因为模拟器没有热降频噪声；
- 不能：发热绝对值、GPU 上限判断（MuMu 的 GPU 是虚拟化的，之前测出稳定 30fps 就是它的调度特性，不是游戏本身）；
- 所以：**CPU/JS 的 A/B 在模拟器做，发热结论必须回真机**。

## 怎么把压力「调够」（模拟器实测结论）

在 MuMu（4 核 / 3.9GB / WebView 110）上，用 `testserver/` + 120 只/轮 的配方实测：

| 配方 | 平均占用核数 | 观察 |
|---|---|---|
| 20 只/轮 | 0.32 核 | 战斗 8 / 准备 8 / 结算 2（18 次采样） |
| 120 只/轮 | 0.29 核 | 战斗 6 / 准备 12 —— **加怪没有提高 CPU** |
| 120 只/轮 + 接管关 | 0.37 核 | 但 12 次采样落在结算页（对局已经输了） |

结论（诚实版）：**在模拟器上「堆怪」不是提高 CPU 压力的有效手段**，原因有两个：

1. 客户端被注入的 rAF 节流钳在 60fps，模拟器 GPU 又很快 —— 单位数量增加主要加在 GPU 与
   顶点批处理上，而那部分在这台机器上远没饱和；
2. 没有防守单位时敌人全部漏过，**漏怪上限很快就到**，对局提前结束，采样反而大量落在准备/结算页。

真正有效的压力杠杆（按可控性排序）：

1. **控制相位**：只在 `gm--combat` 窗口内采样（例如每轮开打后立刻采 15 秒），不要在整局里平均；
2. **帧率/像素**：`-AccelOff`（不钳 DPR、不节流）或把 `renderScale` 调到 2.0，直接压填充率；
3. **自动部署防守**（未实现）：这样才能既堆怪又不输，是目前唯一能「既高负载又长时间」的路子。

`tools/stress.ps1` 现在会记录每次采样的界面状态（`samples.csv` 的 `screen` 列），
可以事后按相位切窗口 —— 上面那张表就是这么算出来的。

## 已知的确定性边界

- 用 `testserver/` 时：每轮敌人类型/数量/节奏由 `testserver/stress.json` 写死，**跨运行完全一致**
  （默认 AC-1 的 9 轮全改：前 8 轮各 20 只、第 9 轮 32 只）；
- 用原始游戏服务器时：同一难度同一张图每波构成一致，但玩家操作（买什么、放哪）会改变同屏单位数；
  所以脚本只点「准备就绪」不碰商店，两次运行仍可能有少量差异；
- 两种方式都不会改变**引擎/地图/敌人属性**：改的只是「每轮来多少、什么节奏」。

## 顺带可用的开关

游戏客户端支持 `?render=` 查询参数（`public/js/game.js:586`、`public/js/render/fieldHost.js:129`），
可以在同一场景下对比 2D / 3D 棋盘的渲染成本。用法：把服务器地址连同查询串填进地址簿
（本客户端 v0.3.0 目前只接受 `host:port`，**尚不支持路径/查询串**，需要临时用 CDP 改 iframe 的 `src`）。
