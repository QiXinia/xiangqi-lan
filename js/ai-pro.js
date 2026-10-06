// ============================================================
// 象棋 AI-PRO: 在经典搜索框架(negamax + alpha-beta PVS根 + Zobrist TT
//   + 杀手/历史/countermove 排序 + 空着裁剪 + 将军/威胁扩展 + quiescence
//   + 迭代加深/aspiration + 残局加深 + 根等优 softmax 多变性)之上,
//   增量落地 AlphaZero 思想的【离线确定性特征模型】等价实现:
//     策略先验(着法排序) / 多维分阶段价值评估(eval2) / 类PUCT算力分配 / 精确残局。
//   无神经网络、无训练、无权重文件、无外部资源; 与经典 js/ai.js 并存独立演进。
// SEE 全交换版经 A/B 实测 NPS 不升反降, 已禁用(_F.see=false)。
// 打包: 本文件与 js/ai.js 同作用域拼接, 故 import 一律 PRO_ 别名,
//       全部实现封入 IIFE, 顶层仅 PRO_engine 与 searchBestMovePro 两个标识符。
// 五级难度: 1 入门 / 2 初级 / 3 中级 / 4 高级 / 5 大师
// ============================================================
import {
  pseudoMoves as PRO_pseudoMoves,
  isInCheck as PRO_isInCheck,
  toFEN as PRO_toFEN,
  pieceTargets as PRO_pieceTargets,
  findKing as PRO_findKing,
  fastIsAttacked as PRO_fastIsAttacked,
  legalMoves as PRO_legalMoves,
  createState as PRO_createState,
} from './engine.js';
import { openingBookMove as PRO_bookMove } from './openings.js';
import { findForcedMate as PRO_findForcedMate } from './mate-solver.js';
import { SOL_MAPS as PRO_SOL_MAPS } from './sol-maps.js';

