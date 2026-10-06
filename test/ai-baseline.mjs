// ============================================================
// 象棋 AI: negamax + alpha-beta(PVS 根) + Zobrist 置换表
//   + 杀手走法/历史启发走法排序 + 空着裁剪(null-move)
//   + 将军扩展 + MVV-LVA + 吃子静态搜索(quiescence) + 迭代加深
// 五级难度: 1 入门 / 2 初级 / 3 中级 / 4 高级 / 5 大师
// ============================================================
import {
  pseudoMoves, isInCheck, toFEN, pieceTargets
} from '../js/engine.js';
import { openingBookMove } from '../js/openings.js';
import { findForcedMate } from '../js/mate-solver.js';
import { SOL_MAPS } from '../js/sol-maps.js';

const VAL = { K: 60000, A: 200, B: 200, N: 400, R: 900, C: 450, P: 100 };
export const MATE = 100000;
const DARK_EV = (200 * 4 + 400 * 2 + 900 * 2 + 450 * 2 + 100 * 5) / 15;

// 位置表(红方视角, y=9 红底线; 黑方镜像 y->9-y, x->8-x)
const PST = {
  R: [
    [14, 14, 12, 18, 16, 18, 12, 14, 14],
    [34, 30, 22, 26, 24, 26, 22, 30, 34],
    [18, 14, 12, 18, 18, 18, 12, 14, 18],
    [10, 6, 4, 8, 10, 8, 4, 6, 10],
    [4, 2, 0, 4, 6, 4, 0, 2, 4],
    [4, 2, 0, 4, 6, 4, 0, 2, 4],
    [2, 0, -2, 2, 4, 2, -2, 0, 2],
    [-2, -4, -4, 0, 4, 0, -4, -4, -2],
    [-4, -6, -6, -4, -2, -4, -6, -6, -4],
    [-6, -8, -8, -6, -4, -6, -8, -8, -6]],
  N: [
    [4, 8, 16, 12, 4, 12, 16, 8, 4],
    [4, 10, 28, 16, 8, 16, 28, 10, 4],
    [12, 14, 16, 20, 18, 20, 16, 14, 12],
    [8, 24, 18, 22, 20, 22, 18, 24, 8],
    [6, 16, 14, 18, 16, 18, 14, 16, 6],
    [4, 12, 16, 14, 12, 14, 16, 12, 4],
    [2, 6, 10, 12, 8, 12, 10, 6, 2],
    [-2, 4, 8, 10, 6, 10, 8, 4, -2],
    [0, 2, 4, 6, 4, 6, 4, 2, 0],
    [0, -2, 2, 4, 2, 4, 2, -2, 0]],
  C: [
    [6, 4, 0, -10, -12, -10, 0, 4, 6],
    [2, 2, 0, -4, -14, -4, 0, 2, 2],
    [2, 2, 0, -10, -8, -10, 0, 2, 2],
    [0, 0, -2, 4, 10, 4, -2, 0, 0],
    [0, 0, 0, 2, 8, 2, 0, 0, 0],
    [-2, 0, 4, 2, 6, 2, 4, 0, -2],
    [4, 6, 6, 8, 10, 8, 6, 6, 4],
    [6, 8, 10, 12, 14, 12, 10, 8, 6],
    [6, 6, 8, 12, 14, 12, 8, 6, 6],
    [4, 4, 6, 10, 12, 10, 6, 4, 4]],
  P: [
    [0, 0, 0, 6, 10, 6, 0, 0, 0],
    [10, 16, 20, 28, 30, 28, 20, 16, 10],
    [12, 18, 22, 30, 34, 30, 22, 18, 12],
    [8, 14, 18, 24, 26, 24, 18, 14, 8],
    [4, 8, 12, 16, 20, 16, 12, 8, 4],
    [0, 2, 4, 6, 8, 6, 4, 2, 0],
    [0, 0, 0, 2, 4, 2, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  A: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 2, 0, 0, 0],
    [0, 0, 0, 0, 6, 0, 0, 0, 0],
    [0, 0, 0, 4, 0, 4, 0, 0, 0]],
  B: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 2, 0, 0, 0, 2, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 4, 0, 0, 0, 2],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 4, 0, 0, 0, 4, 0, 0]],
  K: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 2, 0, 0, 0],
    [0, 0, 0, 4, 8, 4, 0, 0, 0],
    [0, 0, 0, 2, 8, 2, 0, 0, 0]]
};

