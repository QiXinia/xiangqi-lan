// ============================================================
// AI 复盘分析(主线程侧): 驱动 worker 逐手评分, 管理进度/取消/缓存
// ============================================================
import { createAiWorker } from './game-controller.js';
import { store } from './storage.js';

export const GRADE_META = {
  brilliant:   { sym: '!!', label: '妙手', cls: 'g-brilliant' },
  good:        { sym: '!',  label: '好着', cls: 'g-good' },
  best:        { sym: '✓',  label: '正着', cls: 'g-best' },
  inaccuracy:  { sym: '?!', label: '缓手', cls: 'g-inaccuracy' },
  mistake:     { sym: '?',  label: '错着', cls: 'g-mistake' },
  blunder:     { sym: '??', label: '败着', cls: 'g-blunder' }
};

// 红方视角分数 -> 人类可读(单位: 兵=100; 绝杀/劣势)
export function scoreText(v) {
  if (v >= 99800) return '红绝杀';
  if (v <= -99800) return '黑绝杀';
  const n = v / 100;
  return (n > 0 ? '红优 ' : n < 0 ? '黑优 ' : '均势 ') + (Math.abs(n) < 0.15 ? '' : Math.abs(n).toFixed(1));
}

// 分析一局战绩记录; 返回 { promise, cancel }
export function analyzeRecord(rec, { onProgress, deadlineMs = 1200, style = 'balance' } = {}) {
  const cached = store.getAnalysis(rec.id);
  if (cached && cached.analyzed >= rec.moves.length) {
    return { promise: Promise.resolve(cached), cancel() { } };
  }
  const w = createAiWorker();
  const reqId = Date.now() & 0x7fffffff;
  let done = false, timer = null;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => { if (!done) { done = true; w.terminate(); reject(new Error('分析超时')); } },
      (rec.moves.length * deadlineMs + 60000));
    w.onmessage = (e) => {
      const d = e.data;
      if (d.reqId !== reqId) return;
      if (d.progress) { onProgress && onProgress(d.index, d.total); return; }
      if (d.done) {
        clearTimeout(timer); done = true; w.terminate();
        if (d.ok) { store.saveAnalysis(rec.id, d.report); resolve(d.report); }
        else reject(new Error(d.error || '分析失败'));
      }
    };
    w.onerror = (err) => { if (!done) { done = true; clearTimeout(timer); w.terminate(); reject(err); } };
    w.postMessage({
      reqId, analyze: true,
      initial: { jieqi: !!rec.jieqi, fen: rec.fen, seed: rec.seed },
      moves: rec.moves, deadlineMs, style
    });
  });
  return {
    promise,
    cancel() { if (!done) { done = true; clearTimeout(timer); w.terminate(); } }
  };
}
