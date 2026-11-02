# testserver：可控波次的压力测试服务器

给「渲染/发热」测试用的本地游戏服务器。它做三件事：

1. 从 GitHub **克隆一份干净的上游服务器**到 `testserver/upstream/`（被 `.gitignore` 忽略）；
2. 把这份上游的 `data/waves.json` 在**服务端内存里**换成本仓库的配方（不改任何文件）；
3. 前面套一层代理（默认 3000），顺便也把 `/data/waves.json` 换成同一份，保证客户端/服务端一致。

```text
ezSPclient/testserver/
  setup.ps1          克隆 + 装依赖 + 备素材 + 覆盖率闸门
  server.mjs         拉起上游 + 波次改写 + HTTP/WS 代理
  patch-waves.mjs    让上游在启动时读到改过的 waves.json（NODE_OPTIONS --import）
  waves.mjs          波次改写逻辑（server.mjs 与 patch-waves.mjs 共用）
  stress.json        波次配方
  check-assets.py    抽样校验素材是否真的存在
  asset-coverage.py  按类别统计覆盖率（美术 / 音频分开）
  upstream/          ← 克隆出来的上游（gitignore）
```

## 一、准备

```powershell
powershell -File testserver/setup.ps1                       # 克隆 master + npm ci + 从本机已有素材拷一份
powershell -File testserver/setup.ps1 -Ref v0.3.3           # 固定到某个 tag（可复现）
powershell -File testserver/setup.ps1 -Recreate             # 删掉重来
```

### 素材：`-lite` 包不能用来测性能

上游 release 有三种包，**只有完整包带美术**：

| 包 | 大小 | 有美术 | 能否测渲染性能 |
|---|---|---|---|
| `-lite.zip` | 27.6 MB | ❌ | 不能（全是占位图） |
| `-update.zip` | 0.8 MB | ❌ | 不能 |
| `.zip` | 821 MB | ✅ | 能 |

本仓库**不下载** release 包，而是用 `setup.ps1 -Assets` 指定素材来源：

| 模式 | 说明 |
|---|---|
| `copy`（默认） | 从本机已装好的游戏目录拷一份（`robocopy`，只补缺失）；`-AssetsFrom <目录>` 可指定 |
| `link` | 软链过去。快，但后续 `npm run assets` 会把新文件**写回源目录** |
| `download` | `npm run assets`：从社区 dump 拉全量（约 800MB，幂等） |
| `extract` | 从**官方客户端解包目录**提取（`tools/local-extract/extract.py`），再 `npm run assets -- --local-spines` |
| `none` | 不准备素材。只能验证链路，不能出性能结论 |

`setup.ps1` 最后会跑覆盖率校验（[asset-coverage.py](asset-coverage.py)）：**美术低于 95% 直接报错退出**，
不会让你拿一份「目录存在但图是占位符」的素材去测。

当前实测（upstream v0.3.3 + 本机 v0.2.1 素材拷贝）：

```text
art/image    3248/3443  94.3%
art/spine    1342/1420  94.5%
audio/sfx     703/1001  70.2%
audio/voice  2674/11088 24.1%
美术合计     4590/4863  94.4%   ← 差 1.2% 补 npm run assets 即可
```

也就是说：**美术大体齐（缺的是 0.3.3 新增内容），语音缺得最多**。语音不影响渲染负载，
但会影响音频线程的 CPU（线上实测 AudioTrack 占 7~13%），要严格对齐线上就补一次 `npm run assets`。

## 二、起服务器

```powershell
node testserver/server.mjs              # 3000 对外，上游 3100
node testserver/server.mjs --dry-run    # 只打印会改成什么样
node testserver/server.mjs --port 3000 --upstream 3100 --game testserver/upstream
```

启动日志会分别打印两侧生效情况：

```text
[stress] 配方 .../stress.json → mode=mode_single_normal rounds=9
[stress]   第 1 轮  act1autochess_01  20 只（enemy_1007_slime）
[game] [stress] 上游已接管 waves.json（mode=mode_single_normal rounds=9）：第1轮=20只 ...
[stress] 就绪：http://127.0.0.1:3000/
```

> `[game]` 那行很关键：它证明**服务端**用的是改过的波次。`b.start` 里的战斗 spec 是服务端用内存数据
> 构造的，只在 HTTP 层替换 `waves.json` 只能骗到客户端 UI —— 所以这里用 `NODE_OPTIONS=--import` 在
> 上游启动前就接管 `fs.readFileSync`。

自检：

```powershell
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/__stress/info      # 本次生效的配方
curl http://127.0.0.1:3000/data/waves.json    # 替换后的波次
```

## 三、配方怎么写

```jsonc
{
  "mode": "mode_single_normal",   // AC-1 标准模拟 = 这个 mode
  "rounds": 9,                    // 前 9 轮全改（AC-1 正好 9 回合）
  "recipe": {
    "spawnsPerWave": 2,           // 每轮 2 个生成点
    "count": 14,                  // 每个 14 只 → 每轮 28 只
    "interval": 1.5,              // 生成间隔（秒）
    "time": 1,                    // 第 1 秒开始
    "routeIndex": 0               // 走第 1 条路线
  },
  "overrides": {
    "9": { "count": 20 }          // 给某一轮单独加量
  }
}
```

敌人**类型**沿用该轮原本第一条 spawn 的 `key`（以及 slot 等字段），只改数量与节奏 ——
避免去猜 `enemies.json` 里哪些 key 能用在哪些槽位/路线上。想换类型就在 `recipe` 里加 `"key": "enemy_xxx"`。

## 四、和采样脚本串起来

```powershell
# 1) 起压力服务器（保持窗口）
node testserver/server.mjs

# 2) 设备侧反向映射（真机 / 模拟器都行）
adb -s <serial> reverse tcp:3000 tcp:3000

# 3) 两组对照
powershell -File tools/stress.ps1 -Serial <serial> -Label accel-on  -Seconds 90
powershell -File tools/stress.ps1 -Serial <serial> -Label accel-off -Seconds 90 -AccelOff
```

## 五、注意

- `testserver/upstream/` 是本仓库 `.gitignore` 的一部分，克隆出来的东西不会进版本库；
  它内部的 `git status` 会脏（`npm run assets` 会改写 `data/assets.json`），不影响使用。
- 端口占用会直接报错退出：`Get-NetTCPConnection -LocalPort 3000 -State Listen`。
- 代理零第三方依赖，WebSocket 是裸 socket 透传（联机必须）。
- 上游版本决定引擎/地图/敌人属性；本仓库只改「每轮来多少、什么节奏」。