const pieceVal = (p) => !p ? 0 : (p.hidden ? DARK_EV : VAL[p.t]);

// ---------- Zobrist 增量哈希 ----------
function mul32(a, b) { return (a * b) >>> 0; }
function zRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    s ^= s >>> 15; s = Math.imul(s, 2246822507) >>> 0;
    s ^= s >>> 13; s = Math.imul(s, 3266489909) >>> 0;
    s ^= s >>> 16;
    return s >>> 0;
  };
}
const ZTYPES = ['K', 'A', 'B', 'N', 'R', 'C', 'P'];
const Z = { r: {}, b: {} };
{
  const rnd = zRng(0x58514348); // "XQZH"
  for (const c of ['r', 'b']) for (const t of ZTYPES) {
    Z[c][t] = new Array(90);
    for (let i = 0; i < 90; i++) Z[c][t][i] = rnd();
  }
}
const ZTURN = 0x9e3779b9;
function boardKey(state) {
  let k = 0;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (p) k ^= Z[p.c][p.hidden ? p.orig : p.t][y * 9 + x];
  }
  if (state.turn === 'b') k ^= ZTURN;
  return k >>> 0;
}

// ---------- 局面评估 ----------
// 棋风系数: balance 均衡 / attack 进攻(重机动与压境, 轻视士象) / solid 稳健(重防线, 轻冒进)
const STYLE = {
  balance: { guard: 1.0, mob: 2, cross: 1.0 },
  attack:  { guard: 0.45, mob: 4, cross: 1.35 },
  solid:   { guard: 1.6, mob: 1, cross: 0.75 }
};
let _style = STYLE.balance;
function evaluate(state) {
  let score = 0, crossAtk = 0; // 过河进攻子(红方视角净值, 正=红占优)
  const guards = { r: { A: 0, B: 0, R: 0, C: 0 }, b: { A: 0, B: 0, R: 0, C: 0 } };
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (!p) continue;
    const sign = p.c === 'r' ? 1 : -1;
    if (p.hidden) {
      score += sign * (VAL[p.orig] * 0.5 + DARK_EV * 0.5);
      continue;
    }
    let v = VAL[p.t];
    if (p.t === 'P') {
      if (p.c === 'r' && y <= 4) v += 100;
      if (p.c === 'b' && y >= 5) v += 100;
    }
    if (p.t === 'A' || p.t === 'B' || p.t === 'R' || p.t === 'C') guards[p.c][p.t]++;
    const py = p.c === 'r' ? y : 9 - y;
    const px = p.c === 'r' ? x : 8 - x;
    let bonus = PST[p.t] ? PST[p.t][py][px] : 0;
    // 战术位置加成(红方视角坐标)
    if (p.t === 'R') {
      if (py <= 4) { bonus += 14; crossAtk += sign; } // 车过河
      if (py <= 1) bonus += 14;            // 沉底车
      if (py <= 4 && (px === 3 || px === 5)) bonus += 8; // 肋车
    } else if (p.t === 'C') {
      if (py <= 4) { bonus += 8; crossAtk += sign * 0.6; } // 炮过河
      if (px === 4 && py <= 5) bonus += 6; // 中炮
    } else if (p.t === 'N') {
      if (py <= 4) { bonus += 12; crossAtk += sign * 0.7; } // 马过河
    } else if (p.t === 'P') {
      if (py <= 2) bonus += 40;            // 兵临城下
      if (py <= 4 && px >= 3 && px <= 5) bonus += 12; // 兵入九宫方向
    }
    score += sign * (v + bonus);
  }
  // 士象残缺且对方有车/炮时, 防守方受罚
  const guardPen = ((2 - guards.r.A) + (2 - guards.r.B)) * (guards.b.R * 10 + guards.b.C * 4)
    - ((2 - guards.b.A) + (2 - guards.b.B)) * (guards.r.R * 10 + guards.r.C * 4);
  score += guardPen * _style.guard;
  score += crossAtk * 10 * (_style.cross - 1); // 进攻风奖励压境, 稳健风抑制
  if (state._mobility) score += (pseudoCount(state, 'r') - pseudoCount(state, 'b')) * _style.mob;
  return score;
}
function pseudoCount(state, c) {
  let n = 0;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (p && p.c === c) n += pieceTargets(state, p, x, y).length;
  }
  return n;
}
// 该方是否还有重子(空着裁剪前提, 避免兵卒残局误剪)
function hasHeavy(state, c) {
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (p && p.c === c && !p.hidden && (p.t === 'R' || p.t === 'C')) return true;
  }
  return false;
}

