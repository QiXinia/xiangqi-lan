// AI 计算 Worker(避免搜索阻塞棋盘动画与计时)
import { restore, mulberry32 } from './engine.js';
import { searchBestMove, hintMove, puzzleHintMove } from './ai.js';
import { searchBestMovePro } from './ai-pro.js';
import { analyzeGame } from './analyze-core.js';

self.onmessage = (e) => {
  const d = e.data;
  // 复盘分析任务(长任务, 逐手回传进度)
  if (d.analyze) {
    try {
      const report = analyzeGame(
        d.initial, d.moves,
        { deadlineMs: d.deadlineMs || 1200, style: d.style || 'balance',
          onProgress: (index, total) => self.postMessage({ reqId: d.reqId, progress: true, index, total }) });
      self.postMessage({ reqId: d.reqId, ok: true, done: true, report });
    } catch (err) {
      self.postMessage({ reqId: d.reqId, ok: false, done: true, error: String(err && err.stack || err) });
    }
    return;
  }
  const { reqId, snapshot, level, deadlineMs = 4000, hint = false, style, puzzleHint = false, puzzleId = null, mateTarget = 6, attacker = 'r', seed = null, ply = null, engine = 'classic' } = d;
  try {
    const state = restore(snapshot);
    // 可复现随机源: 仅"AI 自己落子"的 normal 路径由 (seed,ply) 派一手一随机;
    // 提示/残局精确提示/复盘一律确定性, 不注入任何 rng。
    let mv;
    if (puzzleHint) {
      mv = puzzleHintMove(state, { puzzleId, mateTarget, attacker, deadline: Date.now() + deadlineMs, style, deterministic: true });
    } else if (hint) {
      // 提示(人机/定式例胜/守和): 一律确定性经典大师搜索。定式残局不在开局库,
      // 显式 noBook, 避免命中开局库给出与当前残局无关的着法(表现为提示点错子/点不动);
      // 始终走经典引擎, 不随 engine 切 pro。
      mv = hintMove(state, { style, deterministic: true, noBook: true });
    } else {
      let rng = null;
      if (seed != null && ply != null) {
        rng = mulberry32((seed ^ Math.imul(ply + 1, 2654435761)) >>> 0);
      }
      // 引擎可切换: 仅人机自由落子受 engine 影响; hint/puzzleHint/复盘走精确确定性路径, 不随引擎变化
      const searchFn = engine === 'pro' ? searchBestMovePro : searchBestMove;
      mv = searchFn(state, { level, deadline: Date.now() + deadlineMs, style, rng });
    }
    self.postMessage({ reqId, ok: true, mv: mv ? { from: mv.from, to: mv.to, score: mv.score, depth: mv.depth, book: !!mv.book } : null });
  } catch (err) {
    self.postMessage({ reqId, ok: false, error: String(err) });
  }
};
