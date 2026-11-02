// 让「上游游戏服务器」读到我们改过的波次，而不修改游戏仓库。
//
// 用法（由 server.mjs 自动设置，不用手敲）：
//   NODE_OPTIONS="--import file:///.../testserver/patch-waves.mjs" node server/index.js
//
// 原理：`server/data.js` 是 `import fs from 'node:fs'`（默认导入，拿到的是可变的 CJS 对象），
// 启动时用 `fs.readFileSync('<repo>/data/waves.json')` 读波次。这里在应用代码之前把它包一层：
// 命中那个路径就返回改好的 JSON，其余照常放行。
//
// 为什么不在 HTTP 层改：`b.start` 里的战斗 spec 是**服务端**用内存里的数据构造的，
// 只改 HTTP 响应只能骗到客户端 UI，实际波次仍然是原版。

import fs from "node:fs";

const GAME = process.env.STRESS_GAME;
const RECIPE = process.env.STRESS_RECIPE;

if (GAME && RECIPE) {
  const target = fs.realpathSync.native
    ? (() => {
        try {
          return fs.realpathSync.native(`${GAME}\\data\\waves.json`);
        } catch {
          return null;
        }
      })()
    : null;

  const { buildPatchedWaves } = await import("./waves.mjs");
  const patched = buildPatchedWaves({ game: GAME, recipe: RECIPE });

  const original = fs.readFileSync;
  const norm = (p) => String(p).replace(/\\/g, "/").toLowerCase();

  fs.readFileSync = function patchedReadFileSync(file, options) {
    const asPath = norm(file);
    if (asPath.endsWith("/data/waves.json") && (!target || asPath === norm(target))) {
      if (!globalThis.__stressWavesLogged) {
        globalThis.__stressWavesLogged = true;
        console.log(
          `[stress] 上游已接管 waves.json（mode=${patched.mode} rounds=${patched.rounds}）：` +
            patched.touched.map((t) => `第${t.round}轮=${t.total}只`).join(" "),
        );
      }
      const enc = typeof options === "string" ? options : options?.encoding;
      return enc ? patched.json : Buffer.from(patched.json, "utf8");
    }
    return original.call(fs, file, options);
  };

  console.log(`[stress] patch-waves 已加载（game=${GAME}）`);
} else {
  console.warn("[stress] patch-waves 缺少 STRESS_GAME / STRESS_RECIPE，未做改写");
}