// ---------- 搜索用轻量 make/unmake(含增量哈希) ----------
function smake(state, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const piece = state.board[fy][fx];
  const cap = state.board[ty][tx];
  state.board[ty][tx] = piece;
  state.board[fy][fx] = null;
  const wasHidden = piece.hidden, orig = piece.orig;
  if (wasHidden) { piece.hidden = false; piece.orig = undefined; }
  state.turn = state.turn === 'r' ? 'b' : 'r';
  return { piece, cap, fx, fy, tx, ty, wasHidden, orig };
}
function sunmake(state, u) {
  state.board[u.fy][u.fx] = u.piece;
  state.board[u.ty][u.tx] = u.cap;
  if (u.wasHidden) { u.piece.hidden = true; u.piece.orig = u.orig; }
  state.turn = state.turn === 'r' ? 'b' : 'r';
}
function zApply(key, u) {
  // 源格按翻开前表观类型(orig), 目标格按翻开后真身(piece.t), 与 boardKey 全量键保持一致
  const srcT = u.wasHidden ? u.orig : u.piece.t;
  key ^= Z[u.piece.c][srcT][u.fy * 9 + u.fx];
  key ^= Z[u.piece.c][u.piece.t][u.ty * 9 + u.tx];
  if (u.cap) key ^= Z[u.cap.c][u.cap.hidden ? u.cap.orig : u.cap.t][u.ty * 9 + u.tx];
  return (key ^ ZTURN) >>> 0;
}

const sameMove = (m, f, t) => m && m.from[0] === f && m.from[1] === f && m.to[0] === t && m.to[1] === t;
// 与 engine.positionKey 同构, 用于查询重复计数
function ePosKey(state) {
  let k = state.turn;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (p) k += `/${x},${y},${p.c}${p.hidden ? '~' + p.orig : p.t}`;
  }
  return k;
}
// 走完后若形成第三次重复: 占优着法重罚(避免主动作和), 劣势容忍(劣势谋和), 长将无杀轻罚
function repetitionPenalty(state, v) {
  if (!state.posCount || v > MATE - 500) return 0;
  const cnt = state.posCount.get(ePosKey(state)) || 0;
  if (cnt < 2) return 0;
  if (v > 100) return 500;
  if (v < -100) return 120;
  return 80;
}

// ---------- 根层多变性: 仅在"等优着法"之间做加权随机, 不碰搜索内核与残局确定性 ----------
// 噪声窗 W(厘): 等级越低窗越大(允许更大抖动), 大师级很小但非 0; 兵≈100 厘
const NOISE_W = [0, 70, 45, 28, 14, 7];
// 重复抑制(厘): 等级越低惩罚越大, 用于打破均势拉锯; 仅根层平局区分
const REP_PEN = [0, 15, 13, 11, 9, 8];

// 根层重复/往返判定: 入参 state 已 smake(m)(行棋方已翻为对方)
function rootRepeatScore(state, m, level) {
  let pen = 0;
  // (a) 同一子立即往返: 我上一手从 A 走到 B, 本手又从 B 退回 A
  const hist = state.moves;
  if (hist && hist.length >= 2) {
    const myPrev = hist[hist.length - 2]; // 最近一手是对手, 再上一手是我
    if (myPrev && myPrev.c === state.turn
      && myPrev.from[0] === m.to[0] && myPrev.from[1] === m.to[1]
      && myPrev.to[0] === m.from[0] && myPrev.to[1] === m.from[1]) {
      pen = Math.max(pen, REP_PEN[level] || 10);
    }
  }
  // (b) 走完后重现已见局面(posCount 仅真实对局存在; 键含行棋方, 与根键不同不会误判)
  if (state.posCount && (state.posCount.get(ePosKey(state)) || 0) >= 1) {
    pen = Math.max(pen, REP_PEN[level] || 10);
  }
  return pen;
}

