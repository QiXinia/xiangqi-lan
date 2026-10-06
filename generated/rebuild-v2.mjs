// 统一重建题库 v2:
//  原 PUZZLES -> 应用 fixed-mate.json(64关合法化重算) -> 剔除 fixed-drops(6关)
//  -> endgame 19 关手工修正表 -> 合并 shard-classic.json(古谱名局)
//  -> 全量静态合法性 + playLine 主变复验 + 镜像去重 -> 排序连续编号 -> 覆盖 js/puzzles.js
import * as E from '../js/engine.js';
import { playLine } from '../js/notation.js';
import { PUZZLES as OLD } from './puzzles.orig.js'; // 始终以原始 271 关为底表, 避免与已合并古谱的产物自我重复
import fs from 'fs';

const ROOT = '/home/user/Doubao/chats/38444973861070338/xiangqi-lan';
const fixedMate = JSON.parse(fs.readFileSync(ROOT + '/generated/fixed-mate.json', 'utf8'));
const drops = new Set(JSON.parse(fs.readFileSync(ROOT + '/generated/fixed-drops.json', 'utf8')).map(p => p.id));
const classic = fs.existsSync(ROOT + '/generated/shard-classic.json')
  ? JSON.parse(fs.readFileSync(ROOT + '/generated/shard-classic.json', 'utf8')) : [];
// puzzle-check 二次兜底: 修复后杀步变短的关, 按最终 FEN 匹配重定步数/章节/主变
const RECUT = fs.existsSync(ROOT + '/generated/recut.json')
  ? JSON.parse(fs.readFileSync(ROOT + '/generated/recut.json', 'utf8')) : {};
// 强AI复核+棋理确证的旧错题改写: 单马借帅力必胜孤将(铁论), 原错误守和关改为胜局
const EG_DROP_NAMES = new Set();
const EG_CONVERT = {
  '孤将和单马': { name: '马胜孤将', type: 'win', humanSide: null,
    hint: '帅占中路、马控九宫成七步赶将之势，单马借帅力必擒孤将。' }
};

// ---------- endgame 定式手工修正(非法士象兵位 -> 合法位) ----------
const EG_FIX = {
  221: '3ak4/9/2n6/9/9/9/9/9/R3A4/4K4 r',
  222: '3aka3/9/9/9/9/9/9/9/R3A4/4K4 r',
  223: '4k4/9/4b4/9/4P4/9/9/7N1/9/4K4 r',
  226: '4k4/9/9/9/2b6/9/4C4/7N1/9/4K4 r',
  228: '2b1k1b2/9/5a3/9/9/9/4C4/9/4A2N1/4K4 r',
  229: '3aka3/9/9/9/2b6/9/4C4/7N1/9/3AKA3 r',
  230: '4k4/9/9/9/9/9/4C4/9/4A2N1/4K4 r',
  231: '3aka3/9/9/9/9/9/4C4/9/4A2N1/4K4 r',
  232: '3ak4/9/9/9/4P4/2P6/9/7N1/9/4K4 r',
  233: '3aka3/9/9/9/4P4/2P6/9/7N1/9/4K4 r',
  234: '4k4/9/4b4/9/4P4/9/1C7/9/4A4/4K4 r',
  235: '3aka3/9/9/9/4P4/9/1C7/9/4A4/4K4 r',
  236: '3aka3/9/4b4/9/4P4/6P2/1C7/9/9/4K4 r',
  237: '3ak4/9/9/9/9/9/4C4/9/9/3AKA3 r',
  238: '3ak4/9/9/9/4P4/2P6/9/9/9/4K4 r',
  240: '4k1b2/9/9/9/9/9/9/4C4/9/3AKA3 r',
  250: '3aka3/9/9/9/4P4/9/9/9/4A4/4K4 r',
  265: '2bakab2/9/1c7/9/4P4/6P2/9/9/9/3K5 r',
  266: '2bakab2/9/9/9/4P4/6P2/9/9/9/4K4 r'
};
// 定式规律订正: 炮双仕例和单象(原"胜单象"为错题), 改为执黑守和定式
const EG_META = {
  240: {
    name: '炮双仕难胜单象', type: 'draw', humanSide: 'b', drawMoves: 80,
    hint: '单象游走另一侧、勿塞炮架；炮无过河仕架，炮双仕难破单象，正和之形。'
  }
};

// 引擎层错题手工修补(静态合法但初始困毙/将军等)
const PATCH = {
  // 炮锁中军: 原车已在 y1 封死黑方全部着法(初始即困毙), 车退一步至 y2, 首着车九进一封锁成杀
  28: { fen: '3aka3/9/R8/9/4C4/9/9/9/9/4K4 r', line: '车九进一 #', hint: '车九进一 —— 车沉下二路封锁，黑将士无子可动，困毙成杀。' }
};

