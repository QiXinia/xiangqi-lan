// 残局批量枚举生成: 在"将+少量士象"防守模板上枚举红方 2-3 子布局,
// 用强制杀求解器筛 1-3 步杀, 输出候选 FEN+主变。node test/gen-puzzles.mjs
import * as E from '../js/engine.js';

function lmake(s, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  const wh = p.hidden, o = p.orig;
  if (wh) { p.hidden = false; p.orig = undefined; }
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty, wh, o };
}
function lundo(s, u) {
  s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap;
  if (u.wh) { u.p.hidden = true; u.p.orig = u.o; }
  s.turn = s.turn === 'r' ? 'b' : 'r';
}
let BUDGET = 0;
function find(s, n) {
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) {
      good = true;
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = find(s, n - 1);
        lundo(s, u2);
        if (!r) { good = false; break; }
      }
    }
    lundo(s, u);
    if (good) return m;
  }
  return null;
}
function findBudget(s, n, maxNodes) {
  BUDGET = maxNodes;
  return fb(s, n);
}
function fb(s, n) {
  if (BUDGET-- <= 0) return null;
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) {
      good = true;
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = fb(s, n - 1);
        lundo(s, u2);
        if (!r) { good = false; break; }
      }
    }
    lundo(s, u);
    if (good) return m;
  }
  return null;
}
function shortest(fen, maxN = 3) {
  for (let n = 1; n <= maxN; n++) {
    const s = E.createState({ fen });
    const r = n >= 3 ? findBudget(s, n, 400000) : find(s, n);
    if (r) return { n, m: r };
  }
  return null;
}
function lineOf(fen, n) {
  const s = E.createState({ fen }); const out = []; let cur = n, guard = 0;
  while (cur > 0 && guard++ < 20) {
    const r = find(s, cur);
    if (!r) break;
    out.push(E.moveNotation(s, r.from, r.to));
    lmake(s, r);
    const bs = E.legalMoves(s, 'b');
    if (!bs.length) { out.push('#'); break; }
    let best = null, bestN = -1;
    for (const bm of bs) {
      const u2 = lmake(s, bm);
      let k = 0; for (let z = 1; z <= 4; z++) { if (find(s, z)) { k = z; break; } }
      lundo(s, u2);
      if (k === 0) { best = bm; bestN = 99; break; }
      if (k > bestN) { bestN = k; best = bm; }
    }
    out.push(E.moveNotation(s, best.from, best.to));
    lmake(s, best);
    cur--;
  }
  return out.join(' ');
}

// ---------- 枚举 ----------
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeFen(king, guards, reds, kingX) {
  const g = Array.from({ length: 10 }, () => Array(9).fill(''));
  g[king[1]][king[0]] = 'k';
  for (const [t, x, y] of guards) g[y][x] = t;
  for (const [t, x, y] of reds) g[y][x] = t;
  g[9][3] = 'K'; // 红帅固定 (3,9)
  return g.map(row => {
    let out = '', empty = 0;
    for (const c of row) { if (!c) { empty++; continue; } if (empty) { out += empty; empty = 0; } out += c; }
    if (empty) out += empty;
    return out;
  }).join('/') + ' r';
}
const guardSets = [
  [],
  [['a', 3, 0], ['a', 5, 0]],
  [['a', 3, 0], ['a', 5, 0], ['b', 2, 0], ['b', 6, 0]],
  [['a', 3, 0]],
  [['b', 2, 0], ['b', 6, 0]],
  [['a', 4, 1]],
  [['a', 3, 0], ['b', 2, 0]]
];
const combos = [
  ['R', 'R'], ['R', 'P'], ['R', 'N'], ['R', 'C'], ['C', 'C'], ['N', 'C'],
  ['N', 'N'], ['C', 'P'], ['R', 'P', 'P'], ['R', 'N', 'C'], ['C', 'P', 'P'],
  ['R', 'R', 'P'], ['N', 'N', 'C'], ['R', 'C', 'P']
];
const occOf = (king, guards) => {
  const s = new Set();
  s.add(king[0] + ',' + king[1]);
  for (const [, x, y] of guards) s.add(x + ',' + y);
  s.add('3,9');
  return s;
};
function samplePositions(combo, rng, occ) {
  const ys = (t) => t === 'P' ? [2, 3, 4, 5] : [1, 2, 3, 4, 5];
  const reds = [];
  const used = new Set(occ);
  for (const t of combo) {
    let tries = 0, x, y, key;
    do { x = Math.floor(rng() * 9); y = ys(t)[Math.floor(rng() * ys(t).length)]; key = x + ',' + y; tries++; } while (used.has(key) && tries < 60);
    if (used.has(key)) return null;
    used.add(key); reds.push([t, x, y]);
  }
  return reds;
}

const found = [];
const seenShape = new Set();
const perComboTarget = 2;
for (let ci = 0; ci < combos.length; ci++) {
  const combo = combos[ci];
  let got = 0;
  const rng = mulberry(0x1357 + ci * 999);
  let samples = 0;
  while (got < perComboTarget && samples < 6000) {
    samples++;
    const guards = guardSets[Math.floor(rng() * guardSets.length)];
    const king = [4, 0];
    const occ = occOf(king, guards);
    const reds = samplePositions(combo, rng, occ);
    if (!reds) continue;
    const fen = makeFen(king, guards, reds);
    let st;
    try { st = E.createState({ fen }); } catch { continue; }
    if (E.isInCheck(st, 'b') || E.isInCheck(st, 'r')) continue;
    const r = shortest(fen, 3);
    if (!r) continue;
    // 形状去重: 子力+杀首着目标格+步数
    const shape = combo.join('') + ':' + r.m.to[0] + ',' + r.m.to[1] + ':' + r.n + ':' + guards.length;
    if (seenShape.has(shape)) continue;
    seenShape.add(shape);
    const ln = lineOf(fen, r.n);
    found.push({ combo: combo.join(''), gn: guards.length, n: r.n, fen, line: ln, first: E.moveNotation(E.createState({ fen }), r.m.from, r.m.to) });
    got++;
  }
  console.error(`combo ${combo.join('')}: ${got}/${perComboTarget} (samples ${samples})`);
}
console.log(JSON.stringify(found, null, 1));
