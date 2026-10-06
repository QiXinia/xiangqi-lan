// ============================================================
// 主线统一合并(第二波产关): 把 generated/new 下的杀局(motif-puzzles.mjs)
// 与定式(theorem-endgames.mjs, 须已过 AI 多 seed 复核)独立复校后,
// 追加进 js/puzzles.js(保留旧 399 关逐字不动, 新关 id 从 400 起)。
// 杀局: 确定性穷举重算最短任意强制杀 mate 与黑最顽强主线 line(节点预算, 不靠墙钟);
// 定式: 仅做 FEN 合法性/字段(胜和结论由 AI 复核阶段保证)。
// 去重: 占位签名 + 左右镜像签名, 对旧关与新关统一去重; name 也不得重复。
// 运行: node generated/new/merge-new.mjs            (默认先 dry-run 只报告)
//       APPLY=1 node generated/new/merge-new.mjs     (实际写 js/puzzles.js, 自动备份)
// ============================================================
import * as E from '../../js/engine.js';
import { playLine } from '../../js/notation.js';
import { PUZZLES as OLD } from '../../js/puzzles.js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const APPLY = process.env.APPLY === '1';

// ---------- 轻量 make/unmake(不触发自动终局) ----------
function mk(s, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  const wh = p.hidden, o = p.orig;
  if (wh) { p.hidden = false; p.orig = undefined; }
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty, wh, o };
}
function un(s, u) {
  s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap;
  if (u.wh) { u.p.hidden = true; u.p.orig = u.o; }
  s.turn = s.turn === 'r' ? 'b' : 'r';
}
let NODES = 0; const CAP = 4_000_000; const BUDGET = Symbol('budget');
function findAll(s, n) {
  for (const m of E.legalMoves(s, 'r')) {
    if (++NODES > CAP) throw BUDGET;
    const u = mk(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) {
      good = true;
      for (const bm of bs) {
        const u2 = mk(s, bm);
        const r = findAll(s, n - 1);
        un(s, u2);
        if (!r) { good = false; break; }
      }
    }
    un(s, u);
    if (good) return m;
  }
  return null;
}
function bestline(fen, n) {
  const s = E.createState({ fen }); const out = []; let cur = n, g = 0;
  while (cur > 0 && g++ < 24) {
    let r; NODES = 0; try { r = findAll(s, cur); } catch (e) { if (e !== BUDGET) throw e; r = null; }
    if (!r) return null;
    out.push(E.moveNotation(s, r.from, r.to)); mk(s, r);
    const bs = E.legalMoves(s, 'b');
    if (!bs.length) { out.push('#'); return out.join(' '); }
    let best = null, bn = -1;
    for (const bm of bs) {
      const u2 = mk(s, bm); let k = 0;
      try { for (let z = 1; z <= cur - 1; z++) { NODES = 0; if (findAll(s, z)) { k = z; break; } } } catch (e) { if (e !== BUDGET) throw e; k = k || 0; }
      un(s, u2);
      if (k === 0) { best = bm; break; }
      if (k > bn) { bn = k; best = bm; }
    }
    out.push(E.moveNotation(s, best.from, best.to)); mk(s, best); cur--;
  }
  return null;
}
function solveMate(fen, maxN) {
  for (let n = 1; n <= maxN; n++) {
    NODES = 0; let r = null;
    try { r = findAll(E.createState({ fen }), n); } catch (e) { if (e !== BUDGET) throw e; continue; }
    if (r) { const line = bestline(fen, n); if (line) return { mate: n, line }; }
  }
  return null;
}
function lineVerify(fen, line) {
  const s = E.createState({ fen });
  const texts = line.replace(/\s*#\s*$/, '').split(/\s+/).filter(Boolean);
  const r = playLine(s, texts);
  if (!r.ok) return { ok: false, why: 'line 第' + (r.errorIndex + 1) + '着「' + r.errorText + '」不合法' };
  if (s.status !== 'redwin') return { ok: false, why: 'line 走完 status=' + s.status + '/' + s.reason };
  return { ok: true };
}

// ---------- 去重签名(含左右镜像) ----------
function sigsOf(fen) {
  const s = E.createState({ fen }); const cells = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const c = s.board[y][x]; if (c) cells.push(c.c + c.t + x + ',' + y);
  }
  cells.sort();
  const mir = cells.map(z => { const [a, b, ...rest] = z; const [x, y] = rest.join('').split(',').map(Number); return a + b + (8 - x) + ',' + y; }).sort();
  return [cells.join('|'), mir.join('|')];
}