// ---------- 静态合法性 ----------
function parseBoard(fen) {
  const rows = fen.trim().split(/\s+/)[0].split('/');
  const b = Array.from({ length: 10 }, () => Array(9).fill(null));
  const widths = [];
  rows.forEach((row, y) => {
    let x = 0;
    for (const ch of row) { if (/\d/.test(ch)) { x += +ch; continue; } b[y][x] = ch; x++; }
    widths.push(x);
  });
  return { b, widths };
}
const PSET = a => new Set(a.map(([x, y]) => x + ',' + y));
const SITES = {
  K: { r: PSET([[3,9],[4,9],[5,9],[3,8],[4,8],[5,8],[3,7],[4,7],[5,7]]), b: PSET([[3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]]) },
  A: { r: PSET([[3,9],[5,9],[4,8],[3,7],[5,7]]), b: PSET([[3,0],[5,0],[4,1],[3,2],[5,2]]) },
  B: { r: PSET([[2,9],[6,9],[0,7],[4,7],[8,7],[2,5],[6,5]]), b: PSET([[2,0],[6,0],[0,2],[4,2],[8,2],[2,4],[6,4]]) }
};
const EVENS = new Set([0, 2, 4, 6, 8]);
const CAP = { K: 1, A: 2, B: 2, N: 2, R: 2, C: 2, P: 5 };
const isR = ch => ch === ch.toUpperCase();
function staticAudit(fen) {
  const errs = [];
  const { b, widths } = parseBoard(fen);
  widths.forEach((w, y) => { if (w !== 9) errs.push(`y${y} 行宽=${w}`); });
  const cnt = { r: {}, b: {} };
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const ch = b[y][x]; if (!ch) continue;
    const t = ch.toUpperCase(), c = isR(ch) ? 'r' : 'b';
    cnt[c][t] = (cnt[c][t] || 0) + 1;
    let ok = true;
    if (t === 'K' || t === 'A' || t === 'B') ok = SITES[t][c].has(x + ',' + y);
    else if (t === 'P') ok = c === 'r' ? (y <= 6 && (y <= 4 || EVENS.has(x))) : (y >= 3 && (y >= 5 || EVENS.has(x)));
    if (!ok) errs.push(`${c === 'r' ? '红' : '黑'}${t}非法位@${x},${y}`);
  }
  for (const c of ['r', 'b']) for (const t in CAP) if ((cnt[c][t] || 0) > CAP[t]) errs.push(`${c === 'r' ? '红' : '黑'}方${t}数量=${cnt[c][t]}>${CAP[t]}`);
  return errs;
}
function engineAudit(fen) {
  const errs = [];
  let s;
  try { s = E.createState({ fen }); } catch (e) { return ['createState: ' + e.message]; }
  if (!E.findKing(s, 'r') || !E.findKing(s, 'b')) errs.push('缺王');
  if (s.turn !== 'r') errs.push('非红先');
  if (E.isInCheck(s, 'b')) errs.push('初始黑被将');
  if (E.isInCheck(s, 'r')) errs.push('初始红被将');
  if (!E.legalMoves(s, 'r').length) errs.push('红无着法');
  if (!E.legalMoves(s, 'b').length) errs.push('黑无着法');
  return errs;
}
function lineCheck(fen, line) {
  const s = E.createState({ fen });
  const texts = line.replace(/\s*#\s*$/, '').split(/\s+/).filter(Boolean);
  const r = playLine(s, texts);
  if (!r.ok) return '主变第' + (r.errorIndex + 1) + '着非法: ' + (r.error || '');
  if (s.status !== 'redwin') return '主变终局=' + s.status;
  return null;
}
function sigPair(fen) {
  const s = E.createState({ fen });
  const cells = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) { const c = s.board[y][x]; if (c) cells.push(c.c + c.t + x + ',' + y); }
  cells.sort();
  const mir = cells.map(z => { const [a, b2, rest] = z; const [x, y] = rest.split(',').map(Number); return a + b2 + (8 - x) + ',' + y; }).sort();
  return [cells.join('|'), mir.join('|')];
}

// ---------- 组装 ----------
const out = [];
const report = { dropped: [], fixed: 0, egFixed: 0, classic: 0 };
for (const p of OLD) {
  if (drops.has(p.id)) { report.dropped.push({ id: p.id, name: p.name, why: '无法合法化修复' }); continue; }
  if (EG_DROP_NAMES.has(p.name)) { report.dropped.push({ id: p.id, name: p.name, why: '强AI复核+棋理确证错误' }); continue; }
  const q = { ...p };
  if (EG_CONVERT[p.name]) {
    const cv = EG_CONVERT[p.name];
    q.name = cv.name; q.type = cv.type; q.hint = cv.hint; q.chapter = 'endgame';
    if (cv.humanSide === null) delete q.humanSide;
    report.converted = (report.converted || 0) + 1;
  }
  const fm = fixedMate.find(f => f.id === p.id);
  if (fm) { q.fen = fm.fen; q.mate = fm.mate; q.line = fm.line; q.chapter = fm.chapter; q.hint = fm.hint; report.fixed++; }
  if (EG_FIX[p.id]) { q.fen = EG_FIX[p.id]; report.egFixed++; }
  if (EG_META[p.id]) Object.assign(q, EG_META[p.id]);
  if (PATCH[p.id]) Object.assign(q, PATCH[p.id]);
  if (RECUT[q.fen]) Object.assign(q, RECUT[q.fen]);
  out.push(q);
}
for (const c of classic) out.push({ id: null, name: c.name, chapter: 'classic', mate: c.mate, fen: c.fen, hint: c.hint, line: c.line });
report.classic = classic.length;
// 新增经典实用定式(经最新强AI多seed对弈验证胜/和规律)
const eg2 = fs.existsSync(ROOT + '/generated/shard-endgame2.json')
  ? JSON.parse(fs.readFileSync(ROOT + '/generated/shard-endgame2.json', 'utf8')) : [];
