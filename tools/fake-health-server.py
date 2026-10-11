#!/usr/bin/env python3
"""验收用的假游戏服务器：只在 127.0.0.1:3000 应答 /healthz，并把每个请求记到日志。

    python tools/fake-health-server.py [--port 3000] [--log probe-hit.log]

用来在没有真实服务器的情况下验证客户端链路（前端 → IPC → Rust 探活 → HTTP）：
日志里出现带 `ezSPclient/` User-Agent 的 `/healthz` 请求，就说明整条链路是通的。
"""

import argparse
import datetime
import http.server
import json
import pathlib

parser = argparse.ArgumentParser(description="假的 /healthz 服务器（验收用）")
parser.add_argument("--port", type=int, default=3000)
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
        else:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()

    def log_message(self, *_: object) -> None:
        """默认的逐请求 stderr 输出会刷屏，这里只写自己的日志文件。"""


http.server.HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
