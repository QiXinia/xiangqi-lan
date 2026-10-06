// AI 棋力基准: 用杀局题库测 AI 首着是否为强制杀着(穷举复核), 增强前后对比
// 用法: node generated/bench-ai.mjs [每类抽样数] [每局时限ms]
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { PUZZLES } from '../js/puzzles.js';

const PER = Number(process.argv[2] || 999);
const LIMIT_MS = Number(process.argv[3] || 3000);

function mk(s, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty };
}
function un(s, u) { s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap; s.turn = s.turn === 'r' ? 'b' : 'r'; }
let NODES = 0; const CAP = 5_000_000; const B = Symbol('b');
function findAll(s, n) {
  for (const m of E.legalMoves(s, 'r')) {
    if (++NODES > CAP) throw B;
    const u = mk(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) { good = true; for (const bm of bs) { const u2 = mk(s, bm); const r = findAll(s, n - 1); un(s, u2); if (!r) { good = false; break; } } }
    un(s, u);
    if (good) return m;
  }
  return null;
}
// 判定红方首着 mv 后, 黑任意应着下红均可在 n-1 步内杀
function firstMoveMates(fen, mv, n) {
  const s = E.createState({ fen });
  const u = mk(s, mv);
  if (s.turn !== 'b') { un(s, u); return false; }
  const bs = E.legalMoves(s, 'b');
  if (bs.length === 0) { un(s, u); return true; } // 首着即杀
  if (n <= 1) { un(s, u); return false; }
  for (const bm of bs) {
    const u2 = mk(s, bm);
    NODES = 0; let r = null;
    try { r = findAll(s, n - 1); } catch (e) { if (e !== B) throw e; un(s, u2); un(s, u); return null; } // 超预算不计
    un(s, u2);
    if (!r) { un(s, u); return false; }
  }
  un(s, u);
  return true;
}

const groups = {};
for (const p of PUZZLES) {
  if (p.type || p.chapter === 'classic') continue;
  (groups[p.chapter] ||= []).push(p);
}
const order = ['mate1', 'mate2', 'mate3', 'mate4', 'mate5p'];
let totHit = 0, totN = 0, totTime = 0, totDepth = 0, totNodes = 0, unknown = 0;
for (const ch of order) {
  let arr = (groups[ch] || []).slice();
  // 固定步长抽样(均匀)
  if (arr.length > PER) { const step = arr.length / PER; arr = Array.from({ length: PER }, (_, i) => arr[Math.floor(i * step)]); }
  let hit = 0, n = 0, time = 0, depth = 0, nodes = 0, unk = 0;
  for (const p of arr) {
    const s0 = E.createState({ fen: p.fen });
    const t0 = Date.now();
    const mv = searchBestMove(s0, { level: 5, deadline: t0 + LIMIT_MS });
    const ms = Date.now() - t0;
    const s1 = E.createState({ fen: p.fen });
    const r = firstMoveMates(p.fen, mv, p.mate);
    n++;
    if (r === null) unk++;
    else if (r) hit++;
    time += ms; depth += mv.depth || 0; nodes += mv.nodes || 0;
  }
  console.log(`${ch}: 解出 ${hit}/${n}${unk ? ` (${unk} 局复核超预算)` : ''}  均深 ${(depth / n).toFixed(1)} 均时 ${Math.round(time / n)}ms`);
  totHit += hit; totN += n; totTime += time; totDepth += depth; totNodes += nodes; unknown += unk;
}
console.log(`\n合计 解出 ${totHit}/${totN} = ${(100 * totHit / Math.max(1, totN - unknown)).toFixed(1)}%(剔除超预算 ${unknown}) 均深 ${(totDepth / totN).toFixed(2)} 均时 ${Math.round(totTime / totN)}ms`);
