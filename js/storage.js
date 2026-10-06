// 本地存储: 战绩/残局进度/设置(全部仅存本机)
const K_REC = 'xq_records_v1';
const K_PZ = 'xq_puzzle_v1';
const K_SET = 'xq_settings_v1';
const K_AN = 'xq_analysis_v1';

function safeGet(k, d) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
}
function safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

export const store = {
  // 战绩/棋谱
  records: () => safeGet(K_REC, []),
  saveRecord(r) {
    const list = safeGet(K_REC, []);
    const rec = { id: Date.now() + '' + Math.floor(Math.random() * 1000), at: Date.now(), ...r };
    list.unshift(rec);
    safeSet(K_REC, list.slice(0, 100));
    return rec;
  },
  removeRecord(id) { safeSet(K_REC, safeGet(K_REC, []).filter(r => r.id !== id)); },
  clearRecords() { safeSet(K_REC, []); },

  // 残局进度 { [id]: {stars:1-3, bestMoves:n} }
  puzzleProgress: () => safeGet(K_PZ, {}),
  setPuzzleResult(id, movesUsed) {
    const p = safeGet(K_PZ, {});
    const old = p[id];
    p[id] = old ? { ...old, bestMoves: Math.min(old.bestMoves, movesUsed), count: (old.count || 0) + 1 }
      : { bestMoves: movesUsed, count: 1 };
    safeSet(K_PZ, p);
    return p[id];
  },

  // 设置
  settings: () => safeGet(K_SET, { sound: true, theme: 'wood', name: '棋友', aiLevel: 3, aiStyle: 'balance', aiEngine: 'classic' }),
  saveSettings(patch) { safeSet(K_SET, { ...safeGet(K_SET, {}), ...patch }); },

  // AI 复盘分析缓存 { [recordId]: report }
  analysis: () => safeGet(K_AN, {}),
  getAnalysis(id) { return safeGet(K_AN, {})[id] || null; },
  saveAnalysis(id, report) {
    const all = safeGet(K_AN, {});
    all[id] = { at: Date.now(), ...report };
    // 仅保留最近 20 份, 控制本地体积
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at).slice(0, 20);
    const trimmed = {}; for (const k of keys) trimmed[k] = all[k];
    safeSet(K_AN, trimmed);
  },
  clearAnalysis(id) { const all = safeGet(K_AN, {}); delete all[id]; safeSet(K_AN, all); }
};
