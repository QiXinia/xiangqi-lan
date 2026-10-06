// ============================================================
// AI 复盘分析核心(无 DOM/Worker 依赖, 可在 node 与 worker 中共用):
// 逐手重建局面, 全根着法评分(Multi-PV), 比较实际着法与最佳着法并评级
// ============================================================
import { createState, applyMove, moveNotation } from './engine.js';
import { searchBestMove, scoreMove, MATE } from './ai.js';
import { openingHasMove } from './openings.js';

export { MATE };

// 评级: brilliant 妙手!! / good 好着! / best 正着 / inaccuracy 缓手?! / mistake 错着? / blunder 败着??
// depth 较浅(中局 horizon 内分数噪声大)时放宽失误阈值, 避免把正常着法误判
export function gradeMove(bestScore, playedScore, playedEqBest, playedMove, depth = 6) {
  if (bestScore >= MATE - 200 && playedScore < MATE - 200) return 'blunder'; // 漏杀(强制杀精确, 与深度无关)
  if (playedScore <= -MATE + 200) return 'blunder';                          // 送杀
  const diff = bestScore - playedScore;
  if (playedEqBest || diff <= 12) {
    const cap = playedMove && playedMove.captured;
    const isSacrifice = cap && (cap.t === 'R' || cap.t === 'C' || cap.t === 'N') && bestScore >= 120;
    const onlyMate = bestScore >= MATE - 200;
    if (isSacrifice || onlyMate) return 'brilliant';
    if (bestScore <= -120) return 'good'; // 劣势下走对最顽强防守
    return 'best';
  }
  // 阈值随搜索深度收紧: 浅中局 horizon 内分数噪声大
  const inacMax = depth >= 7 ? 45 : depth >= 5 ? 65 : 90;
  const misMax = depth >= 7 ? 120 : depth >= 5 ? 170 : 220;
  if (diff <= inacMax) return 'inaccuracy';
  if (diff <= misMax) return 'mistake';
  return 'blunder';
}

// initial: {jieqi,fen,seed}; moves: 棋谱着法数组 {from,to,notation,captured,reveal}
// onProgress(i,total); 返回 report
export function analyzeGame(initial, moves, { deadlineMs = 1200, style = 'balance', onProgress = null, maxDepth = 9 } = {}) {
  const state = createState({ jieqi: !!initial.jieqi, fen: initial.fen, seed: initial.seed });
  const grades = [];
  const curve = [];
  let totalNodes = 0, sumDepth = 0;
  for (let i = 0; i < moves.length; i++) {
    const pm = moves[i];
    const c = state.turn;
    // 最佳着: PVS 迭代加深(关闭开局库, 60% 时限); 复盘分析必须确定性可复现
    const bestMv = searchBestMove(state, {
      level: 5, deadline: Date.now() + Math.floor(deadlineMs * 0.62), style, noBook: true, deterministic: true
    });
    const bestScore = bestMv ? bestMv.score : 0;
    const depth = bestMv ? bestMv.depth : 1;
    totalNodes += bestMv ? (bestMv.nodes || 0) : 0;
    const playedEqBest = !!(bestMv && pm.from[0] === bestMv.from[0] && pm.from[1] === bestMv.from[1]
      && pm.to[0] === bestMv.to[0] && pm.to[1] === bestMv.to[1]);
    // 实际着分数: 与最佳同着则直接采用, 否则固定深度全窗精评(40% 时限)
    let playedScore = bestScore;
    let scoreNodes = 0;
    if (!playedEqBest) {
      const r = scoreMove(state, pm.from, pm.to, {
        depth: Math.max(4, depth), deadline: Date.now() + Math.ceil(deadlineMs * 0.45), style
      });
      playedScore = r.illegal ? bestScore - 400 : r.score;
      scoreNodes = r.nodes || 0;
    }
    totalNodes += scoreNodes; sumDepth += depth;
    // 开局库定式着法直接认定正着(浅中局搜索对标准定式的评分噪声大)
    const bookHit = openingHasMove(state, pm.from, pm.to);
    let g = bestMv ? gradeMove(bestScore, playedScore, playedEqBest, pm, depth) : 'best';
    if (bookHit && (g === 'inaccuracy' || g === 'mistake' || g === 'blunder')) g = 'best';
    const redView = Math.max(-MATE, Math.min(MATE, (c === 'r' ? bestScore : -bestScore)));
    grades.push({
      ply: i, color: c, notation: pm.notation || '', grade: g,
      bestNotation: bestMv ? moveNotation(state, bestMv.from, bestMv.to) : '',
      bestFrom: bestMv ? bestMv.from : null, bestTo: bestMv ? bestMv.to : null,
      bestScore, playedScore, redView, depth
    });
    curve.push({ ply: i, red: redView });
    if (onProgress) onProgress(i + 1, moves.length);
    applyMove(state, pm.from, pm.to, { revealT: pm.reveal ? pm.reveal.t : null });
    if (state.status !== 'playing') break;
  }
  const order = { brilliant: 4, good: 3, best: 2, inaccuracy: 1, mistake: 0, blunder: -1 };
  const blunders = grades
    .filter(x => x.grade === 'mistake' || x.grade === 'blunder' || x.grade === 'inaccuracy')
    .sort((a, b) => (order[a.grade] - order[b.grade])
      || (b.bestScore - b.playedScore) - (a.bestScore - a.playedScore));
  return {
    grades, curve, blunders,
    counts: grades.reduce((acc, x) => { acc[x.grade] = (acc[x.grade] || 0) + 1; return acc; }, {}),
    avgDepth: grades.length ? +(sumDepth / grades.length).toFixed(1) : 0,
    nodes: totalNodes, analyzed: grades.length
  };
}