// 开局早期微小进取引导(厘, ≤6): 把后备子开出 / 过河推进, 仅用于等优着间区分
function rootDevBonus(state, m) {
  const hist = state.moves;
  if (!hist || hist.length > 10) return 0;
  const piece = state.board[m.from[1]][m.from[0]];
  if (!piece) return 0;
  let b = 0;
  const homeY = piece.c === 'r' ? 9 : 0;
  if (m.from[1] === homeY && piece.t !== 'K' && piece.t !== 'A') b += 3; // 出动后备子
  if (piece.c === 'r' && m.from[1] >= 5 && m.to[1] <= 4) b += 3;         // 红过河
  if (piece.c === 'b' && m.from[1] <= 4 && m.to[1] >= 5) b += 3;         // 黑过河
  return Math.min(6, b);
}

// Multi-PV 根着法加权选择:
//   在上一完成深度 doneDepth 上, 用紧上界快速筛除"明显劣于 best+W"的着法(TT 已热);
//   对落在噪声窗 W 内的等优着, 计入厘级重复抑制/进取微调后做 softmax 加权随机。
//   时间不够/异常 → 返回 null, 由调用方回退确定性 argmax。
function pickDiverseRootMove(state, bestMove, bestScore, doneDepth, ctx, deadline, level, rng) {
  const W = NOISE_W[level] || 10;
  if (doneDepth < 2 || W <= 0) return null;
  const rootKey = boardKey(state);
  const list = legalMovesScored(state, state.turn, ctx, 0, bestMove, null);
  const floor = bestScore - W - 80; // 严格低于此值(差>W 且留 80 噪声裕量)的着法出局
  const scored = [];
  ctx.stop = false;
  for (const { m } of list) {
    if (Date.now() > deadline || ctx.stop) return null; // 时间不够 → 回退确定性
    const u = smake(state, m);
    const givesCheck = isInCheck(state, state.turn);
    // 紧上界探根分: child 窗 (-Inf,-floor)。返回 v>floor ⟹ 为精确根分且落在等优竞争带内;
    // v<=floor ⟹ 该着确实差于 floor(超出 W), 不计入。
    const v = -negamax(state, doneDepth - 1 + (givesCheck ? 1 : 0), -Infinity, -floor, 1, ctx, zApply(rootKey, u), true);
    if (ctx.stop) { sunmake(state, u); return null; } // 中途超时 → 回退确定性
    const rep = rootRepeatScore(state, m, level);     // state 仍为 smake 后
    const dev = rootDevBonus(state, m);
    sunmake(state, u);
    if (v > floor) scored.push({ m, v, adj: v - rep + dev });
  }
  if (scored.length <= 1) return null;                 // 唯一等优 → 确定性最佳
  let bestRef = -Infinity;
  for (const s of scored) if (s.adj > bestRef) bestRef = s.adj;
  const pool = scored.filter(s => s.adj >= bestRef - W);
  if (pool.length <= 1) return null;
  const T = W / 2;                                    // softmax 温度
  let sum = 0;
  for (const s of pool) { s.w = Math.exp((s.adj - bestRef) / T); sum += s.w; }
  let r = rng() * sum, chosen = pool[pool.length - 1];
  for (const s of pool) { r -= s.w; if (r <= 0) { chosen = s; break; } }
  return { move: chosen.m, score: chosen.v };
}
function legalMovesScored(state, c, ctx, ply, ttMove, killers) {
  const hist = ctx.hist[c];
  const arr = [];
  for (const m of pseudoMoves(state, c)) {
    const attacker = state.board[m.from[1]][m.from[0]];
    const u = smake(state, m);
    if (isInCheck(state, c)) { sunmake(state, u); continue; }
    sunmake(state, u);
    let s = hist[m.from[1] * 810 + m.from[0] * 90 + m.to[1] * 9 + m.to[0]] || 0;
    const cap = state.board[m.to[1]][m.to[0]];
    if (cap) s = 1000000 + pieceVal(cap) * 10 - (attacker.hidden ? DARK_EV : VAL[attacker.t]);
    if (ttMove && m.from[0] === ttMove.from[0] && m.from[1] === ttMove.from[1] && m.to[0] === ttMove.to[0] && m.to[1] === ttMove.to[1]) s = 10000000;
    else if (killers && killers.some(k => k && k.from[0] === m.from[0] && k.from[1] === m.from[1] && k.to[0] === m.to[0] && k.to[1] === m.to[1])) s += 200000;
    if (ctx.hint && m.from[0] === ctx.hint.from[0] && m.from[1] === ctx.hint.from[1] && m.to[0] === ctx.hint.to[0] && m.to[1] === ctx.hint.to[1]) s += 9000000;
    arr.push({ m, s });
  }
  arr.sort((a, b) => b.s - a.s);
  return arr;
}

