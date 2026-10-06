// ============================================================
// XQRecords: 对局战绩组装 + 本地持久化桥接(仅本机 localStorage)
// 存储键沿用 storage.js 的 xq_records_v1(战绩/棋谱), 与 screen-records 展示、
//   analyzeRecord 复盘分析共用同一份数据; 本模块只负责"组装一条完整战绩"与薄封装。
// 记录字段: 模式/先后手/引擎类型/等级/胜负和原因/用时/手数/着法/日期/初始局面。
// ============================================================
import { store } from './storage.js';

// 把引擎着法裁剪为可回放的精简形式(复盘/导出/分析共用)
export function XQTrimMoves(moves = []) {
  return moves.map(m => ({
    from: m.from, to: m.to, notation: m.notation,
    reveal: m.reveal ? { pos: m.reveal.pos, t: m.reveal.t } : null
  }));
}

// 组装一条战绩。
// ctx: { mode(中文名), result, reason, state, cfg, mySide, durationMs, at }
export function XQBuildRecord(ctx = {}) {
  const { state, cfg = {} } = ctx;
  const moves = XQTrimMoves(state.moves || []);
  return {
    mode: ctx.mode || '',
    side: ctx.mySide || null,                 // 先后手 'r'|'b' (同台/联机双方均有)
    result: ctx.result || '',                 // 胜/负/和棋/红胜/黑胜
    reason: ctx.reason || '',                 // 引擎/终局原因 key
    jieqi: !!cfg.jieqi,
    time: cfg.time || 'none',                 // 计时规则 id
    aiLevel: cfg.aiLevel ?? null,            // 人机等级 1..5
    aiEngine: cfg.aiEngine || null,          // classic | pro
    plies: moves.length,                      // 总手数
    durationMs: Math.max(0, Math.round(ctx.durationMs || 0)), // 对局用时
    moves,                                    // 精简着法(可回放/可导出)
    fen: state.initialFen || null,           // 初始 FEN(残局/排局)
    seed: state.seed,                        // 揭棋随机种子
    at: ctx.at || Date.now()
  };
}

// 保存一条战绩(store 自动补 id/at, 仅留最近 100 条)
export function XQSaveRecord(rec) { return store.saveRecord(rec); }

// 战绩列表(新->旧排序由调用方决定; 此处返回 store 原始顺序: 新在前)
export function XQListRecords() { return store.records(); }

export function XQRemoveRecord(id) { return store.removeRecord(id); }
export function XQClearRecords() { return store.clearRecords(); }

// 序列化往返自检(纯数据, 不碰 localStorage): 构造 -> 经 JSON 往返 -> 字段齐全
export function XQRoundTrip(rec) {
  const s = JSON.parse(JSON.stringify(rec));
  const need = ['mode', 'result', 'reason', 'plies', 'moves', 'fen', 'seed', 'at'];
  return need.every(k => k in s) && Array.isArray(s.moves) && s.moves.length === rec.plies;
}
