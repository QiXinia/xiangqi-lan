// 名局鉴赏分片回放校验：逐条建状态、做合法性检查、playLine 回放、打印终局 status、与 PUZZLES 去重
// 用法：node generated/new/tmp-verify-famous.mjs
import * as E from '../../js/engine.js';
import { playLine } from '../../js/notation.js';
import { PUZZLES } from '../../js/puzzles.js';
import { NEW_OPENINGS } from './famous-endgames.mjs';

const set = (...a) => new Set(a.map(([x, y]) => x + ',' + y));
const K_R = set([3,9],[4,9],[5,9],[3,8],[4,8],[5,8],[3,7],[4,7],[5,7]);
const K_B = set([3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]);
const A_R = set([3,9],[5,9],[4,8],[3,7],[5,7]);
const A_B = set([3,0],[5,0],[4,1],[3,2],[5,2]);
const B_R = set([2,9],[6,9],[0,7],[4,7],[8,7],[2,5],[6,5]);
const B_B = set([2,0],[6,0],[0,2],[4,2],[8,2],[2,4],[6,4]);
const EVENS = new Set([0,2,4,6,8]);

function checkFen(entry) {
  const problems = [];
  const rows = entry.fen.trim().split(/\s+/)[0].split('/');
  if (rows.length !== 10) problems.push('行数=' + rows.length);
  const cnt = { r: {}, b: {} };
  for (let y = 0; y < 10 && y < rows.length; y++) {
    let x = 0;
    for (const ch of rows[y]) {
      if (/\d/.test(ch)) { x += +ch; continue; }
      if (x > 8) { problems.push(`y${y} 行宽溢出`); break; }
      const upper = ch.toUpperCase();
      const isR = ch === upper;
      const c = isR ? 'r' : 'b';
      cnt[c][upper] = (cnt[c][upper] || 0) + 1;
      const key = x + ',' + y;
      if (upper === 'K') { if (isR ? !K_R.has(key) : !K_B.has(key)) problems.push(`${isR?'帅':'将'}越九宫 @${key}`); }
      else if (upper === 'A') { if (isR ? !A_R.has(key) : !A_B.has(key)) problems.push(`${isR?'仕':'士'}位非法 @${key}`); }
      else if (upper === 'B') { if (isR ? !B_R.has(key) : !B_B.has(key)) problems.push(`${isR?'相':'象'}位非法 @${key}`); }
      else if (upper === 'P') {
        // 仅检查"未过河兵卒"必须在偶数列(0/2/4/6/8)；过河兵卒可横走，列不限。
        if (isR) { if (y >= 5 && !EVENS.has(x)) problems.push(`红兵未过河离列 @${key}`); }
        else { if (y <= 4 && !EVENS.has(x)) problems.push(`黑卒未过河离列 @${key}`); }
      }
      x++;
    }
    if (x !== 9) problems.push(`y${y} 行宽=${x}(应9)`);
  }
  for (const c of ['r', 'b']) {
    const n = cnt[c]['K'] || 0;
    if (n !== 1) problems.push(`${c==='r'?'红':'黑'}方王数量=${n}(应恰1)`);
  }
  let st = null;
  try {
    st = E.createState({ fen: entry.fen });
    if (!E.findKing(st, 'r') || !E.findKing(st, 'b')) problems.push('缺王');
    if (st.turn === 'r' && E.isInCheck(st, 'b')) problems.push('轮红走但黑方已被将军(非行棋方不得已被将)');
    if (st.turn === 'r' && E.isInCheck(st, 'r')) problems.push('轮红走且红帅正被将军(行棋方起始被将)');
    const lm = E.legalMoves(st, st.turn);
    if (!lm.length) problems.push('轮到方无合法着法(开局即终局)');
  } catch (e) { problems.push('引擎异常: ' + e.message); }
  return { problems, st, cnt };
}

let bad = 0;
const seenName = new Set();
const seenFen = new Set();
const puzzleNames = new Set(PUZZLES.map((p) => p.name));

for (const entry of NEW_OPENINGS) {
  const { problems, cnt } = checkFen(entry);
  const s2 = E.createState({ fen: entry.fen });
  const r = playLine(s2, entry.moves);
  const redN = Object.values(cnt.r).reduce((a,b)=>a+b,0);
  const blkN = Object.values(cnt.b).reduce((a,b)=>a+b,0);
  if (!r.ok) problems.push(`playLine 在第 ${r.errorIndex} 着(${entry.moves[r.errorIndex]})失败: ${r.errorText}`);
  if (seenName.has(entry.name)) problems.push(`分片内重名: ${entry.name}`);
  if (seenFen.has(entry.fen)) problems.push(`分片内 FEN 重复: ${entry.fen}`);
  if (puzzleNames.has(entry.name)) problems.push(`与现有 PUZZLES 重名: ${entry.name}`);
  seenName.add(entry.name); seenFen.add(entry.fen);

  const flag = problems.length ? 'FAIL' : 'OK';
  if (problems.length) bad++;
  console.log(`[${flag}] ${entry.family} / ${entry.name}`);
  console.log(`   FEN: ${entry.fen}`);
  console.log(`   子力: 红${redN} 黑${blkN} | 主线 ${entry.moves.length} 着 | 回放 ${r.ok?'全合法':'非法'} | 终局 status=${s2.status} | result=${entry.result}`);
  if (problems.length) console.log(`   -> ${problems.join(' | ')}`);
}
console.log(`\n共 ${NEW_OPENINGS.length} 局, 不合格 ${bad} 局`);