function quiescence(state, alpha, beta, ply, depth, ctx, key) {
  if (ply > 72) return (state.turn === 'r' ? 1 : -1) * evaluate(state); // 统一单调递归封顶: 防极端长连将深路径栈溢出(正常ply<30不触发)
  const c = state.turn;
  const inChk = isInCheck(state, c);
  if (!inChk) {
    const stand = (c === 'r' ? 1 : -1) * evaluate(state);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  }
  if (depth <= 0) return alpha;
  const list = [];
  for (const m of pseudoMoves(state, c)) {
    const target = state.board[m.to[1]][m.to[0]];
    if (!inChk && !target) continue;          // 非被将军只延伸吃子
    const attacker = state.board[m.from[1]][m.from[0]];
    const u = smake(state, m);
    if (isInCheck(state, c)) { sunmake(state, u); continue; }
    const givesCheck = isInCheck(state, state.turn);
    const s = target ? pieceVal(target) * 10 - (attacker.hidden ? DARK_EV : VAL[attacker.t]) : 100000;
    list.push({ m, s, givesCheck });
    sunmake(state, u);
  }
  if (inChk && list.length === 0) return -MATE + ply; // 被将军且无着法=将杀/困毙
  list.sort((a, b) => b.s - a.s);
  for (const { m, givesCheck } of list) {
    const u = smake(state, m);
    const ext = givesCheck && depth > 2 ? 1 : 0;
    const v = -quiescence(state, -beta, -alpha, ply + 1, depth - 1 + ext, ctx, zApply(key, u));
    sunmake(state, u);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(state, depth, alpha, beta, ply, ctx, key, allowNull) {
  if (ply > 72) return (state.turn === 'r' ? 1 : -1) * evaluate(state); // 统一单调递归封顶: 防极端长连将深路径栈溢出(正常ply<30不触发)
  if ((ctx.nodes++ & 2047) === 0 && Date.now() > ctx.deadline) { ctx.stop = true; }
  if (ctx.stop) return 0;
  const c = state.turn;

  if (depth <= 0) {
    return ctx.useQuie ? quiescence(state, alpha, beta, ply, 6, ctx, key)
      : (c === 'r' ? 1 : -1) * evaluate(state);
  }

  const tt = ctx.tt;
  const hit = tt.get(key);
  let ttMove = null;
  if (hit) {
    if (hit.depth >= depth) {
      if (hit.flag === 0) return hit.value;
      if (hit.flag === 1 && hit.value >= beta) return hit.value;
      if (hit.flag === 2 && hit.value <= alpha) return hit.value;
    }
    ttMove = hit.move;
  }

  const inChk = isInCheck(state, c);
  // 空着裁剪(被将军/揭棋/纯兵残局/根附近/全窗节点不用; 全窗 beta=Inf 会使零窗退化)
  if (allowNull && !inChk && !state.jieqi && depth >= 3 && hasHeavy(state, c) && ply >= 1 && Number.isFinite(beta)) {
    state.turn = c === 'r' ? 'b' : 'r'; // 让一手: 轮到对方
    const v = -negamax(state, depth - 3, -beta, -beta + 1, ply + 1, ctx, (key ^ ZTURN) >>> 0, false);
    state.turn = c;                    // 恢复行棋方
    if (ctx.stop) return 0;
    if (v >= beta) return beta;
  }

  const scored = legalMovesScored(state, c, ctx, ply, ttMove, ctx.killers[ply] || null);
  if (scored.length === 0) return -MATE + ply; // 无着法: 将杀或困毙, 中国象棋均判负

  // Futility: 浅层、未被将军且静态分加边际仍无望翻盘, 则只搜吃子/将军着法
  let futile = false;
  if (ctx.useFutil && !inChk && depth <= 2 && alpha < MATE - 1000 && Number.isFinite(beta)) {
    const stand = (c === 'r' ? 1 : -1) * evaluate(state);
    const margin = depth === 1 ? 110 : 240;
    if (stand + margin <= alpha) futile = true;
  }

  const alpha0 = alpha;
  let best = -Infinity, bestMove = scored[0].m;
  let idx = 0;
  for (const { m } of scored) {
    const u = smake(state, m);
    const givesCheck = isInCheck(state, state.turn);
    const cap = u.cap;
    // Futility 跳过安静着(不吃子、不将军)
    if (futile && !cap && !givesCheck) { sunmake(state, u); idx++; continue; }
    const ext = (givesCheck && depth >= 2 && ply < 24) ? 1 : 0; // 将军扩展
    let nd = depth - 1 + ext;
    // Late Move Reduction: 深层、靠后的安静非将军着法减搜, 异常再补搜
    let reduced = false;
    if (ctx.useLmr && allowNull && depth >= 3 && idx >= 3 && !cap && !givesCheck && !inChk
      && Number.isFinite(beta) && alpha > -MATE + 1000) {
      const R = (depth >= 5 && idx >= 7) ? 2 : 1;
      nd -= R; reduced = true;
    }
    let v = -negamax(state, nd, -beta, -alpha, ply + 1, ctx, zApply(key, u), true);
    if (reduced && !ctx.stop && v > alpha) {
      // 减搜异常: 恢复完整深度重搜(u2 为局面恢复后对同一着法的重做, cap 一致)
      sunmake(state, u);
      const u2 = smake(state, m);
      v = -negamax(state, depth - 1 + (givesCheck ? 1 : 0), -beta, -alpha, ply + 1, ctx, zApply(key, u2), true);
      sunmake(state, u2);
    } else sunmake(state, u);
    if (ctx.stop) return 0;
    if (v > best) { best = v; bestMove = m; }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      // 记录杀手走法 / 历史启发
      if (!cap) {
        const k = ctx.killers[ply] || (ctx.killers[ply] = [null, null]);
        if (!k.some(x => x && x.from[0] === m.from[0] && x.to[0] === m.to[0] && x.from[1] === m.from[1] && x.to[1] === m.to[1])) {
          k[1] = k[0]; k[0] = m;
        }
        ctx.hist[c][m.from[1] * 810 + m.from[0] * 90 + m.to[1] * 9 + m.to[0]] += depth * depth;
      }
      break;
    }
    idx++;
  }
  // Futility 可能把浅层节点的安静着法全部跳过(无吃子/将军可搜): 此时不得返回 -Infinity,
  // 回退为静态评估(吃子着法不会被剪, 走到这里说明确无强制手段)
  if (best === -Infinity) return (c === 'r' ? 1 : -1) * evaluate(state);
  const flag = best <= alpha0 ? 2 : (best >= beta ? 1 : 0);
  if (Number.isFinite(best)) tt.set(key, { depth, value: best, flag, move: bestMove });
  return best;
}

// 残局判定: 双方重子(车/炮)总数 <= 3 视为残局, 子力越空算得越深
function endgameBonus(state) {
  let heavy = 0, pieces = 0;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (!p || p.hidden || p.t === 'K') continue;
    pieces++;
    if (p.t === 'R' || p.t === 'C') heavy++;
  }
  if (pieces <= 6) return 3;
  if (heavy <= 3 || pieces <= 10) return 2;
  if (heavy <= 5) return 1;
  return 0;
}

