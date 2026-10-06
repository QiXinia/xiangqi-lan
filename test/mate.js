// 强制杀求解器: 证明红方存在 N 步必杀, 并给出着法序列
// 用法: node test/mate.js
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

// 返回红方胜的着法树(供复盘展示); n=红方剩余连走次数
function findMate(s, n, line, bestLines) {
  const red = E.legalMoves(s, 'r');
  for (const m of red) {
    const u = lmake(s, m);
    const blacks = E.legalMoves(s, 'b');
    let good = blacks.length === 0; // 黑无应着 => 成杀
    let subLines = [];
    if (!good && n > 1) {
      good = true;
      for (const bm of blacks) {
        const u2 = lmake(s, bm);
        const sub = findMate(s, n - 1, line.concat([m, bm]), bestLines);
        lundo(s, u2);
        if (!sub) { good = false; break; }
        subLines.push({ bm, sub });
      }
    }
    lundo(s, u);
    if (good) return { m, blacks: blacks.map(bm => bm), subLines, n };
  }
  return null;
}

// 求最短杀步数(1..maxN)
function shortestMate(fen, maxN = 4) {
  for (let n = 1; n <= maxN; n++) {
    const s = E.createState({ fen });
    const r = findMate(s, n, [], null);
    if (r) return { n, first: r.m, fen };
  }
  return null;
}

// 打印一条主变
function mainLine(fen, n) {
  const s = E.createState({ fen });
  const out = [];
  let cur = n;
  while (cur > 0) {
    const r = findMate(s, cur, [], null);
    if (!r) break;
    out.push(E.moveNotation(s, r.m.from, r.m.to));
    lmake(s, r.m);
    const blacks = E.legalMoves(s, 'b');
    if (!blacks.length) { out.push('#'); break; }
    // 选黑方最"顽强"应对(延长杀局): 取让红最短杀最大的; 简单取第一个
    const bm = blacks[0];
    out.push(E.moveNotation(s, bm.from, bm.to));
    lmake(s, bm);
    cur--;
  }
  return out.join(' ');
}

// ---------------- 候选残局(红先) ----------------
const puzzles = [
  ['马后炮', '4k4/9/4N4/9/5C3/9/9/9/9/3K5 r', 1],
  ['双车错', '4k4/8R/R8/9/9/9/9/9/9/3K5 r', 1],
  ['闭宫车', '3aka3/8R/R8/9/9/9/9/9/9/3K5 r', 1],
  ['白马现蹄', '4k4/9/9/9/9/9/9/9/4R4/4K4 r', 99], // 探测
];

for (const [name, fen, claim] of puzzles) {
  const r = shortestMate(fen, 4);
  if (r) {
    console.log(`✓ ${name}: 红 ${r.n} 步杀 (关卡目标 ${claim}) 首着 ${E.moveNotation(E.createState({ fen }), r.first.from, r.first.to)} | ${mainLine(fen, r.n)}`);
  } else {
    console.log(`✗ ${name}: 4 步内无强制杀`);
  }
}
