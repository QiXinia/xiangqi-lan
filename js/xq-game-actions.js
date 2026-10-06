// ============================================================
// XQGameActions: 悔棋 / 求和 / 认输 的纯决策策略(无 DOM, 可 node 测)
// 与 game-controller 的各模式状态机对应:
//   ai    人机        local 同台双人    puzzle 残局    free 自由练习    lan 联机
// 联机(lan)的悔棋/求和走 room.js 既有"请求-同意"协议, 本模块不碰 net 文件,
//   controller 侧仅在收到房间事件后把 this.state=this.room.state 做本地回退。
// ============================================================

// 悔棋应撤回的半回合数(plies)。
// { mode, state, mySide } -> { n, pair:bool }
//   pair=true 表示撤回的是"玩家+AI"成对两着(人机/残局撤完轮到玩家)。
export function XQUndoPlan({ mode, state, mySide } = {}) {
  const total = (state && state.moves) ? state.moves.length : 0;
  if (!total) return { n: 0, pair: false };
  // 同台双人 / 自由练习: 撤回上一步(一着)
  if (mode === 'local' || mode === 'free') return { n: Math.min(1, total), pair: false };
  // 人机 / 残局: 轮到我方(刚由 AI/对手走完) -> 撤一对(玩家+AI), 撤完仍由我方行棋;
  //              我方刚走完、对方在思考 -> 只撤我方这一手, 回到我方行棋。
  if (mode === 'ai' || mode === 'puzzle') {
    const toUs = state.turn === mySide;
    const n = toUs ? Math.min(2, total) : Math.min(1, total);
    return { n, pair: toUs && n === 2 };
  }
  // 联机由房间协议决定撤回数(通常 n=2 双方各一手); controller 不调用本函数
  return { n: 0, pair: false };
}

// 求和流程:
//   direct  人机/自由练习: 玩家提议即判和(双方协商和棋 agreement)
//   confirm 同台双人: 任一方点和 -> 弹"双方同意和棋"确认 -> 作和
//   request 联机: 发和棋请求, 对方同意才作和(room 协议)
//   none    残局: 不提供和棋
export function XQDrawFlow(mode) {
  if (mode === 'ai' || mode === 'free') return 'direct';
  if (mode === 'local') return 'confirm';
  if (mode === 'lan') return 'request';
  return 'none';
}

// 认输结果。非同台: 认输方即 mySide, 对方胜。
// 返回 { status, reason } 或 'pick-side'(同台需先选红/黑哪方认输)
export function XQResignResult({ mode, mySide } = {}) {
  if (mode === 'local') return 'pick-side';
  const loser = mySide || 'r';
  return { status: loser === 'r' ? 'blackwin' : 'redwin', reason: 'resign' };
}

// 终局是否应入库战绩(与原规则一致: 未走任何棋不入库; 观战/自由练习不入库)
export function XQShouldRecord({ mode, mySide, plies } = {}) {
  if (mode === 'free') return false;          // 自由练习不记
  if (mySide === 'spec') return false;        // 观战不记
  if (!(plies > 0)) return false;             // 没走子不记
  if (mode === 'puzzle') return false;        // 残局走进度, 不走对局战绩
  return true;
}

// 终局原因中文短名(导出/记录用)
export const XQReasonText = {
  checkmate: '将死', stalemate: '困毙', perpetual: '长将判负',
  repetition: '三次重复和棋', nocapture: '连续40回合无吃子和棋',
  timeout: '超时判负', resign: '认输', offline: '断线超时判负', agreement: '双方协商和棋'
};
