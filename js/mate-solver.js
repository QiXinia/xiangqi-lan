// ============================================================
// 残局精确强制杀求解器(供残局"提示"使用, 保证玩家靠提示必能走成杀)
//   与 ai.js 的启发式搜索不同: 这里做【可证明】的布尔 AND/OR 强制杀搜索——
//   攻击方存在一手, 使无论防守方如何应对, 攻击方都能在限定手数内将死/困毙。
//   刻意不使用可能误证的 alpha-beta 边界置换, 只记忆"局面+手数+行棋方"的
//   必胜/必不胜布尔结论(博弈论确定值, 与到达路径无关), 保证结论可靠。
//   技巧: 连将快速层 + 将军/吃子着法优先 + 防守应着"吃子/动将优先"(尽早找到
//         逃路剪枝, 仅影响顺序不影响正确性) + 精确 FEN 键(无哈希碰撞) + 预算保护。
//   仅用于残局提示; 普通人机/联机对战仍走 ai.js, 行为不受影响。
// ============================================================
import { legalMoves, isInCheck } from './engine.js';

// ---------- 轻量 make/unmake(经典局面无暗子, 仍兼容揭棋字段) ----------
function mateMake(s, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  const wasHidden = p.hidden, orig = p.orig;
  if (wasHidden) { p.hidden = false; p.orig = undefined; }
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty, wasHidden, orig };
}
function mateUndo(s, u) {
  s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap;
  if (u.wasHidden) { u.p.hidden = true; u.p.orig = u.orig; }
  s.turn = s.turn === 'r' ? 'b' : 'r';
}
// 精确局面键(只列占子格, 含颜色/类型/坐标与轮次; 不用哈希, 杜绝碰撞误证)
function matePosKey(s) {
  let k = s.turn;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x];
    if (p) k += `/${x},${y},${p.c}${p.hidden ? '~' + p.orig : p.t}`;
  }
  return k;
}
const mateIsKing = (s, x, y) => { const p = s.board[y][x]; return p && p.t === 'K'; };

// 攻击方候选着法(进入时轮到攻击方)。
// 连将层(checksOnly): n>1 只取将军着(连将杀分支极小); n==1 放开全部着法,
//   兼容"困毙"末手(困毙末手不将军, 却令防守方无棋可走)。
// 全量层: 将军着优先, 次吃子, 后安静着(缓手控杀所需)。
function mateAttacks(s, atk, def, checksOnly, n) {
  const all = legalMoves(s, atk);
  if (checksOnly && n > 1) {
    return all.filter(m => { const u = mateMake(s, m); const chk = isInCheck(s, def); mateUndo(s, u); return chk; });
  }
  const checks = [], caps = [], quiet = [];
  for (const m of all) {
    const u = mateMake(s, m);
    const chk = isInCheck(s, def); const cap = !!u.cap;
    mateUndo(s, u);
    if (chk) checks.push(m); else if (cap) caps.push(m); else quiet.push(m);
  }
  return checks.concat(caps, quiet);
}
// 防守方应着: 吃子/动将优先(最可能逃杀), 令攻击方不成立的着法尽早被发现(仅排序)
function mateDefends(s, def) {
  const list = legalMoves(s, def);
  const caps = [], kings = [], other = [];
  for (const m of list) {
    const target = s.board[m.to[1]][m.to[0]];
    if (target) caps.push(m);
    else if (mateIsKing(s, m.from[0], m.from[1])) kings.push(m);
    else other.push(m);
  }
  return caps.concat(kings, other);
}

