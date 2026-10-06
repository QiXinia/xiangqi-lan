// 离线为"缓手控杀、在线求解超时"的杀局生成强制杀解面(sol):
//   对最优攻着树中每个【攻击方行棋局面】记录一着必胜首着, 覆盖防守方全部合法应着。
//   玩家只要逐手照"提示"走, 面对防守方任意应对均能在 mate 手内成杀。
// 用法:
//   IDS=317,331 DL=60000 node test/gen-solmaps.mjs   # 生成指定 id, 打印 JSON
//   THRESH=2000 node test/gen-solmaps.mjs           # 全量扫描, 对求解耗时>=阈值(ms)的生成
// 输出: test/logs/solmaps.json  { id: { mate, fen, map: { "<FEN>": "fyfx-tytx" } } }
import * as E from '../js/engine.js';
import { PUZZLES } from '../js/puzzles.js';
import { findForcedMate } from '../js/mate-solver.js';
import fs from 'fs';

function parseIds(str) {
  const set = new Set(); if (!str) return set;
  for (const tok of String(str).split(',').map(s => s.trim()).filter(Boolean)) {
    if (/^\d+\s*-\s*\d+$/.test(tok)) { let [a, b] = tok.split('-').map(Number); if (a > b) [a, b] = [b, a]; for (let i = a; i <= b; i++) set.add(i); }
    else if (tok) set.add(Number(tok));
  }
  return set;
}
const ids = parseIds(process.env.IDS);
const THRESH = Number(process.env.THRESH || 0);
const DL = Number(process.env.DL || 60000);

// 求该攻击方行棋局面的必胜首着(全量, 宽裕时限); 返回 {from,to,mate} 或 null
function winningMove(s, n, stat) {
  const t = Date.now();
  const r = findForcedMate(s, { attacker: 'r', maxMoves: n, deadline: Date.now() + DL, maxNodes: 5_000_000_000, quiet: true });
  if (stat) stat.times.push(Date.now() - t);
  if (r.status !== 'win') return null;
  return { from: r.from, to: r.to, mate: r.mate };
}
const coord = (a) => `${a[0]}${a[1]}`;

// 递归构建解面: s 为攻击方行棋, n 为剩余攻击手数预算
function buildMap(pz, s, n, map, stat) {
  const key = E.toFEN(s);
  if (map.has(key)) return;
  const w = winningMove(s, n, stat);
  if (!w) { stat.missing.push(E.toFEN(s)); map.set(key, null); return; }
  map.set(key, `${coord(w.from)}-${coord(w.to)}`);
  stat.steps++;
  const um = E.legalMoves ? null : null;
  // 走攻着
  const u = mk(s, w.from, w.to);
  const defs = E.legalMoves(s, 'b');
  if (defs.length === 0) { umk(s, u); return; } // 已成杀
  for (const dm of defs) {
    const ud = mk(s, dm.from, dm.to);
    buildMap(pz, s, w.mate - 1, map, stat);
    umk(s, ud);
  }
  umk(s, u);
}
// 直接用引擎 applyMove 会写状态/终局; 这里用轻量手工走子(与 mate-solver 同构)
function mk(s, from, to) {
  const [fx, fy] = from, [tx, ty] = to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty };
}
function umk(s, u) {
  s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap;
  s.turn = s.turn === 'r' ? 'b' : 'r';
}

const out = {};
let list = PUZZLES.filter(p => p.type !== 'win' && p.type !== 'draw' && !p.jieqi && p.mate != null);
if (ids.size) list = list.filter(p => ids.has(p.id));
const t0 = Date.now();
for (const pz of list) {
  // THRESH 模式: 先测在线耗时, 不达阈值则跳过
  if (THRESH) {
    const t = Date.now();
    const probe = findForcedMate(E.createState({ fen: pz.fen }), { attacker: 'r', maxMoves: pz.mate, deadline: Date.now() + THRESH + 1, maxNodes: 5e9 });
    const ms = Date.now() - t;
    if (probe.status === 'win' && ms < THRESH) continue;
  }
  const s = E.createState({ fen: pz.fen });
  const map = new Map(); const stat = { steps: 0, missing: [], times: [] };
  const t = Date.now();
  buildMap(pz, s, pz.mate, map, stat);
  const ms = Date.now() - t;
  const obj = {}; let nulls = 0;
  for (const [k, v] of map) { if (v === null) { nulls++; continue; } obj[k] = v; }
  out[pz.id] = { name: pz.name, mate: pz.mate, fen: pz.fen, entries: Object.keys(obj).length, ms, map: obj };
  const ts = stat.times.slice().sort((a, b) => b - a);
  const gt = (x) => ts.filter(t => t >= x).length;
  console.log(`#${pz.id} ${pz.name} mate${pz.mate}: 解面 ${Object.keys(obj).length} 条, 缺失 ${stat.missing.length}, 生成 ${ms}ms | 子节点求解耗时 max=${ts[0]}ms >=3000:${gt(3000)} >=1500:${gt(1500)} >=500:${gt(500)}`);
}
fs.writeFileSync('test/logs/solmaps.json', JSON.stringify(out));
const totalEntries = Object.values(out).reduce((a, x) => a + x.entries, 0);
const bytes = fs.statSync('test/logs/solmaps.json').size;
console.log(`\n共 ${Object.keys(out).length} 局, 解面总条数 ${totalEntries}, JSON ${bytes} 字节, 总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