for (const e of eg2) out.push({
  id: null, name: e.name, chapter: 'endgame', type: e.type,
  humanSide: e.humanSide, drawMoves: e.drawMoves || 80, fen: e.fen, hint: e.hint
});
report.eg2 = eg2.length;

// ---------- 全量校验 ----------
const errs = [];
const seen = new Map();
for (const p of out) {
  const tag = p.name + '(' + p.fen.slice(0, 12) + ')';
  const se = staticAudit(p.fen);
  if (se.length) errs.push(tag + ' 静态: ' + se.join('; '));
  const ee = engineAudit(p.fen);
  if (ee.length) errs.push(tag + ' 引擎: ' + ee.join('; '));
  if (p.line) { const le = lineCheck(p.fen, p.line); if (le) errs.push(tag + ' ' + le); }
  const [sg, mg] = sigPair(p.fen);
  for (const k of [sg, mg]) if (seen.has(k)) errs.push(tag + ' 与「' + seen.get(k) + '」镜像/同形重复');
  seen.set(sg, p.name);
}
if (errs.length) {
  console.log('❌ 校验失败 ' + errs.length + ' 项:');
  errs.slice(0, 60).forEach(e => console.log(' -', e));
  process.exit(1);
}

// ---------- 排序编号 ----------
const order = { mate1: 0, mate2: 1, mate3: 2, mate4: 3, mate5p: 4, classic: 5, endgame: 6 };
const tier = p => p.chapter === 'endgame' ? 6 : order[p.chapter];
out.sort((a, b) => {
  const ta = tier(a), tb = tier(b);
  if (ta !== tb) return ta - tb;
  if (a.chapter === 'endgame') { if (a.type !== b.type) return a.type === 'win' ? -1 : 1; return a.name.localeCompare(b.name, 'zh'); }
  if (a.chapter === 'classic' && a.mate !== b.mate) return a.mate - b.mate;
  if (a.mate !== b.mate) return a.mate - b.mate;
  return a.name.localeCompare(b.name, 'zh');
});
const final = [];
out.forEach((p, i) => {
  const q = { id: i + 1, name: p.name };
  if (p.chapter === 'endgame') { q.chapter = 'endgame'; q.type = p.type; if (p.humanSide) q.humanSide = p.humanSide; q.drawMoves = p.drawMoves || 80; }
  else { q.chapter = p.chapter; q.mate = p.mate; }
  q.fen = p.fen; q.hint = p.hint;
  if (p.line) q.line = p.line;
  final.push(q);
});

// ---------- 序列化 ----------
function ser(p) {
  const numKeys = new Set(['id', 'mate', 'drawMoves']);
  const keys = ['id', 'name', 'chapter', 'mate', 'type', 'humanSide', 'drawMoves', 'fen', 'hint', 'line'];
  const parts = keys.filter(k => p[k] !== undefined).map(k => numKeys.has(k) ? (k + ': ' + p[k]) : (k + ": '" + String(p[k]).replace(/'/g, "\\'") + "'"));
  return '  {\n    ' + parts.join(', ') + '\n  }';
}
const header = `// 残局闯关关卡(红先; 杀局经强制杀求解器穷举验证最短步数, 实用定式经大师级AI双/三seed对弈验证)
// 章节: mate1一步杀 mate2两步杀 mate3三步杀 mate4四步杀 mate5p五至七步杀 classic古谱名局(三至五步); endgame+type=win例胜/draw守和(执黑)
// fen 为局面; mate=红方连走步数; line=参考主变(黑方最顽强应着), 以 # 结束; drawMoves=守和所需回合
export const PUZZLES = [
`;
fs.writeFileSync(ROOT + '/js/puzzles.js', header + final.map(ser).join(',\n') + '\n];\n');

const cnt = {};
for (const p of final) { const k = p.chapter === 'endgame' ? 'endgame-' + p.type : p.chapter; cnt[k] = (cnt[k] || 0) + 1; }
console.log('✅ 重建完成, 总关数', final.length);
console.log('mate 修复', report.fixed, '| 剔除', report.dropped.length, '| 定式修正', report.egFixed, '| 古谱新增', report.classic);
console.log('分布', JSON.stringify(cnt));
report.dropped.forEach(d => console.log(' 剔除 #' + d.id, d.name));