function makeCtx(level, deadline, opts = {}) {
  _style = STYLE[opts.style] || STYLE.balance;
  return {
    tt: new Map(), killers: {}, hist: { r: new Int32Array(8100), b: new Int32Array(8100) },
    hint: opts.hintMove || null,
    useQuie: level >= 3,
    // 少子残局节点少且叫杀控制着(未必将军)关键, 关闭 LMR 以求准; 中局靠 LMR 以求深
    useLmr: level >= 3 && !opts.noLmr && (opts.endgameBonus == null ? true : opts.endgameBonus < 2),
    useFutil: level >= 3,
    deadline, stop: false, nodes: 0,
    style: opts.style || 'balance'
  };
}

// level 1..5; 返回 {from,to,score,depth,nodes,...}
// opts.deterministic: 提示/复盘路径用, 全程 argmax 不走随机, 保证可复现
export function searchBestMove(state, opts = {}) {
  const level = opts.level || 3;
  const deadline = opts.deadline || (Date.now() + 4000);
  const deterministic = !!opts.deterministic;
  // 确定性路径使用固定 rng(恒取首个候选), 提示/复盘/残局解面不注入任何随机性
  const rng = deterministic ? (() => 0) : (opts.rng || Math.random);
  // 开局库: 经典模式且仍在库内, 直接走定式着法
  if (!opts.noBook && !state.jieqi) {
    const bm = openingBookMove(state, rng);
    if (bm) return { ...bm, score: 0, depth: 0, nodes: 0, book: true };
  }
  const egBonus = endgameBonus(state);
  const ctx = makeCtx(level, deadline, { ...opts, endgameBonus: egBonus });
  state._mobility = level >= 4;
  const moves = legalMovesScored(state, state.turn, ctx, 0, null, null).map(x => x.m);
  if (moves.length === 0) return null;
  if (moves.length === 1) return { ...moves[0], score: 0, depth: 1, nodes: 0 };

  if (!deterministic && level === 1 && rng() < 0.35) {
    return { ...moves[Math.floor(rng() * moves.length)], score: 0, depth: 1, nodes: 0, random: true };
  }
  // 深度上限: 高级别放开, 由迭代加深+时限截断; 残局自动加深
  const baseDepth = [0, 1, 2, 3, 5, 9][level] || 3;
  const maxDepth = Math.min(14, baseDepth + (level >= 4 ? egBonus : 0));
  let best = moves[0], bestScore = -Infinity, doneDepth = 0;
  const rootKey = boardKey(state);

  for (let d = 1; d <= maxDepth; d++) {
    let curBest = moves[0], curScore = -Infinity;
    // Aspiration window: d>=4 用上一轮分数开窄窗, 失败再扩窗
    let alpha = -Infinity, beta = Infinity, aspiration = false;
    if (d >= 4 && doneDepth >= 3 && Number.isFinite(bestScore) && Math.abs(bestScore) < MATE - 400) {
      const delta = 38; alpha = bestScore - delta; beta = bestScore + delta; aspiration = true;
    }
    let reSearch = 0;
    doWindow:
    for (;;) {
      let a = alpha, aborted = false, mi = 0;
      const scored = legalMovesScored(state, state.turn, ctx, 0, (reSearch ? curBest : best), null);
      for (const { m } of scored) {
        let u = smake(state, m);
        const givesCheck = isInCheck(state, state.turn);
        let v;
        if (mi === 0) {
          v = -negamax(state, d - 1 + (givesCheck ? 1 : 0), -beta, -a, 1, ctx, zApply(rootKey, u), true);
        } else {
          // PVS: 零窗试探, fail-high 再全窗重搜
          v = -negamax(state, d - 1, -a - 1, -a, 1, ctx, zApply(rootKey, u), true);
          if (!ctx.stop && v > a && (beta === Infinity || v < beta)) {
            sunmake(state, u);
            const u2 = smake(state, m);
            v = -negamax(state, d - 1 + (givesCheck ? 1 : 0), -beta, -a, 1, ctx, zApply(rootKey, u2), true);
            u = u2;
          }
        }
        const rep = repetitionPenalty(state, v);
        sunmake(state, u);
        if (ctx.stop) { aborted = true; break; }
        if (v - rep > curScore || mi === 0) { curScore = v - rep; curBest = m; }
        if (v > a) a = v;
        mi++;
        if (Date.now() > deadline && d >= 2) { aborted = true; break; }
      }
      if (aspiration && !aborted && !ctx.stop) {
        if (curScore <= alpha) { alpha = -Infinity; beta = Infinity; reSearch++; if (reSearch <= 2) { ctx.stop = false; continue doWindow; } }
        else if (curScore >= beta) { beta = Infinity; reSearch++; if (reSearch <= 2) { ctx.stop = false; continue doWindow; } }
      }
      break;
    }
    if (ctx.stop && doneDepth === 0) break;
    if (ctx.stop) break; // 本轮未完成, 保留上一轮结果
    best = curBest; bestScore = curScore; doneDepth = d;
    // 已见杀后仍继续到第 8 层, 让更短杀(分数 MATE-ply 更高)自然浮现; 之后再停以省时
    if (Math.abs(curScore) > MATE - 200 && d >= 8) break;
    if (Date.now() > deadline) break;
  }
  // 根着法去随机化: 仅在等优着法间 softmax 加权随机; 战术/强制杀/唯一着/确定性优先
  let chosen = best, chosenScore = bestScore;
  if (!deterministic && level >= 2 && moves.length > 1 && Number.isFinite(bestScore)
    && Math.abs(bestScore) < MATE - 200 && doneDepth >= 2) {
    try {
      const pick = pickDiverseRootMove(state, best, bestScore, doneDepth, ctx, deadline, level, rng);
      if (pick) { chosen = pick.move; chosenScore = pick.score; } // 异常/超时 → 保持确定性 best
    } catch (e) { /* 回退确定性最佳着 */ }
  }
  if (!deterministic && level === 1 && rng() < 0.25) chosen = moves[Math.floor(rng() * moves.length)];
  return { ...chosen, score: chosenScore, depth: Math.max(1, doneDepth), nodes: ctx.nodes };
}

