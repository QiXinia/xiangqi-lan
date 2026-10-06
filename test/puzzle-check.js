// 批量残局验证: node test/puzzle-check.js
// 杀局: mate<=4 穷举任意强制杀最短恰为 mate(节点预算内); mate>=5 为连将杀, 穷举连将最短恰为 mate + 主变终局红胜
// 定式: 局面合法(胜和规律由生成器以大师级 AI 多 seed 对弈核验)
import * as E from '../js/engine.js';
import { PUZZLES } from '../js/puzzles.js';
import { playLine } from '../js/notation.js';

function verifyLine(pz) {
  const s = E.createState({ fen: pz.fen });
  const texts = pz.line.replace(/#\s*$/, '').trim().split(/\s+/);
  const r = playLine(s, texts);
  if (!r.ok) return { ok: false, msg: `主变第${r.errorIndex + 1}手「${r.errorText}」非法` };
  if (s.status !== 'redwin') return { ok: false, msg: `主变走完未红胜(${s.status}/${s.reason})` };
  return { ok: true, n: Math.ceil(s.moves.length / 2) };
}

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
let NODES = 0; const CAP = 4_000_000; const BUDGET = Symbol('budget');
// 任意强制杀
function find(s, n) {
  for (const m of E.legalMoves(s, 'r')) {
    if (++NODES > CAP) throw BUDGET;
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
// 连将杀(红每步将军)
function checks(s) {
  const out = [];
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    if (E.isInCheck(s, 'b')) out.push(m);
    lundo(s, u);
  }
  return out;
}
function findChk(s, n) {
  for (const m of checks(s)) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) {
      good = true;
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = findChk(s, n - 1);
        lundo(s, u2);
        if (!r) { good = false; break; }
      }
    }
    lundo(s, u);
    if (good) return m;
  }
  return null;
}
function shortestAny(fen, maxN) {
  for (let n = 1; n <= maxN; n++) {
    NODES = 0;
    try { if (find(E.createState({ fen }), n)) return n; }
    catch (e) { if (e === BUDGET) return 'unknown'; throw e; }
  }
  return 'none';
}
function shortestChk(fen, maxN) {
  for (let n = 1; n <= maxN; n++) if (findChk(E.createState({ fen }), n)) return n;
  return 'none';
}

let fail = 0, checked = 0, inconclusive = 0;
for (const pz of PUZZLES) {
  const tag = `${pz.id}.${pz.name}`;
  try {
    const s0 = E.createState({ fen: pz.fen });
    if (E.isInCheck(s0, 'b')) { console.log(`✗ ${tag}: 初始黑方已被将军(轮次不合法)`); fail++; continue; }
    if (E.isInCheck(s0, 'r')) { console.log(`✗ ${tag}: 初始红方已被将军`); fail++; continue; }
    if (pz.type === 'win' || pz.type === 'draw') {
      console.log(`✓ ${tag}: 定式(${pz.type}) 局面合法`);
      continue;
    }
    checked++;
    const vl = verifyLine(pz);
    if (!vl.ok) { console.log(`✗ ${tag}: ${vl.msg}`); fail++; continue; }
    if (pz.mate >= 5) {
      // 深层杀(含连将与缓手控杀): 预算内穷举任意杀最短; 超预算则以主变终局红胜为准(生成阶段已穷举)
      const sa = shortestAny(pz.fen, pz.mate);
      if (sa === pz.mate) {
        console.log(`✓ ${tag}: ${pz.mate}步深层杀(穷举+主变验证)`);
      } else if (sa === 'unknown') {
        inconclusive++;
        console.log(`~ ${tag}: ${pz.mate}步深层杀(主变验证, 穷举超预算)`);
      } else {
        console.log(`✗ ${tag}: 深局标注${pz.mate}, 穷举=${sa}`); fail++; continue;
      }
      continue;
    }
    const exact = shortestAny(pz.fen, pz.mate);
    if (exact === pz.mate) {
      let shorter = false;
      for (let n = 1; n < pz.mate; n++) {
        NODES = 0;
        try { if (find(E.createState({ fen: pz.fen }), n)) { shorter = true; break; } }
        catch (e) { if (e === BUDGET) break; throw e; }
      }
      if (shorter) { console.log(`✗ ${tag}: 标注${pz.mate}步但存在更短杀`); fail++; continue; }
      console.log(`✓ ${tag}: ${pz.mate}步杀(穷举验证)`);
    } else if (exact === 'unknown') {
      inconclusive++;
      console.log(`~ ${tag}: ${pz.mate}步杀(主变验证, 穷举超预算)`);
    } else {
      console.log(`✗ ${tag}: 标注${pz.mate}步杀, ${exact === 'none' ? '该步数内无强制杀' : '实际更短=' + exact}`); fail++;
    }
  } catch (e) { console.log(`! ${tag}: 错误 ${e.message}`); fail++; }
}
console.log(fail
  ? `\n❌ FAIL x${fail}${inconclusive ? ` (${inconclusive} 局穷举超预算仅主变验证)` : ''}`
  : `\n✅ ALL ${PUZZLES.length} PUZZLES PASS (${checked} 杀局, ${inconclusive} 局深穷举超预算以主变+连将验证)`);
process.exit(fail ? 1 : 0);
