// ============================================================
// XQExporter: 整局中文标准棋谱导出(纯文本, 离线, 无外链)
//   - 由引擎着法(notation) 生成标准中文记谱棋谱, 含开局名/结果/手数
//   - 开局识别: 与 OPENINGS 库按前缀(经 canon 归一)匹配最具体者
//   - 复制到剪贴板 / 可选 navigator.share 分享纯文本
//   - 回放校验: 导出的着法文本可被 notation.js 互逆还原并由引擎重放
// 纯逻辑函数(DetectOpening/ExportText/ReplayCheck)无 DOM, 可 node 测;
//   CopyText/ShareText 仅浏览器调用(延迟引用 navigator/document)。
// ============================================================
import { OPENINGS } from './openings.js';
import { createState, applyMove, toFEN } from './engine.js';
import { canon, parseMove } from './notation.js';

// 终局原因短名(与 controller REASON_TEXT / records 一致)
const REASON = {
  checkmate: '将死', stalemate: '困毙', perpetual: '长将判负',
  repetition: '三次重复和棋', nocapture: '连续40回合无吃子和棋',
  timeout: '超时判负', resign: '认输', offline: '断线超时判负', agreement: '双方协商和棋'
};

// 识别开局: 着法 notation 序列与 OPENINGS 前缀最长匹配。
// 至少匹配 4 手(2 回合)才认定, 避免把"炮二平五"这类单步误报。
// jieqi/自定义 FEN(残局/排局) 不识别开局。
export function XQDetectOpening(moves = [], { jieqi = false, fen = null } = {}) {
  if (jieqi || fen || !moves.length) return '';
  const got = moves.map(m => canon(m.notation || ''));
  let best = '', bestLen = 0;
  for (const op of OPENINGS) {
    if (op.fen) continue; // 排局/古谱从 FEN 摆起, 不匹配常规开局
    const want = op.moves.map(canon);
    let l = 0;
    while (l < want.length && l < got.length && want[l] === got[l]) l++;
    if (l > bestLen) { bestLen = l; best = op.name; }
  }
  return bestLen >= 4 ? best : '';
}

// 生成整局标准中文棋谱纯文本。
// opt: { moves, result, reason, mode, jieqi, fen, seed, time, at, opening }
export function XQExportText(opt = {}) {
  const moves = opt.moves || [];
  const d = new Date(opt.at || Date.now());
  const p2 = n => String(n).padStart(2, '0');
  const opening = opt.opening || XQDetectOpening(moves, { jieqi: opt.jieqi, fen: opt.fen });
  const reasonTxt = REASON[opt.reason] || opt.reason || '';
  const head = [
    '【中国象棋对局棋谱】',
    '时间: ' + `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`,
    opt.mode ? '对局: ' + opt.mode : '',
    '玩法: ' + (opt.jieqi ? '揭棋' : '经典'),
    opening ? '开局: ' + opening : '',
    '结果: ' + (opt.result || '未终局') + (reasonTxt ? '(' + reasonTxt + ')' : ''),
    '手数: ' + moves.length + ' 手 / ' + Math.ceil(moves.length / 2) + ' 回合',
    ''
  ].filter(Boolean);

  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    const no = String(i / 2 + 1).padStart(2, ' ');
    const r = (moves[i] && moves[i].notation) || '';
    const b = (moves[i + 1] && moves[i + 1].notation) || '';
    rows.push(no + '. ' + r.padEnd(7, '　') + b);
  }
  return head.join('\n') + '\n' + rows.join('\n');
}

// 回放校验: 用导出的 notation 逐条经 notation.parseMove 还原并 applyMove,
// 断言每手 from/to 与原始着法一致。经典满盘开局之外局面也能自洽。
export function XQReplayCheck(moves = [], { jieqi = false, fen = null, seed = 0 } = {}) {
  const s = createState({ jieqi, fen, seed });
  for (const m of moves) {
    const p = parseMove(s, m.notation);
    if (!p || p.from[0] !== m.from[0] || p.from[1] !== m.from[1]
      || p.to[0] !== m.to[0] || p.to[1] !== m.to[1]) return false;
    applyMove(s, p.from, p.to, { revealT: m.reveal ? m.reveal.t : null });
  }
  return true;
}

// ---- 以下为浏览器侧副作用 API(node 不调用) ----
// 复制到剪贴板(含 execCommand 兜底); 成功返回 true
export async function XQCopyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text); return true;
    }
    throw new Error('no clipboard api');
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}

// 调用系统分享纯文本(不支持则返回 false, 由调用方回退复制)
export async function XQShareText(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return true; }
  } catch (e) { /* 用户取消/不支持 */ }
  return false;
}