// 对指定根着法做固定深度全窗精评(行棋方视角分数); 供复盘分析比较"实际着 vs 最佳着"
export function scoreMove(state, from, to, opts = {}) {
  const level = opts.level || 5;
  const deadline = opts.deadline || (Date.now() + 800);
  const eg = endgameBonus(state);
  const ctx = makeCtx(level, deadline, { style: opts.style || 'balance', endgameBonus: eg });
  state._mobility = true;
  const rootList = legalMovesScored(state, state.turn, ctx, 0, null, null);
  const m = rootList.find(x => x.m.from[0] === from[0] && x.m.from[1] === from[1]
    && x.m.to[0] === to[0] && x.m.to[1] === to[1]);
  if (!m) return { score: -MATE, depth: 0, nodes: 0, illegal: true };
  const depth = opts.depth || 6;
  const rootKey = boardKey(state);
  const u = smake(state, m.m);
  const givesCheck = isInCheck(state, state.turn);
  const v = -negamax(state, depth - 1 + (givesCheck ? 1 : 0), -Infinity, Infinity, 1, ctx, zApply(rootKey, u), true);
  sunmake(state, u);
  return { score: v, depth, nodes: ctx.nodes };
}

export function hintMove(state, opts = {}) {
  return searchBestMove(state, { level: 5, deadline: Date.now() + 2500, ...opts });
}

