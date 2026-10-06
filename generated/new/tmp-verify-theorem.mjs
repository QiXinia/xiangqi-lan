// 定式分片校验：FEN 合法性 / 双方初始不被将 / legalMoves 非空 / 子力点位与数量检查
//   + 与 js/puzzles.js 现有 endgame 定式做「占位 + 左右镜像」去重。
// 用法：node generated/new/tmp-verify-theorem.mjs
import * as E from '../../js/engine.js';
import { PUZZLES } from '../../js/puzzles.js';
import { NEW_PUZZLES } from './theorem-endgames.mjs';

const set = (...a) => new Set(a.map(([x, y]) => x + ',' + y));
const K_R = set([3,9],[4,9],[5,9],[3,8],[4,8],[5,8],[3,7],[4,7],[5,7]);
const K_B = set([3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]);
const A_R = set([3,9],[5,9],[4,8],[3,7],[5,7]);
const A_B = set([3,0],[5,0],[4,1],[3,2],[5,2]);
const B_R = set([2,9],[6,9],[0,7],[4,7],[8,7],[2,5],[6,5]);
const B_B = set([2,0],[6,0],[0,2],[4,2],[8,2],[2,4],[6,4]);
const EVENS = new Set([0, 2, 4, 6, 8]);
const CAP = { K: 1, A: 2, B: 2, N: 2, R: 2, C: 2, P: 5 };

function pieceCount(cnt) { return Object.values(cnt).reduce((a, b) => a + b, 0); }

function checkFen(p) {
  const problems = [];
  // 字段约定
  if (p.chapter !== 'endgame') problems.push('chapter!=endgame');
  if (!['win', 'draw'].includes(p.type)) problems.push('type 非法: ' + p.type);
  if (p.type === 'win' && p.humanSide !== undefined) problems.push('win 不应写 humanSide');
  if (p.type === 'draw') {
    if (p.humanSide !== 'b') problems.push('draw 必须 humanSide=b');
    if (p.drawMoves !== 80) problems.push('draw 必须 drawMoves=80');
  }
  if (p.id !== undefined || p.line !== undefined || p.mate !== undefined) problems.push('不应写 id/line/mate');
  if (/[砲漢]/.test(p.hint || '')) problems.push('hint 含禁用字 砲/漢');
  if (/[砲漢]/.test(p.name || '')) problems.push('name 含禁用字 砲/漢');

  const rows = p.fen.trim().split(/\s+/)[0].split('/');
  if (rows.length !== 10) problems.push('行数=' + rows.length);
  if (!/\s+r$/.test(p.fen.trim())) problems.push('FEN 末尾应为 " r"');
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
    st = E.createState({ fen: p.fen });
    if (!E.findKing(st, 'r') || !E.findKing(st, 'b')) problems.push('缺王');
    if (st.turn !== 'r') problems.push('轮走方应为 r(红先), 实际=' + st.turn);
    if (E.isInCheck(st, 'b')) problems.push('黑将初始已被将军(非行棋方被迫被将)');
    if (E.isInCheck(st, 'r')) problems.push('红帅初始正被将军(行棋方起始被将)');
    const lm = E.legalMoves(st, st.turn);
    if (!lm.length) problems.push('轮到方无合法着法(开局即终局)');
  } catch (e) { problems.push('引擎异常: ' + e.message); }
  return { problems, cnt, st };
}

// 去重签名（含左右镜像）——与 generated/merge.mjs sigs 同口径
function sigs(fen) {
  const s = E.createState({ fen });
  const cells = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const c = s.board[y][x];
    if (c) cells.push(c.c + c.t + x + ',' + y);
  }
  cells.sort();
  const mir = cells.map((z) => {
    const [a, b, rest] = z;
    const [x, y] = rest.split(',').map(Number);
    return a + b + (8 - x) + ',' + y;
  }).sort();
  return [cells.join('|'), mir.join('|')];
}

// 现有 endgame 定式占位（正位 + 镜像）
const seen = new Map();
let egCount = 0;
for (const p of PUZZLES) {
  if (p.chapter !== 'endgame') continue;
  egCount++;
  try {
    const [sg, mg] = sigs(p.fen);
    seen.set(sg, p.name);
    seen.set(mg, p.name); // 镜像也占位，避免本分片与其左右镜像重复
  } catch (e) { /* ignore */ }
}

let bad = 0;
const nameSet = new Set(PUZZLES.map((p) => p.name));
const innerFen = new Set();
const innerName = new Set();

for (const p of NEW_PUZZLES) {
  const { problems, cnt } = checkFen(p);
  const [sg, mg] = sigs(p.fen);
  if (nameSet.has(p.name)) problems.push(`与现有 PUZZLES 重名: ${p.name}`);
  if (innerName.has(p.name)) problems.push(`分片内重名: ${p.name}`);
  if (innerFen.has(p.fen)) problems.push(`分片内 FEN 重复`);
  if (seen.has(sg)) problems.push(`与现有 endgame 局同形: == ${seen.get(sg)}`);
  if (seen.has(mg)) problems.push(`与现有 endgame 左右镜像: ≡ ${seen.get(mg)}`);
  seen.set(sg, p.name); seen.set(mg, p.name);
  innerName.add(p.name); innerFen.add(p.fen);

  const redN = pieceCount(cnt.r), blkN = pieceCount(cnt.b);
  const flag = problems.length ? 'FAIL' : 'OK';
  if (problems.length) bad++;
  console.log(`[${flag}] ${p.type==='win'?'例胜':'守和'} | ${p.name}`);
  console.log(`      FEN: ${p.fen}`);
  console.log(`      红 ${redN} 子 / 黑 ${blkN} 子`);
  if (problems.length) console.log(`      -> ${problems.join(' | ')}`);
}
console.log(`\n现有 endgame 定式占位: ${egCount}（win+draw）`);
console.log(`本分片: ${NEW_PUZZLES.length} 局（例胜 ${NEW_PUZZLES.filter(p=>p.type==='win').length} / 守和 ${NEW_PUZZLES.filter(p=>p.type==='draw').length}）, 不合格 ${bad} 局`);