async function loadFragment(file) {
  const p = path.join(ROOT, 'generated/new', file);
  if (!fs.existsSync(p)) return [];
  const mod = await import(pathToFileURL(p).href + '?t=' + Date.now());
  return mod.NEW_PUZZLES || [];
}

function ser(p) {
  const numKeys = new Set(['id', 'mate', 'drawMoves']);
  const keys = ['id', 'name', 'chapter', 'mate', 'type', 'humanSide', 'drawMoves', 'fen', 'hint', 'line', 'source'];
  const parts = keys.filter(k => p[k] !== undefined).map(k =>
    numKeys.has(k) ? (k + ': ' + p[k]) : (k + ": '" + String(p[k]).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"));
  return '  {\n    ' + parts.join(', ') + '\n  }';
}

const report = { drop: [], dup: [], kept: [] };
const seen = new Map();
for (const p of OLD) { const [sg] = sigsOf(p.fen); seen.set(sg, p.name); }
const nameSeen = new Set(OLD.map(p => p.name));

function accept(p, whyTag) {
  const [sg, mg] = sigsOf(p.fen);
  for (const k of [sg, mg]) if (seen.has(k)) { report.dup.push({ name: p.name, tag: whyTag, with: seen.get(k) }); return false; }
  if (nameSeen.has(p.name)) { report.dup.push({ name: p.name, tag: whyTag, with: '(同名)' }); return false; }
  seen.set(sg, p.name); nameSeen.add(p.name); return true;
}

const motif = await loadFragment('motif-puzzles.mjs');
const theorem = await loadFragment('theorem-endgames.mjs');
const newKept = [];

for (const p of motif) {
  const tag = '杀局';
  let s;
  try { s = E.createState({ fen: p.fen }); }
  catch (e) { report.drop.push({ name: p.name, tag, why: 'FEN 非法: ' + e.message }); continue; }
  if (E.isInCheck(s, 'r') || E.isInCheck(s, 'b')) { report.drop.push({ name: p.name, tag, why: '初始某方被将军' }); continue; }
  if (!E.legalMoves(s, s.turn).length) { report.drop.push({ name: p.name, tag, why: '开局即终局' }); continue; }
  let solved;
  try { solved = solveMate(p.fen, 6); } catch (e) { report.drop.push({ name: p.name, tag, why: '穷举异常: ' + e.message }); continue; }
  if (!solved) { report.drop.push({ name: p.name, tag, why: '6 步内未能确定性证明强制杀(超预算或无杀)' }); continue; }
  const lv = lineVerify(p.fen, solved.line);
  if (!lv.ok) { report.drop.push({ name: p.name, tag, why: lv.why }); continue; }
  const isClassic = p.chapter === 'classic';
  const q = {
    name: String(p.name).trim(),
    chapter: isClassic ? 'classic' : (solved.mate >= 5 ? 'mate5p' : 'mate' + solved.mate),
    mate: solved.mate, fen: p.fen.trim(),
    hint: (p.hint || `${p.name}：红先${solved.line.split(' ')[0]}，${solved.mate}步成杀。`).replace(/\s+/g, ''),
    line: solved.line
  };
  if (isClassic && p.source) q.source = p.source;
  if (!accept(q, tag)) continue;
  report.kept.push(q); newKept.push(q);
}

for (const p of theorem) {
  const tag = '定式';
  let s;
  try { s = E.createState({ fen: p.fen }); }
  catch (e) { report.drop.push({ name: p.name, tag, why: 'FEN 非法: ' + e.message }); continue; }
  if (E.isInCheck(s, 'r') || E.isInCheck(s, 'b')) { report.drop.push({ name: p.name, tag, why: '初始某方被将军' }); continue; }
  if (!E.legalMoves(s, s.turn).length) { report.drop.push({ name: p.name, tag, why: '开局即终局' }); continue; }
  if (p.type !== 'win' && p.type !== 'draw') { report.drop.push({ name: p.name, tag, why: "定式 type 必须 win/draw" }); continue; }
  const q = { name: String(p.name).trim(), chapter: 'endgame', type: p.type, fen: p.fen.trim(), hint: (p.hint || '').replace(/\s+/g, '') };
  if (p.type === 'draw') { q.humanSide = 'b'; q.drawMoves = p.drawMoves || 80; }
  if (!accept(q, tag)) continue;
  report.kept.push(q); newKept.push(q);
}

// 排序新关: 杀局按 mate, classic 置杀局段末; 再 win, 再 draw
const order = { mate1: 0, mate2: 1, mate3: 2, mate4: 3, mate5p: 4 };
newKept.sort((a, b) => {
  const ea = a.chapter === 'endgame' ? (a.type === 'win' ? 6 : 7) : (a.chapter === 'classic' ? 5 : order[a.chapter]);
  const eb = b.chapter === 'endgame' ? (b.type === 'win' ? 6 : 7) : (b.chapter === 'classic' ? 5 : order[b.chapter]);
  if (ea !== eb) return ea - eb;
  if (a.chapter !== 'endgame' && b.chapter !== 'endgame' && a.mate !== b.mate) return a.mate - b.mate;
  return a.name.localeCompare(b.name, 'zh');
});
let nextId = OLD.length + 1;
for (const q of newKept) q.id = nextId++;

const cnt = {};
for (const q of newKept) { const k = q.chapter === 'endgame' ? 'endgame-' + q.type : q.chapter; cnt[k] = (cnt[k] || 0) + 1; }
console.log('=== 合并复校报告 ===');
console.log('新关保留', newKept.length, '丢弃', report.drop.length, '重复', report.dup.length);
console.log('新增分布', JSON.stringify(cnt), '合并后总数', OLD.length + newKept.length);
for (const d of report.drop) console.log('  ✗', d.tag, d.name, '-', d.why);
for (const d of report.dup) console.log('  ≡', d.tag, d.name, '==', d.with);

if (APPLY && newKept.length) {
  const pp = path.join(ROOT, 'js/puzzles.js');
  const backup = path.join(ROOT, 'generated/new/puzzles.orig399.js');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, fs.readFileSync(pp));
  let src = fs.readFileSync(pp, 'utf8');
  if (!/export const PUZZLES = \[/.test(src)) throw new Error('未找到 PUZZLES 数组标记');
  const block = newKept.map(ser).join(',\n');
  // 在最后一个 "\n];" 前注入
  const idx = src.lastIndexOf('\n];');
  if (idx < 0) throw new Error('未找到数组结束 ];');
  src = src.slice(0, idx) + ',\n' + block + '\n' + src.slice(idx + 1);
  fs.writeFileSync(pp, src);
  fs.writeFileSync(path.join(ROOT, 'generated/new/merge-report.json'), JSON.stringify({
    kept: newKept.length, cnt, total: OLD.length + newKept.length, drop: report.drop, dup: report.dup
  }, null, 1));
  console.log('已写入 js/puzzles.js, 备份', backup);
} else if (!APPLY) {
  console.log('(dry-run; 加 APPLY=1 实际写入)');
}
