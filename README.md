# ezSPclient

《卫戍协议：盟约》(Stronghold Protocol) 的**多平台客户端** —— 一个轻量 WebView 外壳 + 服务器地址簿。

游戏本体是纯前端的网页游戏（HTTP + WebSocket），跑在你自己或朋友的机器上。ezSPclient **不重写游戏**，只解决网页浏览器缺失的那部分体验：

| 能力 | 说明 |
|---|---|
| **服务器地址簿** | 手动填写、增删改、一键切换；IP / 域名 + 端口都行，配置存在本地 |
| **端口自动探测** | 只写 `192.168.1.10` 也能连：依次试 3000 → 80 → 54321，取第一个 `/healthz` 正常的 |
| **探活与延迟** | 列表里直接显示在线状态、毫秒延迟和最后在线时间，支持一键全部测速 |
| **游戏窗口** | 独立窗口打开游戏，可全屏；可让每个服务器用独立缓存（房间密钥、设置互不串） |
| **房间直连** | 输入 4 位同盟密钥直接进房（`?room=KEY`） |

技术栈：[Tauri v2](https://tauri.app)（Rust + 系统 WebView），桌面端 Windows / macOS / Linux，代码结构同时面向 Android / iOS。

## 快速开始

需要 Rust 工具链和 MSVC 生成工具（Windows），详见 [docs/DEV.md](docs/DEV.md)。

```bash
pnpm install
pnpm tauri dev      # 开发运行
pnpm tauri build    # 打包
```

## 地址怎么写

| 输入 | 行为 |
|---|---|
| `192.168.1.10:3000` | 直接连 3000 端口 |
| `192.168.1.10` | 依次探测 3000 → 80 → 54321，记下第一个可用的 |
| `http://game.example.com` | 等价于 `game.example.com:80` |
| `game.example.com:54321` | 域名 + 端口同样支持 |

## 文档

- [docs/DESIGN.md](docs/DESIGN.md) —— 目标、架构、数据模型、多平台策略与取舍
- [docs/DEV.md](docs/DEV.md) —— 环境准备、构建、调试、移动端
- [CHANGELOG.md](CHANGELOG.md) —— 版本记录

## 与游戏本体的关系

完全解耦：客户端只做两件事 —— 请求 `<地址>/healthz` 判断服务器是否在线，然后把 `<地址>/` 交给 WebView 显示。游戏更新不需要重新编译客户端。

## 许可

本项目自身暂未选择许可证。游戏素材与商标版权归上海鹰角网络 / Yostar，仅限非商业同人使用。
