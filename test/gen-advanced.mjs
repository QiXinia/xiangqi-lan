// 进阶连将杀枚举(4-6 步, 每手红着必须将军): node test/gen-advanced.mjs
import * as E from '../js/engine.js';

function lmake(s, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty };
}
function lundo(s, u) {
  s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap;
  s.turn = s.turn === 'r' ? 'b' : 'r';
}
let BUDGET = 0;
// 只考虑将军着法的强制杀(连将杀)
function findCheck(s, n) {
  if (BUDGET-- <= 0) return null;
  const cands = [];
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    const chk = E.isInCheck(s, 'b');
    lundo(s, u);
    if (chk) cands.push(m);
  }
  for (const m of cands) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) {
      good = true;
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = findCheck(s, n - 1);
        lundo(s, u2);
        if (!r) { good = false; break; }
      }
    }
    lundo(s, u);
    if (good) return m;
  }
  return null;
}
// 允许缓手的强制杀(任意 n 步杀)
function findAll(s, n) {
  if (BUDGET-- <= 0) return null;
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) {
      good = true;
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = findAll(s, n - 1);
        lundo(s, u2);
        if (!r) { good = false; break; }
      }
    }
    lundo(s, u);
    if (good) return m;
  }
  return null;
}
function lineCheck(fen, n) {
  const s = E.createState({ fen }); const out = []; let cur = n, guard = 0;
  while (cur > 0 && guard++ < 20) {
    const r = findCheck(s, cur);
    if (!r) break;
    out.push(E.moveNotation(s, r.from, r.to));
    lmake(s, r);
    const bs = E.legalMoves(s, 'b');
    if (!bs.length) { out.push('#'); break; }
    let best = null, bestN = -1;
    for (const bm of bs) {
      const u2 = lmake(s, bm);
      let k = 0; for (let z = 1; z <= 6; z++) { BUDGET = 200000; if (findCheck(s, z)) { k = z; break; } }
      lundo(s, u2);
      if (k === 0) { best = bm; break; }
      if (k > bestN) { bestN = k; best = bm; }
    }
    out.push(E.moveNotation(s, best.from, best.to));
    lmake(s, best);
    cur--;
  }
  return out.join(' ');
}

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeFen(guards, reds, king = [4, 0]) {
  const g = Array.from({ length: 10 }, () => Array(9).fill(''));
  g[king[1]][king[0]] = 'k';
  for (const [t, x, y] of guards) g[y][x] = t;
  for (const [t, x, y] of reds) g[y][x] = t;
  g[9][3] = 'K';
  return g.map(row => { let o = '', e = 0; for (const c of row) { if (!c) { e++; continue; } if (e) { o += e; e = 0; } o += c; } if (e) o += e; return o; }).join('/') + ' r';
}
const guardSets = [
  [['a', 3, 0], ['a', 5, 0], ['b', 2, 0], ['b', 6, 0]],
  [['a', 3, 0], ['a', 5, 0]],
  [['b', 2, 0], ['b', 6, 0]],
  [['a', 3, 0]],
  [['a', 3, 0], ['b', 2, 0], ['b', 6, 0]]
];
const combos = [
  ['R', 'R', 'C'], ['R', 'N', 'C'], ['R', 'C', 'C'], ['R', 'R', 'N'],
  ['N', 'N', 'C'], ['R', 'N', 'P'], ['R', 'C', 'P'], ['N', 'C', 'P'],
  ['R', 'R', 'P'], ['N', 'N', 'R'], ['R', 'N', 'N'], ['C', 'C', 'N']
];
const occOf = (guards) => { const s = new Set(['4,0', '3,9']); for (const [, x, y] of guards) s.add(x + ',' + y); return s; };
function samplePositions(combo, rng, occ) {
  const ys = (t) => (t === 'P' || t === 'N') ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
  const reds = []; const used = new Set(occ);
  for (const t of combo) {
    let tries = 0, x, y, key;
    do { x = Math.floor(rng() * 9); y = ys(t)[Math.floor(rng() * ys(t).length)]; key = x + ',' + y; tries++; } while (used.has(key) && tries < 80);
    if (used.has(key)) return null;
    used.add(key); reds.push([t, x, y]);
  }
  return reds;
}

const found = []; const seen = new Set();
const quota = { 4: 6, 5: 3, 6: 1 }; const got = { 4: 0, 5: 0, 6: 0 };
let samples = 0;
outer:
for (let round = 0; round < 60000 && found.length < 10; round++) {
  samples++;
  const combo = combos[round % combos.length];
  const rng = mulberry(round * 7919 + 13);
  for (let attempt = 0; attempt < 60; attempt++) {
    const guards = guardSets[Math.floor(rng() * guardSets.length)];
    const reds = samplePositions(combo, rng, occOf(guards));
    if (!reds) continue;
    const fen = makeFen(guards, reds);
    let st; try { st = E.createState({ fen }); } catch { continue; }
    if (E.isInCheck(st, 'b') || E.isInCheck(st, 'r')) continue;
    // 第一步: 快速求最短连将杀(连将分支小)
    let pickN = 0;
    for (let n = 1; n <= 6; n++) { BUDGET = 1500000; if (findCheck(E.createState({ fen }), n)) { pickN = n; break; } }
    if (pickN < 4 || got[pickN] >= quota[pickN]) continue;
    // 第二步: 不得存在更短的任意杀(缓杀/控杀)
    let shorter = false;
    for (let z = 1; z < pickN; z++) { BUDGET = 1000000; if (findAll(E.createState({ fen }), z)) { shorter = true; break; } }
    if (shorter) continue;
    BUDGET = 1500000;
    const res = { n: pickN, m: findCheck(E.createState({ fen }), pickN) };
    if (!res.m) continue;
    const shape = combo.join('') + res.n + guards.length;
    if (seen.has(shape)) continue;
    const ln = lineCheck(fen, pickN);
    if (!ln.endsWith('#')) continue;
    seen.add(shape); got[pickN]++;
    found.push({ combo: combo.join(''), gn: guards.length, n: pickN, fen, line: ln });
    console.error(`got ${found.length}/10:`, combo.join(''), 'n=' + pickN, ln);
    continue outer;
  }
}
console.log(JSON.stringify(found, null, 1));
console.error('samples', samples);
