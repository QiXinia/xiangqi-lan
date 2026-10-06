// 精确强制杀求解器基准/校验: DL=12000 node test/matesolve-bench.mjs [IDS 或区间]
// 对每个杀局用 js/mate-solver.js 求最短强制杀, 核对 status='win' 且 mate 与标注一致,
// 记录耗时/节点, 标出超预算局。支持环境变量 IDS(逗号/区间) 与 DL(单局毫秒)。
import * as E from '../js/engine.js';
import { PUZZLES } from '../js/puzzles.js';
import { findForcedMate } from '../js/mate-solver.js';
import fs from 'fs';

function parseIds(str) {
  const set = new Set(); if (!str) return set;
  for (const tok of String(str).split(',').map(s => s.trim()).filter(Boolean)) {
    if (/^\d+\s*-\s*\d+$/.test(tok)) { let [a, b] = tok.split('-').map(Number); if (a > b) [a, b] = [b, a]; for (let i = a; i <= b; i++) set.add(i); }
    else set.add(Number(tok));
  }
  return set;
}
const argIds = parseIds(process.argv.slice(2).join(','));
const envIds = parseIds(process.env.IDS);
const want = new Set([...argIds, ...envIds]);
let list = PUZZLES.filter(p => p.type !== 'win' && p.type !== 'draw' && !p.jieqi && p.mate != null);
if (want.size) list = list.filter(p => want.has(p.id));
const DL = Number(process.env.DL || 4000);
const OUT = process.env.OUT || 'test/logs/matesolve-bench.json';

let win = 0, unknown = 0, none = 0, mismatch = 0; const slow = [];
const t0 = Date.now();
for (const pz of list) {
  const s = E.createState({ fen: pz.fen });
  const t = Date.now();
  const r = findForcedMate(s, { attacker: 'r', maxMoves: pz.mate, deadline: Date.now() + DL, maxNodes: 2_000_000_000 });
  const ms = Date.now() - t;
  if (r.status === 'win') {
    win++;
    if (r.mate !== pz.mate) { mismatch++; console.log(`⚠ ${pz.id}.${pz.name} 标注${pz.mate}步, 求解器最短=${r.mate}步(${r.kind})`); }
    if (ms >= 300) slow.push({ id: pz.id, name: pz.name, mate: pz.mate, ms, nodes: r.nodes, kind: r.kind });
  } else if (r.status === 'unknown') { unknown++; console.log(`? ${pz.id}.${pz.name} ${pz.mate}步 求解超预算(${ms}ms/${r.nodes}节点)`); }
  else { none++; console.log(`✗ ${pz.id}.${pz.name} ${pz.mate}步 求解器判定无强制杀(与穷举矛盾!)`); }
}
slow.sort((a, b) => b.ms - a.ms);
console.log(`\n共 ${list.length} 局(DL=${DL}ms): 已证最短杀 ${win}, 超预算 ${unknown}, 矛盾(无杀) ${none}, 手数不符 ${mismatch}, 总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('最慢 Top20:');
for (const x of slow.slice(0, 20)) console.log(`  ${x.id}.${x.name} ${x.mate}步 ${x.ms}ms ${(x.nodes / 1e6).toFixed(2)}M节点 ${x.kind}`);
fs.writeFileSync(OUT, JSON.stringify({ DL, win, unknown, none, mismatch, slow }, null, 1));
process.exit(unknown || none || mismatch ? 1 : 0);