// ---------- 残局闯关攻击方"提示"(保证逐手照提示必能在 mate 手内成杀) ----------
// 三级保障: ①离线预置的强制杀解面(即时, 覆盖少数缓手控杀深局)
//          ②在线精确强制杀求解(连将/多数局面瞬间得解)
//          ③大师启发式搜索兜底。防守方 AI 强度不变, 不靠削弱防守制造假胜。
function parseSolMove(str) {
  const [a, b] = str.split('-');
  const pt = (t) => [Number(t[0]), Number(t[1])];
  return { from: pt(a), to: pt(b) };
}
export function puzzleHintMove(state, opts = {}) {
  const attacker = opts.attacker || 'r';
  const deadline = opts.deadline || (Date.now() + 5000);
  const maxMoves = opts.mateTarget || 6;
  // ① 离线解面: 以当前局面 FEN 精确命中一着必胜着
  if (opts.puzzleId != null && SOL_MAPS[opts.puzzleId]) {
    const mvStr = SOL_MAPS[opts.puzzleId].m[toFEN(state)];
    if (mvStr) { const m = parseSolMove(mvStr); return { ...m, score: MATE, depth: 0, nodes: 0, exact: 'map' }; }
  }
  // ② 在线精确强制杀
  const r = findForcedMate(state, { attacker, maxMoves, deadline, quiet: true });
  if (r.status === 'win' && r.from) {
    return { from: r.from, to: r.to, score: MATE - (r.mate - 1) * 2, depth: r.mate, nodes: r.nodes, exact: r.kind };
  }
  // ③ 大师启发式兜底(提示路径保持确定性精确, 不注入随机)
  return searchBestMove(state, { level: 5, deadline, noBook: true, ...opts, deterministic: true });
}