const PRO_engine = (() => {

 const VAL = { K: 60000, A: 200, B: 200, N: 400, R: 900, C: 450, P: 100 };
 const MATE = 100000;
 const DARK_EV = (200 * 4 + 400 * 2 + 900 * 2 + 450 * 2 + 100 * 5) / 15;

 // 增强开关(逐项可 A/B; SEE 昂贵版禁用)
 const FEAT = { see: false, eval2: true, counter: true, lmr2: true, nullR: true, threatExt: false, rootTime: true };
 let _F = FEAT; // 每次 search() 按 opts.feat 覆盖(便于 A/B; 默认值不变)

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
     [2, 12, 20, 20, 16, 20, 20, 12, 2],
     [4, 14, 24, 28, 20, 28, 24, 14, 4],
     [6, 16, 28, 32, 24, 32, 28, 16, 6],
     [4, 12, 24, 28, 24, 28, 24, 12, 4],
     [2, 8, 16, 20, 16, 20, 16, 8, 2],
     [4, 6, 12, 12, 8, 12, 12, 6, 4],
     [0, 2, 4, 4, 4, 4, 4, 2, 0],
     [0, 0, 2, 4, 4, 4, 2, 0, 0]],
   C: [
     [6, 4, 0, 10, 12, 10, 0, 4, 6],
     [2, 2, 0, 8, 10, 8, 0, 2, 2],
     [2, 2, 4, 10, 12, 10, 4, 2, 2],
     [4, 4, 8, 14, 16, 14, 8, 4, 4],
     [6, 6, 10, 18, 20, 18, 10, 6, 6],
     [4, 4, 8, 14, 16, 14, 8, 4, 4],
     [2, 2, 4, 8, 10, 8, 4, 2, 2],
     [2, 2, 0, 6, 8, 6, 0, 2, 2],
     [4, 2, 4, 8, 8, 8, 4, 2, 4],
     [0, 2, 2, 6, 6, 6, 2, 2, 0]],
   P: [
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [6, 6, 6, 20, 24, 20, 6, 6, 6],
     [14, 14, 20, 34, 36, 34, 20, 14, 14],
     [28, 28, 34, 40, 44, 40, 34, 28, 28],
     [0, 10, 20, 36, 40, 36, 20, 10, 0],
     [0, 0, 8, 0, 16, 0, 8, 0, 0]],
   A: [
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 4, 0, 8, 0, 4, 0, 0],
     [0, 0, 0, 4, 0, 4, 0, 0, 0]],
   B: [
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
     [0, 0, 0, 0, 0, 0, 0, 0, 0],
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
 // 棋风系数: balance 均衡 / attack 进攻 / solid 稳健
 const STYLE = {
   balance: { guard: 1.0, mob: 2, cross: 1.0 },
   attack:  { guard: 0.45, mob: 4, cross: 1.35 },
   solid:   { guard: 1.6, mob: 1, cross: 0.75 }
 };
 let _style = STYLE.balance;
 function countNonKing(state) {
   let n = 0;
   for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
     const p = state.board[y][x];
     if (p && !p.hidden && p.t !== 'K') n++;
   }
   return n;
 }
 function evaluate(state) {
   let score = 0, crossAtk = 0; // 过河进攻子(红方视角净值, 正=红占优)
   const guards = { r: { A: 0, B: 0, R: 0, C: 0 }, b: { A: 0, B: 0, R: 0, C: 0 } };
   // eval2 所需统计: 与基础评估共用同一次全盘扫描, 摊销成本≈0(不再额外全盘扫)
   let np = 0;
   const kingXY = { r: null, b: null };
   const cannons = { r: 0, b: 0 };
   const pawnFiles = { r: [0,0,0,0,0,0,0,0,0], b: [0,0,0,0,0,0,0,0,0] };
   const rookXY = { r: [], b: [] };
   for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
     const p = state.board[y][x];
     if (!p) continue;
     const sign = p.c === 'r' ? 1 : -1;
     if (p.hidden) {
       score += sign * (VAL[p.orig] * 0.5 + DARK_EV * 0.5);
       continue;
     }
     let v = VAL[p.t];
     np++;
     if (p.t === 'K') kingXY[p.c] = [x, y];
     else if (p.t === 'C') cannons[p.c]++;
     else if (p.t === 'R') rookXY[p.c].push(x);
     if (p.t === 'P') {
       if (p.c === 'r' && y <= 4) v += 100;
       if (p.c === 'b' && y >= 5) v += 100;
       pawnFiles[p.c][x]++;
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

   // ===== eval2: 多维分阶段价值评估(替代 value network); 数据全部来自上方单次扫描, 零额外全盘开销 =====
   if (_F.eval2) {
     const phase = np <= 8 ? 1 : (np <= 16 ? 0.5 : 0); // 残局1/中局0.5/开局0
     for (const c of ['r', 'b']) {
       const k = kingXY[c];
       if (!k) continue;
       const sign = c === 'r' ? 1 : -1;
       // (a) 将帅残局活跃: 残局王向中心靠拢升值(纵中心 4.5, 镜像对称)
       const distC = Math.abs(k[0] - 4) + Math.abs(2 * k[1] - 9) / 2;
       score += sign * (5 - distC) * 6 * phase;
       // (b) 双炮联动(重炮潜力)
       if (cannons[c] >= 2) score += sign * 8 * (0.4 + 0.6 * phase);
       // (c) 车占开放线(该文件向无己方兵)
       for (const rx of rookXY[c]) if (pawnFiles[c][rx] === 0) score += sign * 10;
       // (d) 将帅安全(对称, 双方都算): 王格被对方重子直接攻击重罚; 缺士象且对方有车炮暴露再罚
       const byOpp = c === 'r' ? 'b' : 'r';
       if (PRO_fastIsAttacked(state, k[0], k[1], byOpp)) score -= sign * 160 * (0.4 + 0.6 * phase);
       const exposed = (2 - guards[c].A) + (2 - guards[c].B);
       if (exposed > 0) {
         const oppHeavy = guards[byOpp].R * 9 + guards[byOpp].C * 4;
         score -= sign * exposed * oppHeavy * (0.3 + 0.5 * phase);
       }
     }
   }
   return score;
 }
 function pseudoCount(state, c) {
   let n = 0;
   for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
     const p = state.board[y][x];
     if (p && p.c === c) n += PRO_pieceTargets(state, p, x, y).length;
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
 const NOISE_W = [0, 70, 45, 28, 14, 7];
 const REP_PEN = [0, 15, 13, 11, 9, 8];

 function rootRepeatScore(state, m, level) {
   let pen = 0;
   const hist = state.moves;
   if (hist && hist.length >= 2) {
     const myPrev = hist[hist.length - 2];
     if (myPrev && myPrev.c === state.turn
       && myPrev.from[0] === m.to[0] && myPrev.from[1] === m.to[1]
       && myPrev.to[0] === m.from[0] && myPrev.to[1] === m.from[1]) {
       pen = Math.max(pen, REP_PEN[level] || 10);
     }
   }
   if (state.posCount && (state.posCount.get(ePosKey(state)) || 0) >= 1) {
     pen = Math.max(pen, REP_PEN[level] || 10);
   }
   return pen;
 }

 function rootDevBonus(state, m) {
   const hist = state.moves;
   if (!hist || hist.length > 10) return 0;
   const piece = state.board[m.from[1]][m.from[0]];
   if (!piece) return 0;
   let b = 0;
   const homeY = piece.c === 'r' ? 9 : 0;
   if (m.from[1] === homeY && piece.t !== 'K' && piece.t !== 'A') b += 3;
   if (piece.c === 'r' && m.from[1] >= 5 && m.to[1] <= 4) b += 3;
   if (piece.c === 'b' && m.from[1] <= 4 && m.to[1] >= 5) b += 3;
   return Math.min(6, b);
 }

 function pickDiverseRootMove(state, bestMove, bestScore, doneDepth, ctx, deadline, level, rng) {
   const W = NOISE_W[level] || 10;
   if (doneDepth < 2 || W <= 0) return null;
   const rootKey = boardKey(state);
   const list = legalMovesScored(state, state.turn, ctx, 0, bestMove, null);
   const floor = bestScore - W - 80;
   const scored = [];
   ctx.stop = false;
   for (const { m } of list) {
     if (Date.now() > deadline || ctx.stop) return null;
     const u = smake(state, m);
     const givesCheck = PRO_isInCheck(state, state.turn);
     const v = -negamax(state, doneDepth - 1 + (givesCheck ? 1 : 0), -Infinity, -floor, 1, ctx, zApply(rootKey, u), true);
     if (ctx.stop) { sunmake(state, u); return null; }
     const rep = rootRepeatScore(state, m, level);
     const dev = rootDevBonus(state, m);
     sunmake(state, u);
     if (v > floor) scored.push({ m, v, adj: v - rep + dev });
   }
   if (scored.length <= 1) return null;
   let bestRef = -Infinity;
   for (const s of scored) if (s.adj > bestRef) bestRef = s.adj;
   const pool = scored.filter(s => s.adj >= bestRef - W);
   if (pool.length <= 1) return null;
   const T = W / 2;
   let sum = 0;
   for (const s of pool) { s.w = Math.exp((s.adj - bestRef) / T); sum += s.w; }
   let r = rng() * sum, chosen = pool[pool.length - 1];
   for (const s of pool) { r -= s.w; if (r <= 0) { chosen = s; break; } }
   return { move: chosen.m, score: chosen.v };
 }
 function legalMovesScored(state, c, ctx, ply, ttMove, killers) {
   const hist = ctx.hist[c];
   const arr = [];
   const last = ctx.lastMove; // 对手上一手(用于 countermove 先验)
   for (const m of PRO_pseudoMoves(state, c)) {
     const attacker = state.board[m.from[1]][m.from[0]];
     const u = smake(state, m);
     if (PRO_isInCheck(state, c)) { sunmake(state, u); continue; }
     sunmake(state, u);
     let s = hist[m.from[1] * 810 + m.from[0] * 90 + m.to[1] * 9 + m.to[0]] || 0;
     const cap = state.board[m.to[1]][m.to[0]];
     if (cap) s = 1000000 + pieceVal(cap) * 10 - (attacker.hidden ? DARK_EV : VAL[attacker.t]);
     if (ttMove && m.from[0] === ttMove.from[0] && m.from[1] === ttMove.from[1] && m.to[0] === ttMove.to[0] && m.to[1] === ttMove.to[1]) s = 10000000;
     else if (killers && killers.some(k => k && k.from[0] === m.from[0] && k.from[1] === m.from[1] && k.to[0] === m.to[0] && k.to[1] === m.to[1])) s += 200000;
     // countermove: 对手上一手之后的常见应对着, 加先验(仅次于 killer)
     if (ctx.counter && last) {
       const cm = ctx.counter.get(last.from[1] * 810 + last.from[0] * 90 + last.to[1] * 9 + last.to[0]);
       if (cm && cm.from[0] === m.from[0] && cm.from[1] === m.from[1] && cm.to[0] === m.to[0] && cm.to[1] === m.to[1]) s += 300000;
     }
     if (ctx.hint && m.from[0] === ctx.hint.from[0] && m.from[1] === ctx.hint.from[1] && m.to[0] === ctx.hint.to[0] && m.to[1] === ctx.hint.to[1]) s += 9000000;
     arr.push({ m, s });
   }
   arr.sort((a, b) => b.s - a.s);
   return arr;
 }

 function quiescence(state, alpha, beta, ply, depth, ctx, key, checkLeft) {
   if (ply > 72) return (state.turn === 'r' ? 1 : -1) * evaluate(state); // 单调总帧数硬上限: 与 negamax 一致, 任何路径数学封顶
   if (checkLeft === undefined) checkLeft = 16;
   const c = state.turn;
   const inChk = PRO_isInCheck(state, c);
   // 被将军应将链: 独立预算截断(防长连将/长将递归溢出), 不拖累主搜索正常深度
   if (inChk) {
     if (checkLeft <= 0) return (c === 'r' ? 1 : -1) * evaluate(state); // 应将链过长: 回退静态评估
     checkLeft--;
   }
   if (!inChk) {
     const stand = (c === 'r' ? 1 : -1) * evaluate(state);
     if (stand >= beta) return beta;
     if (stand > alpha) alpha = stand;
     if (depth <= 0) return alpha; // 仅非将军叶节点截断; 被将军必须展开应将
   }
   const list = [];
   for (const m of PRO_pseudoMoves(state, c)) {
     const target = state.board[m.to[1]][m.to[0]];
     if (!inChk && !target) continue;
     const attacker = state.board[m.from[1]][m.from[0]];
     const u = smake(state, m);
     if (PRO_isInCheck(state, c)) { sunmake(state, u); continue; }
     const givesCheck = PRO_isInCheck(state, state.turn);
     const s = target ? pieceVal(target) * 10 - (attacker.hidden ? DARK_EV : VAL[attacker.t]) : 100000;
     list.push({ m, s, givesCheck });
     sunmake(state, u);
   }
   if (inChk && list.length === 0) return -MATE + ply;
   list.sort((a, b) => b.s - a.s);
   for (const { m, givesCheck } of list) {
     const u = smake(state, m);
     const ext = givesCheck && depth > 2 ? 1 : 0;
     const v = -quiescence(state, -beta, -alpha, ply + 1, depth - 1 + ext, ctx, zApply(key, u), checkLeft);
     sunmake(state, u);
     if (v >= beta) return beta;
     if (v > alpha) alpha = v;
   }
   return alpha;
 }

 function negamax(state, depth, alpha, beta, ply, ctx, key, allowNull) {
   if (ply > 72) return (state.turn === 'r' ? 1 : -1) * evaluate(state); // 单调总帧数硬上限72: 正常迭代深度~12远小于此, 连将/吃子链任何路径数学封顶, RangeError不可能
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

   const inChk = PRO_isInCheck(state, c);
   // 防守战术区: 己王被将军或受直接攻击时, 禁 null-move、LMR 不减, 保证防守搜索对称
   let underThreat = inChk;
   if (!inChk) {
     const k = PRO_findKing(state, c);
     if (k && PRO_fastIsAttacked(state, k[0], k[1], state.turn === 'r' ? 'b' : 'r')) underThreat = true;
   }
   // 空着裁剪: 自适应 R(残局/极少子力谨慎或禁用); 基准 depth-3; 防守战术区禁空着
   if (allowNull && !inChk && !underThreat && !state.jieqi && depth >= 3 && hasHeavy(state, c) && ply >= 1 && Number.isFinite(beta)) {
     let reduction = 3;
     if (_F.nullR) {
       const np = countNonKing(state);
       if (np <= 9) reduction = 0;            // 极少子力残局可能 zugzwang: 禁空着
       else if (np <= 16) reduction = 2;     // 残局更谨慎(少减搜)
     }
     if (reduction > 0) {
       state.turn = c === 'r' ? 'b' : 'r';
       const v = -negamax(state, depth - reduction, -beta, -beta + 1, ply + 1, ctx, (key ^ ZTURN) >>> 0, false);
       state.turn = c;
       if (ctx.stop) return 0;
       if (v >= beta) return beta;
     }
   }

   const scored = legalMovesScored(state, c, ctx, ply, ttMove, ctx.killers[ply] || null);
   if (scored.length === 0) return -MATE + ply;

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
     const givesCheck = PRO_isInCheck(state, state.turn);
     const cap = u.cap;
     if (futile && !cap && !givesCheck) { sunmake(state, u); idx++; continue; }
     let ext = (givesCheck && depth >= 2 && ply < 24) ? 1 : 0; // 将军扩展
     // 威胁扩展: 上一手吃到大子后本线"继续追击"加深1(总扩展受 ply 上限约束)
     if (_F.threatExt && cap && VAL[cap.t] >= 400 && depth >= 3 && ply < 20) ext += 1;
     let nd = depth - 1 + ext;
     let reduced = false;
     if (ctx.useLmr && allowNull && depth >= 3 && idx >= 3 && !cap && !givesCheck && !inChk
       && Number.isFinite(beta) && alpha > -MATE + 1000) {
       // 连续 LMR: 减搜幅度随深度/着法序号连续(深且靠后减得更深)
       let R = 1;
       if (_F.lmr2) {
         if (depth >= 5 && idx >= 7 && !underThreat) R = 2;
         else R = 1;
       } else {
         R = (depth >= 5 && idx >= 7) ? 2 : 1;
       }
       nd -= R; reduced = true;
     }
     let v = -negamax(state, nd, -beta, -alpha, ply + 1, ctx, zApply(key, u), true);
     if (reduced && !ctx.stop && v > alpha) {
       sunmake(state, u);
       const u2 = smake(state, m);
       v = -negamax(state, depth - 1 + (givesCheck ? 1 : 0), -beta, -alpha, ply + 1, ctx, zApply(key, u2), true);
       sunmake(state, u2);
     } else sunmake(state, u);
     if (ctx.stop) return 0;
     if (v > best) { best = v; bestMove = m; }
     if (v > alpha) alpha = v;
     if (alpha >= beta) {
       if (!cap) {
         const k = ctx.killers[ply] || (ctx.killers[ply] = [null, null]);
         if (!k.some(x => x && x.from[0] === m.from[0] && x.to[0] === m.to[0] && x.from[1] === m.from[1] && x.to[1] === m.to[1])) {
           k[1] = k[0]; k[0] = m;
         }
         ctx.hist[c][m.from[1] * 810 + m.from[0] * 90 + m.to[1] * 9 + m.to[0]] += depth * depth;
       }
       // countermove 记忆: 记录"对手上一手之后, 本方 cutoff 的应对着"
       if (ctx.counter && ctx.prevLastKey != null) {
         ctx.counter.set(ctx.prevLastKey, m);
       }
       break;
     }
     idx++;
   }
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
     counter: _F.counter ? new Map() : null, prevLastKey: null, lastMove: null,
     hint: opts.hintMove || null,
     useQuie: level >= 3,
     useLmr: level >= 3 && !opts.noLmr && (opts.endgameBonus == null ? true : opts.endgameBonus < 2),
     useFutil: level >= 3,
     deadline, stop: false, nodes: 0,
     style: opts.style || 'balance'
   };
 }

 // level 1..5; 返回 {from,to,score,depth,nodes,...}
 // opts.deterministic: 提示/复盘路径用, 全程 argmax 不走随机, 保证可复现
 function search(state, opts = {}) {
   _F = { ...FEAT, ...(opts.feat || {}) }; // 运行时覆盖特性(便于 A/B), 默认=FEAT
   const level = opts.level || 3;
   const deadline = opts.deadline || (Date.now() + 4000);
   const deterministic = !!opts.deterministic;
   const rng = deterministic ? (() => 0) : (opts.rng || Math.random);
   if (!opts.noBook && !state.jieqi) {
     const bm = PRO_bookMove(state, rng);
     if (bm) return { ...bm, score: 0, depth: 0, nodes: 0, book: true };
   }
   // 根治A: 在深拷贝副本上搜索, 绝不 mutate 调用方原 state(超时中断漏 restore 也只污染将丢弃的副本)
   state = PRO_createState({ fen: PRO_toFEN(state) });
   const egBonus = endgameBonus(state);
   const ctx = makeCtx(level, deadline, { ...opts, endgameBonus: egBonus });
   state._mobility = level >= 4;
   const moves = legalMovesScored(state, state.turn, ctx, 0, null, null).map(x => x.m);
   if (moves.length === 0) return null;
   if (moves.length === 1) return { ...moves[0], score: 0, depth: 1, nodes: 0 };

   if (!deterministic && level === 1 && rng() < 0.35) {
     return { ...moves[Math.floor(rng() * moves.length)], score: 0, depth: 1, nodes: 0, random: true };
   }
   const baseDepth = [0, 1, 2, 3, 5, 9][level] || 3;
   const maxDepth = Math.min(14, baseDepth + (level >= 4 ? egBonus : 0));
   let best = moves[0], bestScore = -Infinity, doneDepth = 0;
   const rootKey = boardKey(state);
   const timeBudget = deadline - Date.now();

   for (let d = 1; d <= maxDepth; d++) {
     let curBest = moves[0], curScore = -Infinity;
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
         const givesCheck = PRO_isInCheck(state, state.turn);
         // 记录本手前对手着法(countermove 用); 根节点以对手上一真实着为准
         ctx.lastMove = (state.moves && state.moves.length) ? state.moves[state.moves.length - 1] : null;
         ctx.prevLastKey = ctx.lastMove
           ? ctx.lastMove.from[1] * 810 + ctx.lastMove.from[0] * 90 + ctx.lastMove.to[1] * 9 + ctx.lastMove.to[0]
           : null;
         let v;
         if (mi === 0) {
           v = -negamax(state, d - 1 + (givesCheck ? 1 : 0), -beta, -a, 1, ctx, zApply(rootKey, u), true);
         } else {
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
     if (ctx.stop) break;
     best = curBest; bestScore = curScore; doneDepth = d;
     if (Math.abs(curScore) > MATE - 200 && d >= 8) break;
     if (Date.now() > deadline) break;
     // 根动态时间管理: 已大优>600厘、首选稳定、用时已超 60% 预算 → 提前结束(类PUCT平稳局面少搜)
     if (_F.rootTime && level >= 4 && d >= 4
       && Math.abs(bestScore) > 600 && (deadline - Date.now()) < timeBudget * 0.4) {
       break;
     }
   }
   // 根着法去随机化: 仅在等优着法间 softmax 加权随机; 战术/强制杀/唯一着/确定性优先
   let chosen = best, chosenScore = bestScore;
   if (!deterministic && level >= 2 && moves.length > 1 && Number.isFinite(bestScore)
     && Math.abs(bestScore) < MATE - 200 && doneDepth >= 2) {
     try {
       const pick = pickDiverseRootMove(state, best, bestScore, doneDepth, ctx, deadline, level, rng);
       if (pick) { chosen = pick.move; chosenScore = pick.score; }
     } catch (e) { /* 回退确定性最佳着 */ }
   }
   if (!deterministic && level === 1 && rng() < 0.25) chosen = moves[Math.floor(rng() * moves.length)];
   return { ...chosen, score: chosenScore, depth: Math.max(1, doneDepth), nodes: ctx.nodes };
 }

 // 回退: 从当前局面选首个合法着(供顶层防御用, 时间安全)
 function firstLegal(state) {
   for (const m of PRO_pseudoMoves(state, state.turn)) {
     const u = smake(state, m);
     if (!PRO_isInCheck(state, state.turn)) { sunmake(state, u); return m; }
     sunmake(state, u);
   }
   return null;
 }

 return { search, firstLegal };
})();

export function searchBestMovePro(state, opts = {}) {
  // 入口(栈充足时)预存零调用 fallback: 原 state 首个真实合法着坐标; 终局记 null
  let fallback = null;
  try {
    const lm = PRO_legalMoves(state, state.turn);
    if (lm && lm.length) fallback = { from: lm[0].from, to: lm[0].to, score: 0, depth: 1, nodes: 0 };
  } catch (e0) {}
  // 根治B: 返回前在【原 state】上校验合法性, 不合法则回退真实合法着; 终局返回 null
  try {
    const mv = PRO_engine.search(state, opts);
    if (mv) {
      const lm = PRO_legalMoves(state, state.turn);
      const ok = lm.some(m => m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
      if (ok) return mv;
      if (lm.length) return { ...lm[0], score: 0, depth: 1, nodes: 0 };
    }
    return null; // 无合法着 = 终局
  } catch (e) {
    // 零栈 catch: 不做任何函数调用, 直接返回入口预存 fallback(异常沿栈 unwind 释放深层帧后才到此)
    return fallback;
  }
}
