// 残局 FEN 合法性体检: 棋子合法位/数量/初始将军状态/着法可走通
import { PUZZLES } from '../js/puzzles.js';
import { createState, isInCheck, legalMoves, findKing } from '../js/engine.js';
import { playLine } from '../js/notation.js';

const set = (...a) => new Set(a.map(([x, y]) => x + ',' + y));
// 九宫
const K_R = set([3,9],[4,9],[5,9],[3,8],[4,8],[5,8],[3,7],[4,7],[5,7]); // 帅
const K_B = set([3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]); // 将
const A_R = set([3,9],[5,9],[4,8],[3,7],[5,7]); // 仕
const A_B = set([3,0],[5,0],[4,1],[3,2],[5,2]); // 士
const B_R = set([2,9],[6,9],[0,7],[4,7],[8,7],[2,5],[6,5]); // 相
const B_B = set([2,0],[6,0],[0,2],[4,2],[8,2],[2,4],[6,4]); // 象
const EVENS = new Set([0,2,4,6,8]);
const CAP = { K: 1, A: 2, B: 2, N: 2, R: 2, C: 2, P: 5 };

function checkFen(pz) {
  const problems = [];
  const rows = pz.fen.trim().split(/\s+/)[0].split('/');
  if (rows.length !== 10) problems.push('行数=' + rows.length);
  const cnt = { r: {}, b: {} };
  for (let y = 0; y < 10 && y < rows.length; y++) {
    let x = 0;
    for (const ch of rows[y]) {
      if (/\d/.test(ch)) { x += +ch; continue; }
      if (x > 8) { problems.push(`y${y} 行宽溢出`); break; }
      if (ch === 'x' || ch === 'o') { x++; continue; }
      const upper = ch.toUpperCase();
      const isR = ch === upper;
      const c = isR ? 'r' : 'b';
      cnt[c][upper] = (cnt[c][upper] || 0) + 1;
      const key = x + ',' + y;
      if (upper === 'K') { if (isR ? !K_R.has(key) : !K_B.has(key)) problems.push(`${isR?'帅':'将'}越九宫 @${key}`); }
      else if (upper === 'A') { if (isR ? !A_R.has(key) : !A_B.has(key)) problems.push(`${isR?'仕':'士'}位非法 @${key}`); }
      else if (upper === 'B') { if (isR ? !B_R.has(key) : !B_B.has(key)) problems.push(`${isR?'相':'象'}位非法 @${key}`); }
      else if (upper === 'P') {
        if (isR) { if (y > 6) problems.push(`红兵越底线 @${key}`);
          else if (y >= 5 && !EVENS.has(x)) problems.push(`红兵未过河离列 @${key}`); }
        else { if (y < 3) problems.push(`黑卒越底线 @${key}`);
          else if (y <= 4 && !EVENS.has(x)) problems.push(`黑卒未过河离列 @${key}`); }
      }
      x++;
    }
    if (x !== 9) problems.push(`y${y} 行宽=${x}(应9)`);
  }
  for (const c of ['r', 'b']) {
    for (const t in CAP) {
      const n = cnt[c][t] || 0;
      if (t === 'K' && n !== 1) problems.push(`${c==='r'?'红':'黑'}方王数量=${n}`);
      if (t !== 'K' && n > CAP[t]) problems.push(`${c==='r'?'红':'黑'}方${t}数量=${n}>${CAP[t]}`);
    }
  }
  // 引擎层
  let st = null;
  try {
    st = createState({ fen: pz.fen });
    if (!findKing(st, 'r') || !findKing(st, 'b')) problems.push('缺王');
    if (st.turn === 'r' && isInCheck(st, 'b')) problems.push('轮红走但黑将已被将军(该黑应将)');
    if (st.turn === 'r' && isInCheck(st, 'r')) problems.push('轮红走且红帅正被将军(首着被迫解将, 与杀法参考线可能冲突)');
    const lm = legalMoves(st, st.turn);
    if (!lm.length) problems.push('轮到方无合法着法(开局即终局)');
  } catch (e) { problems.push('引擎异常: ' + e.message); }
  // 参考线可走通
  if (pz.line && st) {
    const r = playLine(createState({ fen: pz.fen }), pz.line.replace(/#/g, '').trim());
    if (r.errors && r.errors.length) problems.push('参考线不可走: ' + r.errors.slice(0, 2).join('; '));
  }
  return problems;
}

let bad = 0;
const byCh = {};
for (const pz of PUZZLES) {
  const ps = checkFen(pz);
  if (ps.length) {
    bad++;
    byCh[pz.chapter] = (byCh[pz.chapter] || 0) + 1;
    console.log(`#${pz.id} [${pz.chapter}] ${pz.name}\n   ${pz.fen}\n   -> ${ps.join(' | ')}`);
  }
}
console.log(`\n共 ${PUZZLES.length} 关, 非法/存疑 ${bad} 关`, JSON.stringify(byCh));
