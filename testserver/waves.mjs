// 波次配方 → 改写后的 waves.json。被 server.mjs（给客户端）与 patch-waves.mjs（给服务器）共用。
//
// 只改「每轮来多少、什么节奏」，敌人类型/slot 沿用该轮原本第一条 spawn，避免枚举值不合法。
// 改写后重算 totalCount 与 slotCounts（服务端与客户端都会读这两个字段）。

import fs from "node:fs";
import path from "node:path";

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * @param {{ game: string, recipe: string }} opts
 * @returns {{ mode: string, rounds: number, json: string, touched: Array<object> }}
 */
export function buildPatchedWaves({ game, recipe }) {
  const wavesPath = path.join(game, "data", "waves.json");
  const waves = readJson(wavesPath);
  const cfg = readJson(recipe);

  const mode = cfg.mode || "mode_single_normal";
  const rounds = Number(cfg.rounds || 6);
  const base = cfg.recipe || {};
  const overrides = cfg.overrides || {};

  const touched = [];
  for (const [id, wave] of Object.entries(waves)) {
    if (!wave || !Array.isArray(wave.spawns)) continue;
    const use = (wave.usedBy || []).find((u) => u.modeId === mode && u.round <= rounds);
    if (!use) continue;

    const r = { ...base, ...(overrides[String(use.round)] || {}) };
    const perWave = Math.max(1, Number(r.spawnsPerWave || 1));
    const count = Math.max(1, Number(r.count || 10));
    const interval = Number(r.interval ?? 1.5);
    const start = Number(r.time ?? 1);
    const maxRoute = Math.max(0, (wave.routes || []).length - 1);
    const routeIndex = Math.min(Math.max(0, Number(r.routeIndex ?? 0)), maxRoute);

    // 模板只取「类型相关」的字段，其它（time/count/interval/routeIndex）由配方决定
    const template = wave.spawns[0] || {};
    const spawns = [];
    for (let i = 0; i < perWave; i++) {
      spawns.push({
        ...template,
        ...(r.key ? { key: r.key } : {}),
        time: Number((start + i * interval).toFixed(2)),
        count,
        interval,
        routeIndex,
      });
    }

    const total = spawns.reduce((n, s) => n + s.count, 0);
    const slotCounts = {};
    for (const s of spawns) {
      const slot = s.slot || "N";
      slotCounts[slot] = (slotCounts[slot] || 0) + s.count;
    }

    wave.spawns = spawns;
    wave.totalCount = total;
    wave.slotCounts = slotCounts;
    touched.push({
      id,
      round: use.round,
      total,
      enemy: template.key || null,
      slot: template.slot || "N",
    });
  }

  touched.sort((a, b) => a.round - b.round);

  if (!touched.length) {
    console.warn(
      `[stress] 警告：没有波次匹配 mode=${mode} rounds<=${rounds}，` +
        `检查 ${path.basename(recipe)} 与 data/waves.json 的 usedBy`,
    );
  }

  return { mode, rounds, json: JSON.stringify(waves), touched };
}
