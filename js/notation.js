// ============================================================
// 中文棋谱解析: 中文记谱(如"炮二平五""前马退三""兵七进一") → 着法坐标
// 原理: 枚举当前局面全部合法着法, 用 engine.moveNotation 重新生成谱名比对,
//       与记谱器严格互逆, 天然处理"前/后"同名子、斜行子目标列等歧义。
// ============================================================
import { legalMoves, moveNotation, applyMove } from './engine.js';

const CN_NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '１': 1, '２': 2, '３': 3, '４': 4, '５': 5, '６': 6, '７': 7, '８': 8, '９': 9 };

// 归一化: 去空白/标点, 中文(全角)数字转阿拉伯
export function canon(text) {
  return String(text).replace(/[\s\.。,，・·-]/g, '').replace(/[一二三四五六七八九１-９]/g, ch =>
    /[１-９]/.test(ch) ? String(ch.charCodeAt(0) - 0xff10) : String(CN_NUM[ch]));
}

// 在当前局面解析一条谱着, 返回 {from,to} 或 null(无匹配/不合法)
export function parseMove(state, text) {
  const want = canon(text);
  for (const m of legalMoves(state, state.turn)) {
    if (canon(moveNotation(state, m.from, m.to)) === want) return m;
  }
  return null;
}

// 解析并执行一条谱着; 失败返回 null 且不修改 state
export function applyNotation(state, text) {
  const m = parseMove(state, text);
  if (!m) return null;
  return applyMove(state, m.from, m.to);
}

// 逐步解析一整盘谱; 返回 { moves:[{text,from,to,notation}], ok, errorIndex }
// 任一着法非法即中止, 已走的着法保留在 state 上
export function playLine(state, texts) {
  const moves = [];
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const m = parseMove(state, text);
    if (!m) return { moves, ok: false, errorIndex: i, errorText: text };
    const rec = applyMove(state, m.from, m.to);
    moves.push({ text, from: m.from, to: m.to, notation: rec.notation });
  }
  return { moves, ok: true, errorIndex: -1 };
}
