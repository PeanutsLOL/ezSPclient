#!/usr/bin/env node
// 压力测试专用服务器：起一份游戏服务器，并把 `data/waves.json` 换成我们自己的波次配方。
//
//   node testserver/server.mjs                      # 默认 3000 -> 上游 3100，游戏目录 ../Stronghold-Protocol
//   node testserver/server.mjs --port 3000 --upstream 3100 --game D:/Git/Stronghold-Protocol
//   node testserver/server.mjs --dry-run            # 只打印会改成什么样，不起服务器
//
// 为什么用代理而不是改游戏仓库：
//   `server/data.js` 的 DATA_DIR 是硬编码的 `<repo>/data`，没有环境变量可覆盖；
//   直接改人家的 `data/waves.json` 既容易忘记还原，也会污染那个仓库。
//   这里改成「上游照原样跑，只在 HTTP 层把 /data/waves.json 换掉」，
//   游戏仓库一个字节都不动，Ctrl+C 就干净退出。
//
// 覆盖规则：
//   - 按 `waves[*].usedBy` 找到「modeId 匹配、round ≤ rounds」的波次；
//   - 把每轮改成同一种敌人组合（类型/slot 沿用该波原本的第一个 spawn，保证字段合法）；
//   - 重算 `totalCount` 与 `slotCounts`，避免服务端校验不过。

import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPatchedWaves } from "./waves.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) return process.argv[idx + 1];
  return fallback;
}

const PORT = Number(arg("port", 3000));
const UPSTREAM = Number(arg("upstream", 3100));
const GAME = path.resolve(arg("game", path.join(HERE, "upstream")));
const RECIPE_FILE = path.resolve(arg("recipe", path.join(HERE, "stress.json")));
const DRY = process.argv.includes("--dry-run");

const log = (...a) => console.log("[stress]", ...a);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// ---------------------------------------------------------------- 波次改写（逻辑在 waves.mjs，供两处共用）

const patched = buildPatchedWaves({ game: GAME, recipe: RECIPE_FILE });

log(`游戏目录 ${GAME}`);
log(`配方 ${RECIPE_FILE} → mode=${patched.mode} rounds=${patched.rounds}`);
for (const t of patched.touched) {
  log(`  第 ${t.round} 轮  ${t.id}  ${t.total} 只（${t.enemy}）`);
}
if (!patched.touched.length) {
  log("警告：没有匹配到任何波次，检查配方里的 mode / rounds 是否与 data/waves.json 的 usedBy 对得上");
}

if (DRY) {
  log("--dry-run：不启动服务器。");
  process.exit(0);
}

// ---------------------------------------------------------------- 上游游戏服务器

const child = spawn(process.execPath, [path.join(GAME, "server", "index.js")], {
  cwd: GAME,
  env: {
    ...process.env,
    PORT: String(UPSTREAM),
    HOST: "127.0.0.1",
    // 关键：让上游在启动前就把 data/waves.json 的读取替换掉（不改游戏仓库里的文件）
    STRESS_GAME: GAME,
    STRESS_RECIPE: RECIPE_FILE,
    NODE_OPTIONS: `--import ${pathToFileURL(path.join(HERE, "patch-waves.mjs")).href}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (b) => process.stdout.write(`[game] ${b}`));
child.stderr.on("data", (b) => process.stderr.write(`[game] ${b}`));
child.on("exit", (code) => {
  log(`上游游戏服务器退出（code=${code}），代理一并退出`);
  process.exit(code ?? 0);
});

async function waitUpstream(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((res) => {
      const req = http.get({ host: "127.0.0.1", port: UPSTREAM, path: "/healthz", timeout: 1000 }, (r) => {
        r.resume();
        res(r.statusCode === 200);
      });
      req.on("error", () => res(false));
      req.on("timeout", () => {
        req.destroy();
        res(false);
      });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// ---------------------------------------------------------------- 代理

const server = http.createServer((req, res) => {
  if (req.url === "/data/waves.json") {
    const body = Buffer.from(patched.json, "utf8");
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": body.length,
      "cache-control": "no-store",
    });
    res.end(body);
    return;
  }
  if (req.url === "/__stress/info") {
    const info = JSON.stringify({ mode: patched.mode, rounds: patched.rounds, touched: patched.touched }, null, 2);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(info);
    return;
  }

  const upstream = http.request(
    { host: "127.0.0.1", port: UPSTREAM, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (e) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`上游不可用：${e.message}`);
  });
  req.pipe(upstream);
});

// WebSocket 透传（游戏联机靠它，不代理就进不了局）
server.on("upgrade", (req, socket, head) => {
  const up = net.connect(UPSTREAM, "127.0.0.1", () => {
    up.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (head && head.length) up.write(head);
    socket.pipe(up);
    up.pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

waitUpstream().then((ok) => {
  if (!ok) {
    log(`上游 ${UPSTREAM} 没起来，检查游戏目录与依赖（node_modules）`);
    child.kill();
    process.exit(1);
  }
  server.listen(PORT, "0.0.0.0", () => {
    log(`就绪：http://127.0.0.1:${PORT}/  （波次已被替换；/__stress/info 可看配方）`);
    log(`设备侧：adb reverse tcp:${PORT} tcp:${PORT} 然后客户端连 127.0.0.1:${PORT}`);
  });
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill();
    process.exit(0);
  });
}
