#!/usr/bin/env node
// 解析 V8 .cpuprofile（来自 CDP Profiler.stop），输出自耗时排行与按文件的归类。
//
//   node tools/prof.mjs .tmp/perf/prep-battle.cpuprofile [--top=30]

import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('用法：node tools/prof.mjs <file.cpuprofile> [--top=N]');
  process.exit(1);
}
const topArg = process.argv.find((a) => a.startsWith('--top='));
const TOP = topArg ? Number(topArg.slice(6)) : 25;

const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
const nodes = new Map();
for (const n of profile.nodes || []) nodes.set(n.id, n);

const samples = profile.samples || [];
const deltas = profile.timeDeltas || [];
// 采样间隔（微秒）
const interval = (profile.endTime - profile.startTime) / Math.max(1, samples.length);

const self = new Map();
for (let i = 0; i < samples.length; i++) {
  const id = samples[i];
  const d = deltas[i] ?? interval;
  self.set(id, (self.get(id) || 0) + d);
}

const total = [...self.values()].reduce((a, b) => a + b, 0);

function frameOf(id) {
  const n = nodes.get(id);
  const cf = n?.callFrame || {};
  const fn = cf.functionName || '(anonymous)';
  const url = cf.url || '';
  return {
    fn,
    url,
    line: (cf.lineNumber ?? 0) + 1,
    key: `${fn} @ ${url || '(native)'}:${(cf.lineNumber ?? 0) + 1}`,
  };
}

const byFunc = new Map();
const byFile = new Map();
let idle = 0;
let gc = 0;
let program = 0;

for (const [id, dur] of self) {
  const f = frameOf(id);
  if (f.fn === '(idle)') {
    idle += dur;
    continue;
  }
  if (f.fn === '(garbage collector)') gc += dur;
  if (f.fn === '(program)') program += dur;

  byFunc.set(f.key, (byFunc.get(f.key) || 0) + dur);
  const short = f.url ? f.url.replace(/^https?:\/\/[^/]+/, '') : '(native)';
  byFile.set(short, (byFile.get(short) || 0) + dur);
}

const active = total - idle;
const pct = (v, base = active) => `${((v / base) * 100).toFixed(2)}%`;
const ms = (v) => (v / 1000).toFixed(1);

console.log(`文件：${file}`);
console.log(`采样：${samples.length} 个 · 墙钟 ≈ ${ms(total)} ms · 有效(非 idle) ${ms(active)} ms`);
console.log(`idle ${pct(idle, total)} · gc ${pct(gc)} (${ms(gc)} ms) · program ${pct(program)} (${ms(program)} ms)`);

console.log(`\n=== 自耗时 Top ${TOP} 函数 ===`);
[...byFunc.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP)
  .forEach(([k, v], i) => console.log(`${String(i + 1).padStart(2)}. ${pct(v).padStart(7)} ${ms(v).padStart(9)} ms  ${k}`));

console.log('\n=== 按文件归类 ===');
[...byFile.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([k, v]) => console.log(`${pct(v).padStart(7)} ${ms(v).padStart(9)} ms  ${k}`));
