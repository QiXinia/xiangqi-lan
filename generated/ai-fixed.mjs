// ============================================================
// 象棋 AI: negamax + alpha-beta(PVS 根) + Zobrist 置换表
//   + 杀手走法/历史启发走法排序 + 空着裁剪(null-move)
//   + 将军扩展 + MVV-LVA + 吃子静态搜索(quiescence) + 迭代加深
// 五级难度: 1 入门 / 2 初级 / 3 中级 / 4 高级 / 5 大师
// ============================================================
// 修正版副本: import 指向 ./engine-fixed.mjs（规则修正版）
// 注: zApply 在揭棋暗子翻开第一步时增量 Zobrist 与全量 boardKey 分叉(见 audit 报告 #3)，
//     经典残局用不到，本副本暂不改，留待主线程合并时一并处理。
import {
  pseudoMoves, isInCheck, toFEN, pieceTargets
} from './engine-fixed.mjs';

const VAL = { K: 60000, A: 200, B: 200, N: 400, R: 900, C: 450, P: 100 };
const MATE = 100000;
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
function evaluate(state) {
  let score = 0;
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
      if (py <= 4) bonus += 14;            // 车过河
      if (py <= 1) bonus += 14;            // 沉底车
      if (py <= 4 && (px === 3 || px === 5)) bonus += 8; // 肋车
    } else if (p.t === 'C') {
      if (py <= 4) bonus += 8;             // 炮过河
      if (px === 4 && py <= 5) bonus += 6; // 中炮
    } else if (p.t === 'N') {
      if (py <= 4) bonus += 12;            // 马过河
    } else if (p.t === 'P') {
      if (py <= 2) bonus += 40;            // 兵临城下
      if (py <= 4 && px >= 3 && px <= 5) bonus += 12; // 兵入九宫方向
    }
    score += sign * (v + bonus);
  }
  // 士象残缺且对方有车/炮时, 防守方受罚
  score += ((2 - guards.r.A) + (2 - guards.r.B)) * (guards.b.R * 10 + guards.b.C * 4);
  score -= ((2 - guards.b.A) + (2 - guards.b.B)) * (guards.r.R * 10 + guards.r.C * 4);
  if (state._mobility) score += (pseudoCount(state, 'r') - pseudoCount(state, 'b')) * 2;
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
  const pt = u.wasHidden ? u.orig : u.piece.t;
  key ^= Z[u.piece.c][pt][u.fy * 9 + u.fx];
  key ^= Z[u.piece.c][pt][u.ty * 9 + u.tx];
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

  const alpha0 = alpha;
  let best = -Infinity, bestMove = scored[0].m;
  let idx = 0;
  for (const { m } of scored) {
    const u = smake(state, m);
    const givesCheck = isInCheck(state, state.turn);
    const ext = (givesCheck && depth >= 2 && ply < 24) ? 1 : 0; // 将军扩展
    const nd = depth - 1 + ext;
    let v = -negamax(state, nd, -beta, -alpha, ply + 1, ctx, zApply(key, u), true);
    sunmake(state, u);
    if (ctx.stop) return 0;
    if (v > best) { best = v; bestMove = m; }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      // 记录杀手走法 / 历史启发
      if (!state.board[m.to[1]][m.to[0]]) {
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
  const flag = best <= alpha0 ? 2 : (best >= beta ? 1 : 0);
  tt.set(key, { depth, value: best, flag, move: bestMove });
  return best;
}

// level 1..5; 返回 {from,to,score,depth,nodes,...}
export function searchBestMove(state, opts = {}) {
  const level = opts.level || 3;
  const deadline = opts.deadline || (Date.now() + 4000);
  const rng = opts.rng || Math.random;
  const ctx = {
    tt: new Map(), killers: {}, hist: { r: new Int32Array(8100), b: new Int32Array(8100) },
    hint: opts.hintMove || null,
    useQuie: level >= 3,
    mobility: false,
    deadline, stop: false, nodes: 0
  };
  state._mobility = level >= 4;
  const moves = legalMovesScored(state, state.turn, ctx, 0, null, null).map(x => x.m);
  if (moves.length === 0) return null;
  if (moves.length === 1) return { ...moves[0], score: 0, depth: 1, nodes: 0 };

  if (level === 1 && rng() < 0.35) {
    return { ...moves[Math.floor(rng() * moves.length)], score: 0, depth: 1, nodes: 0, random: true };
  }
  const maxDepth = [0, 1, 2, 3, 4, 5][level] || 3;
  let best = moves[0], bestScore = -Infinity, doneDepth = 0;
  const rootKey = boardKey(state);

  for (let d = 1; d <= maxDepth; d++) {
    let curBest = moves[0], curScore = -Infinity, alpha = -Infinity;
    const scored = legalMovesScored(state, state.turn, ctx, 0, best, null);
    let aborted = false, mi = 0;
    for (const { m } of scored) {
      let u = smake(state, m);
      const givesCheck = isInCheck(state, state.turn);
      let v;
      if (mi === 0) {
        v = -negamax(state, d - 1 + (givesCheck ? 1 : 0), -Infinity, Infinity, 1, ctx, zApply(rootKey, u), true);
      } else {
        // PVS: 零窗试探, fail-high 再全窗重搜
        v = -negamax(state, d - 1, -alpha - 1, -alpha, 1, ctx, zApply(rootKey, u), true);
        if (!ctx.stop && v > alpha) {
          sunmake(state, u);
          const u2 = smake(state, m);
          v = -negamax(state, d - 1 + (givesCheck ? 1 : 0), -Infinity, -alpha, 1, ctx, zApply(rootKey, u2), true);
          u = u2;
        }
      }
      const rep = repetitionPenalty(state, v);
      sunmake(state, u);
      if (ctx.stop) { aborted = true; break; }
      if (v - rep > curScore) { curScore = v - rep; curBest = m; }
      if (v > alpha) alpha = v;
      mi++;
      if (Date.now() > deadline && d >= 2) { aborted = true; break; }
    }
    if (aborted) break;
    best = curBest; bestScore = curScore; doneDepth = d;
    if (Math.abs(curScore) > MATE - 200) break;
    if (Date.now() > deadline) break;
  }
  if (level === 1 && rng() < 0.25) best = moves[Math.floor(rng() * moves.length)];
  return { ...best, score: bestScore, depth: Math.max(1, doneDepth), nodes: ctx.nodes };
}

export function hintMove(state) {
  return searchBestMove(state, { level: 5, deadline: Date.now() + 2500 });
}
