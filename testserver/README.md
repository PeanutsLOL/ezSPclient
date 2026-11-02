# testserver：可控波次的压力测试服务器

给「渲染/发热」测试用的本地游戏服务器。它做两件事：

1. 把 `D:\Git\Stronghold-Protocol` 的游戏服务器**原样**拉起来（上游，默认 3100 端口）；
2. 在前面套一层代理（默认 3000 端口），**只把 `/data/waves.json` 换成我们自己的波次配方**。

游戏仓库一个字节都不改，`Ctrl+C` 就干净退出。

```text
ezSPclient/testserver/
  server.mjs     代理 + 波次改写 + 拉起上游
  stress.json    波次配方（改这里就能改压力）
```

## 为什么需要它

线上服务器的波次、单位数每局都不同，跨配置对比（接管开/关、倍率 1.0/1.5）会被内容差异污染。
用固定版本 + 固定配方之后，**同一轮的敌人数量、类型、出现时间每次完全一致**，剩下的差异才是我们要看的。

## 用法

```powershell
# 默认：3000 对外，上游 3100，游戏目录 ..\..\Stronghold-Protocol
node testserver/server.mjs

# 只看会改成什么样，不起服务器
node testserver/server.mjs --dry-run

# 换端口 / 换游戏目录
node testserver/server.mjs --port 3000 --upstream 3100 --game D:/Git/Stronghold-Protocol
```

启动后会打印每一轮被改成了什么：

```text
[stress] 配方 .../stress.json → mode=mode_single_normal rounds=6
[stress]   第 1 轮  act1autochess_01  28 只（enemy_1007_slime, slot N）
[stress]   第 2 轮  act1autochess_02  28 只（enemy_1422_lrsldr, slot N）
...
```

自检两个端点：

```powershell
curl http://127.0.0.1:3000/healthz            # 走代理的上游健康检查
curl http://127.0.0.1:3000/__stress/info      # 本次生效的配方
curl http://127.0.0.1:3000/data/waves.json    # 替换后的波次（看 totalCount / spawns）
```

## 配方怎么写

```jsonc
{
  "mode": "mode_single_normal",   // 只改这个模式用到的波次（见 waves.json 的 usedBy）
  "rounds": 6,                    // 改前 6 轮
  "recipe": {
    "spawnsPerWave": 2,           // 每轮 2 个生成点
    "count": 14,                  // 每个 14 只 → 每轮 28 只
    "interval": 1.5,              // 生成间隔（秒）
    "time": 1,                    // 第一只出现在第 1 秒
    "routeIndex": 0               // 走哪条路线（沿用原波次的 routes 数组下标）
  },
  "overrides": {
    "6": { "count": 30 }          // 想给某一轮单独加量就写这里，键是轮次
  }
}
```

敌人**类型**不在这里写死：脚本沿用该轮原本第一条 spawn 的 `key`（并保留它的 `slot` 等字段），
只改数量与节奏。这样不用去猜 `enemies.json` 里哪些 key 能用在哪些路线/槽位上。

要换成别的敌人，改游戏仓库的 `data/waves.json` 里对应轮次的第一条 spawn 的 `key` —— 或者
在 `stress.json` 里加一个 `"key": "enemy_xxx"` 的字段（下一步可加，现在没实现）。

## 和现有工具串起来

```powershell
# 1) 起压力服务器（保持这个窗口）
node testserver/server.mjs

# 2) 设备侧把 3000 反向映射到主机（模拟器/真机都行）
adb -s <serial> reverse tcp:3000 tcp:3000

# 3) 跑一组采样（脚本会自己把 127.0.0.1:3000 加进地址簿并进局）
powershell -File tools/stress.ps1 -Serial <serial> -Label accel-on  -Seconds 90
powershell -File tools/stress.ps1 -Serial <serial> -Label accel-off -Seconds 90 -AccelOff
```

## 注意

- 上游游戏版本是本地仓库那套（当前 `0.2.1`），和线上 `0.3.3` 不同。**只在本地版本内部做对比**，
  不要拿本地数据当线上绝对值。
- 代理只替换 `waves.json`，其它数据（`stages.json` / `enemies.json` …）原样透传；所以地图、
  敌人属性、经济都还是游戏原本的设定，改的只有「每轮来多少、什么节奏」。
- WebSocket 是裸 socket 透传（游戏联机必须），代理本身**零第三方依赖**。
- 端口占用会直接报错退出；先 `Get-NetTCPConnection -LocalPort 3000 -State Listen` 看一眼。
