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

**推荐用仓库自带的压力服务器**（[testserver/](../testserver/README.md)）：它把游戏服务器原样拉起，
并只替换 `/data/waves.json` —— 每轮敌人数量/节奏固定可调，游戏仓库不用改一个字节。

```powershell
# 1) 起压力服务器（3000 对外，上游 3100）
node testserver/server.mjs
#    自检：
#    curl http://127.0.0.1:3000/healthz
#    curl http://127.0.0.1:3000/__stress/info
```

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

## 已知的确定性边界

- 用 `testserver/` 时：每轮敌人类型/数量/节奏由 `testserver/stress.json` 写死，**跨运行完全一致**；
- 用原始游戏服务器时：同一难度同一张图每波构成一致，但玩家操作（买什么、放哪）会改变同屏单位数；
  所以脚本只点「准备就绪」不碰商店，两次运行仍可能有少量差异；
- 两种方式都不会改变**引擎/地图/敌人属性**：改的只是「每轮来多少、什么节奏」。

## 顺带可用的开关

游戏客户端支持 `?render=` 查询参数（`public/js/game.js:586`、`public/js/render/fieldHost.js:129`），
可以在同一场景下对比 2D / 3D 棋盘的渲染成本。用法：把服务器地址连同查询串填进地址簿
（本客户端 v0.3.0 目前只接受 `host:port`，**尚不支持路径/查询串**，需要临时用 CDP 改 iframe 的 `src`）。
