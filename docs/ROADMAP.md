# 未来计划（Roadmap）

> 这份文件只放「还没做、但已经知道怎么做」的事。做完的进 [CHANGELOG](../CHANGELOG.md)。
> 每条都写清楚**依据**（来自哪次实测）与**验证方式**，避免凭感觉排优先级。

## 已完成（0.3.0，作为背景）

真机 Redmi 25053RT47C / Android 16 / WebView 156 实测：

| 项目 | 结果 |
|---|---|
| 后台防发热（`pauseTimers`） | 切后台 JS 定时器归零 |
| 低端机白屏（ES2020 平替 + 启动竞态） | 老旧内核不再 `SyntaxError` |
| 渲染倍率（auto → 1.5 / 低配 1.0） | 画布 1706×788 → 1280×591（像素 44%） |
| 帧率 | 120fps 抖动 → **60fps 恒定**（median 16.7ms，p95 16.7ms） |
| 168 秒同图对照 | CPU 1.29 → **1.07 核**；电池温度 +2.0℃ → **+0.5℃**；CPU 均温 +5.4℃ → **走平** |

## P1：把合成侧成本压下去（下一个真正的大头）

**依据**：战斗剖面里最重的是合成，而不是 JS —

```text
RenderThread 48~58%    ← Android 侧合成线程
Chrome_InProcGpu 22~27%
VizWebView     15~19%
主线程（JS）    11~18%
```

**为什么之前的优化没等比降 CPU**：降分辨率只减「游戏内部的像素」，但每帧仍要把 WebGL surface
与页面其余图层合成一遍，合成成本与内部分辨率基本无关。

候选做法（按风险从低到高）：

1. **减少参与合成的图层**：内嵌时启动器 DOM 已 `display:none`（已做）；下一步可以把浮球
   从不透明背景层降级为「纯边框 + 无 `box-shadow`」——实测浮球存在只值 2.5% CPU，收益小，
   不优先。
2. **去掉 iframe 这一层**：现在是「启动器 WebView → iframe → 游戏」。若把游戏改成独立
   全屏 WebView（像桌面那样开第二个窗口），合成树会少一层。代价：状态同步、返回栈要重做。
3. **验证 SurfaceView / 硬件叠加是否可能**：需要确认 Chromium 在 Android WebView 里
   能否把 WebGL surface 交给 HWUI 做 overlay 直通。**需人工验证**，不做承诺。

**验证方式**：`dumpsys gfxinfo` 的 50/90 分位 + 168 秒温度/CPU 对照（见下方「测量方法」）。

## P2：游戏侧的高频小优化（可注入，收益小但白拿）

1. **`facingWheel.js:355` 每帧 `getBoundingClientRect()`**：强制同步布局，实测 311ms/20s
   （≈ 主线程活跃时间 4%）。可通过现有拦截层下发改写版：把 host rect 缓存到 `resize` 为止。
2. **`simWorkerRuntime.js` 的消息体**：已完成 `Array(n).fill(null)` → `new Array(n)`；
   下一步可考虑把 `state` 里的静态字段（`ops` / `meter` / `meta`）改成差量发送。
   需要先确认消费方，**需人工验证**。

## P3：低端机差异化加载

**依据**：`renderScale=auto` 已经按内存/核数选倍率，但其它项还是「一刀切」。

- 按 `navigator.deviceMemory` / `hardwareConcurrency` 决定是否加载 3D 棋盘（**默认不关**，
  只在内存极低时提示用户手动切 2D，不擅自改观感）。
- 首帧前先把启动器 UI 渲染出来（现在 `load_state` 之后才 render）。

## P4：工程与验证

- **真机自动化回归脚本**：把这次用的 `cdp.mjs` + `prof.mjs` + `sample-heat.ps1` 串成
  `pnpm perf:baseline` / `pnpm perf:compare`，避免下次又手敲一遍。
- **iOS 侧未验证**：workflow 能出包，但 `pauseTimers`、返回键、注入这些改动都没有 iOS 实测数据。
- `setting.schema` 没有版本迁移：目前 `Settings` 靠 serde 默认值兜底，字段多了以后要引入
  `version` 迁移（`servers.json` 已有 `version`，`settings.json` 还没有）。

## 测量方法（别再用瞬时 `top %CPU`）

瞬时百分比会被波次和合成线程抖动淹没。用：

```powershell
# 温度 + 累计 CPU ticks + 当前界面，每 5 秒一条，最后给出平均占用核数
powershell -File tools/sample-heat.ps1 -Seconds 170 -Out .tmp/heat.csv
```

对照时务必：**同一张图**（独立模拟 / 标准模拟 AC-1）、同样的自动化驱动、同样 168 秒墙钟。
0.3.0 的那组对照就是这么做的，接管开的那组**先跑**（起始更热），所以结论偏保守。
