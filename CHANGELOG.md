# 更新日志

本文件格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.1.0] - 待定

### 新增

- 服务器地址簿：手动添加 / 编辑 / 删除，一键切换，记住上次使用的服务器
- 地址解析：`host` / `host:port` / `http://host/` 都能识别
- 端口自动探测：未写端口时依次尝试 3000 / 80 / 54321
- 服务器探活：请求 `/healthz`，显示在线状态与延迟
- 配置本地持久化：`servers.json` + `settings.json`，原子写入，带 schema 版本号
- 游戏窗口：独立窗口打开游戏，可全屏
- 房间密钥直连：`?room=KEY`
- 配置导入 / 导出（剪贴板）