class MateSolver {
  constructor(atk, def, checksOnly, budget) {
    this.atk = atk; this.def = def; this.checksOnly = checksOnly;
    this.budget = budget; this.tt = new Map();
  }
  tick() {
    if (++this.budget.nodes > this.budget.maxNodes) this.budget.out = true;
    if (this.budget.deadline && Date.now() > this.budget.deadline) this.budget.out = true;
    return this.budget.out;
  }
  // 防守方行棋(进入时轮到防守方, 攻击方刚走完一手): 攻击方还剩 n 手。
  // 当且仅当防守方【每一个】合法应着之后攻击方仍能在 n 手内成杀, 才返回 true。
  defProve(s, n) {
    const defs = mateDefends(s, this.def);
    if (defs.length === 0) return true; // 防守无着: 已被将死/困毙
    if (n <= 0) return false;
    const key = 'D' + n + '|' + matePosKey(s);
    const cached = this.tt.get(key);
    if (cached !== undefined) return cached;
    if (this.tick()) { this.tt.set(key, false); return false; }
    for (const dm of defs) {
      const u = mateMake(s, dm);
      const ok = this.prove(s, n);
      mateUndo(s, u);
      if (!ok) { this.tt.set(key, false); return false; } // 存在一手逃过杀
      if (this.budget.out) { this.tt.set(key, false); return false; }
    }
    this.tt.set(key, true);
    return true;
  }
  // 攻击方行棋: 是否存在一手, 使其在 n 手内强制杀。返回获胜着对象或 null。
  prove(s, n) {
    if (n <= 0) return null;
    const key = 'A' + n + '|' + matePosKey(s);
    const cached = this.tt.get(key);
    if (cached === false) return null;
    if (this.tick()) return null;
    const am = mateAttacks(s, this.atk, this.def, this.checksOnly, n);
    if (am.length === 0) { this.tt.set(key, false); return null; }
    for (const m of am) {
      const u = mateMake(s, m);
      const good = this.defProve(s, n - 1);
      mateUndo(s, u);
      if (good && !this.budget.out) { this.tt.set(key, true); return m; }
      if (this.budget.out) return null;
    }
    this.tt.set(key, false);
    return null;
  }
}

// 求最短强制杀首着。
// opts: { attacker:'r'|'b'(默认 r), maxMoves(默认 6), deadline(时间戳),
//         maxNodes(默认 2亿), quiet(允许安静控杀; 默认 true) }
// 返回 { from,to,mate,status,nodes,kind }
//   status: 'win' 已证最短杀 | 'none' 可证 maxMoves 内无杀 | 'unknown' 预算不足
export function findForcedMate(state, opts = {}) {
  const atk = opts.attacker || 'r';
  const def = atk === 'r' ? 'b' : 'r';
  const maxMoves = opts.maxMoves || 6;
  const allowQuiet = opts.quiet !== false;
  const mkBudget = () => ({ nodes: 0, maxNodes: opts.maxNodes || 200_000_000, deadline: opts.deadline || 0, out: false });
  const win = (mv, n, kind, nodes) => ({ from: mv.from, to: mv.to, mate: n, status: 'win', nodes, kind });

  // 第一层(连将, 快): 求最短"连将杀"距离 nc。连将分支小, 可快速给出一个已证上界。
  let checkWin = null;
  {
    const budget = mkBudget();
    const solver = new MateSolver(atk, def, true, budget);
    for (let n = 1; n <= maxMoves; n++) {
      const mv = solver.prove(state, n);
      if (mv && !budget.out) { checkWin = win(mv, n, 'check', budget.nodes); break; }
      if (budget.out) break;
    }
  }
  if (!allowQuiet) {
    if (checkWin) return checkWin;
    return { from: null, to: null, mate: 0, status: 'none', nodes: 0 };
  }

  // 第二层(全量, 含缓手控杀): 按 n 升序证明。全量着法本就包含将军着且将军优先,
  // 故首个证得的 n 即【全局最短】。已证连将杀 nc 时只需证到 nc:
  //   若存在更短的缓手杀(n<nc)在此被发现; 否则 n==nc 会因将军优先很快复得连将杀。
  const budget = mkBudget();
  const solver = new MateSolver(atk, def, false, budget);
  const upTo = checkWin ? checkWin.mate : maxMoves;
  for (let n = 1; n <= upTo; n++) {
    const mv = solver.prove(state, n);
    if (mv && !budget.out) return win(mv, n, 'any', budget.nodes);
    if (budget.out) break;
  }
  // 全量已在 upTo 内穷尽却未证得: 理论上不会发生(连将着属于全量着法), 稳妥回退连将结果
  if (!budget.out) {
    if (checkWin) return checkWin;
    return { from: null, to: null, mate: 0, status: 'none', nodes: budget.nodes };
  }
  // 全量超时: 若连将杀已证明, 它仍是一着必胜(可安全采用); 否则交上层(大师)兜底
  if (checkWin) return checkWin;
  return { from: null, to: null, mate: 0, status: 'unknown', nodes: budget.nodes };
}
