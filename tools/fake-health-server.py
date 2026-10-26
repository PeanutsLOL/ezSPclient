#!/usr/bin/env python3
"""验收用的假游戏服务器：应答 /healthz，并把每个请求记到日志。

    python tools/fake-health-server.py [--port 3000] [--host 127.0.0.1] [--page] [--log probe-hit.log]

用来在没有真实服务器的情况下验证客户端链路（前端 → IPC → Rust 探活 → HTTP）：
日志里出现带 `ezSPclient/` User-Agent 的 `/healthz` 请求，就说明整条链路是通的。

加 `--page` 时 `/` 还会返回一个假游戏页面 —— 移动端内嵌层与贴边浮球只在这个页面上出现，
没有游戏本体也能在真机上把浮球拖到四条边试一遍（见 docs/DEV.md 第 6 节）。
"""

import argparse
import datetime
import http.server
import json
import pathlib

PAGE = """<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>fake game</title>
<style>
  html, body { height: 100%; margin: 0; overflow: hidden; }
  body {
    display: grid; place-items: center; color: #9ff;
    background-color: #0a1418;
    background-image: radial-gradient(circle at 30% 20%, #143a3a, transparent 60%),
      repeating-linear-gradient(45deg, #0d1a1e 0 40px, #0f2026 40px 80px);
    font: 16px/1.6 ui-monospace, "Cascadia Mono", monospace;
  }
  .hud { text-align: center; text-shadow: 0 0 20px rgba(53, 208, 165, 0.4); }
  .hud strong { color: #35d0a5; font-size: 22px; letter-spacing: 2px; }
  .hud span { display: block; color: #8ba39a; font-size: 12px; }
</style>
<div class="hud">
  <strong>FAKE GAME</strong>
  <span>没有真服务器时，用这一页验证内嵌层与贴边浮球</span>
  <span id="meta"></span>
</div>
<script>
  const meta = document.getElementById('meta');
  const paint = () => {
    meta.textContent = `${innerWidth}×${innerHeight} · ${location.search || '无房间参数'}`;
  };
  paint();
  addEventListener('resize', paint);
</script>
"""

parser = argparse.ArgumentParser(description="假的 /healthz 服务器（验收用）")
parser.add_argument("--port", type=int, default=3000)
parser.add_argument("--host", default="127.0.0.1", help="0.0.0.0 可让同一局域网的手机直接访问")
parser.add_argument("--page", action="store_true", help="在 / 返回一个假游戏页面")
parser.add_argument("--log", default="probe-hit.log")
args = parser.parse_args()

log_path = pathlib.Path(args.log).resolve()


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        stamp = datetime.datetime.now().isoformat(timespec="seconds")
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(
                f"{stamp}  {self.client_address[0]}  {self.path}  "
                f"Host={self.headers.get('Host')}  UA={self.headers.get('User-Agent')}\n"
            )
        if self.path.startswith("/healthz"):
            body = json.dumps({"ok": True, "uptimeSec": 123}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif args.page and self.path.split("?")[0] in ("/", "/index.html"):
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()

    def log_message(self, *_: object) -> None:
        """默认的逐请求 stderr 输出会刷屏，这里只写自己的日志文件。"""


http.server.ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
