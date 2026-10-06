// mate=4 连将杀分片生成器: node generated/gen-mate4.mjs
// 以 test/gen-advanced.mjs 为蓝本; 只产"红方每手必将军、黑方全程应将"的四步连将杀。
import * as E from './engine-fixed.mjs';
import { parseMove } from './notation-fixed.mjs';
import { PUZZLES } from '../js/puzzles.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'shard-mate4.json');

// ---------- 轻量走子/撤销(搜索热路径, 与 gen-advanced 一致) ----------
function lmake(s, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty };
}
function lundo(s, u) {
  s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap;
  s.turn = s.turn === 'r' ? 'b' : 'r';
}
let BUDGET = 0;
// 连将杀: 红方每手必须将军; n=剩余红着数。返回第一步红着或 null。
function findCheck(s, n) {
  if (BUDGET-- <= 0) return null;
  const cands = [];
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    const chk = E.isInCheck(s, 'b');
    lundo(s, u);
    if (chk) cands.push(m);
  }
  for (const m of cands) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) {
      good = true;
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = findCheck(s, n - 1);
        lundo(s, u2);
        if (!r) { good = false; break; }
      }
    }
    lundo(s, u);
    if (good) return m;
  }
  return null;
}
// 任意强制杀(允许缓手/控杀): 红方任意合法着。返回第一步红着或 null。
function findAll(s, n) {
  if (BUDGET-- <= 0) return null;
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) {
      good = true;
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = findAll(s, n - 1);
        lundo(s, u2);
        if (!r) { good = false; break; }
      }
    }
    lundo(s, u);
    if (good) return m;
  }
  return null;
}

// ---------- 随机数 / FEN 构造 ----------
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeFen(guards, reds, king = [4, 0], rk = [3, 9]) {
  const g = Array.from({ length: 10 }, () => Array(9).fill(''));
  g[king[1]][king[0]] = 'k';
  for (const [t, x, y] of guards) g[y][x] = t;
  for (const [t, x, y] of reds) g[y][x] = t;
  g[rk[1]][rk[0]] = 'K';
  return g.map(row => { let o = '', e = 0; for (const c of row) { if (!c) { e++; continue; } if (e) { o += e; e = 0; } o += c; } if (e) o += e; return o; }).join('/') + ' r';
}

// 黑方守卫: 士(a)/象(b) 不同组合与缺士/缺象情形 (0~4 个防守子)
const guardSets = [
  { g: [], n: 0 },
  { g: [['a', 3, 0]], n: 1 },
  { g: [['b', 2, 0]], n: 1 },
  { g: [['a', 3, 0], ['a', 5, 0]], n: 2 },
  { g: [['b', 2, 0], ['b', 6, 0]], n: 2 },
  { g: [['a', 3, 0], ['b', 2, 0]], n: 2 },
  { g: [['a', 4, 1], ['b', 2, 0], ['b', 6, 0]], n: 3 },
  { g: [['a', 3, 0], ['a', 5, 0], ['b', 2, 0]], n: 3 },   // 缺象
  { g: [['a', 3, 0], ['b', 2, 0], ['b', 6, 0]], n: 3 },   // 缺士
  { g: [['a', 3, 0], ['a', 5, 0], ['b', 2, 0], ['b', 6, 0]], n: 4 }, // 士象全
  { g: [['a', 3, 2], ['a', 5, 2], ['b', 4, 2]], n: 3 },    // 高位士象
];
// 红方攻子: 车R 马N 炮C 兵P, 2~4 子 + 帅
const combos = [
  ['R', 'R'], ['R', 'N'], ['R', 'C'], ['N', 'C'], ['C', 'P'], ['N', 'N'],
  ['R', 'R', 'C'], ['R', 'N', 'C'], ['R', 'C', 'C'], ['N', 'N', 'C'],
  ['R', 'R', 'N'], ['N', 'C', 'P'], ['R', 'C', 'P'], ['C', 'C', 'N'],
  ['R', 'N', 'N'], ['R', 'R', 'C', 'P'], ['R', 'N', 'C', 'P'], ['N', 'N', 'C', 'P'],
];
// 通用杀形名(禁伪托古谱): 按红攻子组合归类
const COMBO_NAMES = {
  'RR': '双车错', 'CR': '车炮连将', 'NR': '车马冷着', 'NN': '双马盘宫',
  'CN': '马炮连将', 'CP': '炮兵追殿', 'CCP': '双炮追王',
  'CRR': '双车炮穿心', 'CNR': '车马炮联攻', 'CCR': '车双炮抽杀',
  'CNN': '双马炮协同', 'NRR': '双车马胁士', 'CNP': '马炮兵追王',
  'CPR': '车炮兵催杀', 'CCN': '双炮马联动', 'NNR': '双马奔槽',
  'CPRR': '双车炮破心', 'CNPR': '车马兵炮闹宫', 'CNNP': '双马炮兵盘宫',
};
const occOf = (guards, rk) => { const s = new Set(['4,0', rk[0] + ',' + rk[1]]); for (const [, x, y] of guards) s.add(x + ',' + y); return s; };
function samplePositions(combo, rng, occ) {
  // 攻子贴近黑方九宫以提高成杀率: 车炮可到底线 y=0; 马兵 y>=1
  const ys = (t) => (t === 'P') ? [1, 2, 3] : (t === 'N') ? [1, 2, 3, 4] : [0, 1, 2, 3, 4];
  const reds = []; const used = new Set(occ);
  for (const t of combo) {
    let tries = 0, x, y, key;
    do { const arr = ys(t); y = arr[Math.floor(rng() * arr.length)]; x = Math.floor(rng() * 9); key = x + ',' + y; tries++; } while (used.has(key) && tries < 120);
    if (used.has(key)) return null;
    used.add(key); reds.push([t, x, y]);
  }
  return reds;
}

// ---------- 局面签名(棋子字母+坐标, 排序) ----------
function fenSignature(fen) {
  const rows = fen.trim().split(/\s+/)[0].split('/');
  const pieces = [];
  for (let y = 0; y < rows.length; y++) {
    let x = 0;
    for (const ch of rows[y]) {
      if (/\d/.test(ch)) { x += +ch; continue; }
      pieces.push(ch + '@' + x + ',' + y); x++;
    }
  }
  pieces.sort(); return pieces.join(';');
}
const seenPuzzle = new Set();
for (const p of PUZZLES) { if (p.fen) seenPuzzle.add(fenSignature(p.fen)); }

// ---------- 质量门 ----------
function gate1(fen) {
  let s; try { s = E.createState({ fen }); } catch { return null; }
  if (E.isInCheck(s, 'r') || E.isInCheck(s, 'b')) return null;
  // 将帅不照面已含于 isInCheck('r') 的直线扫描(王照面即视为攻击)
  return s;
}
// 返回 {n} 表示 findCheck 最短连将杀恰为 4, 且无更短任意杀
function gates(fen, deadline) {
  if (!gate1(fen)) return null;
  // 门2: 连将杀最短恰为 4
  for (const n of [1, 2, 3]) {
    if (Date.now() > deadline) return null;
    BUDGET = 1500000;
    if (findCheck(E.createState({ fen }), n)) return null;
  }
  BUDGET = 2000000;
  const m4 = findCheck(E.createState({ fen }), 4);
  if (!m4) return null;
  // 门3: 不存在 1~3 步任意强制杀/缓杀
  for (const z of [1, 2, 3]) {
    if (Date.now() > deadline) return null;
    BUDGET = 2000000;
    if (findAll(E.createState({ fen }), z)) return null;
  }
  return { n: 4 };
}

// 生成主变: 红着=连将杀求解器给出的将军着; 黑着=最顽强应将(延迟最久; 可逃则弃)
function genLine(fen, n) {
  const s = E.createState({ fen });
  const toks = [];
  for (let cur = n; cur >= 1; cur--) {
    const r = findCheck(s, cur);
    if (!r) return null;
    toks.push(E.moveNotation(s, r.from, r.to));
    lmake(s, r);
    if (!E.isInCheck(s, 'b')) return null;          // 门5: 每红着必将军
    const bs = E.legalMoves(s, 'b');
    if (cur === 1 || bs.length === 0) {
      if (bs.length) return null;                    // 最后一红着后黑仍有棋 -> 非杀
      toks.push('#'); break;
    }
    let best = null, bestK = -1;
    for (const bm of bs) {
      const u2 = lmake(s, bm);
      let k = 0;
      for (let z = 1; z <= 6; z++) { BUDGET = 200000; if (findCheck(s, z)) { k = z; break; } }
      lundo(s, u2);
      if (k === 0) return null;                     // 黑可逃脱 -> 弃
      if (k > bestK) { bestK = k; best = bm; }
    }
    toks.push(E.moveNotation(s, best.from, best.to));
    lmake(s, best);
  }
  return toks.join(' ');
}

// 门5: playLine 全 ok、终局 redwin、每红着走完黑在将军
function verifyLine(fen, line) {
  const texts = line.replace('#', '').trim().split(/\s+/).filter(Boolean);
  const s = E.createState({ fen });
  for (let i = 0; i < texts.length; i++) {
    const mv = parseMove(s, texts[i]);
    if (!mv) return { ok: false, why: '第' + i + '着无法解析: ' + texts[i] };
    E.applyMove(s, mv.from, mv.to);
    if (i % 2 === 0 && !E.isInCheck(s, 'b')) return { ok: false, why: '红着第' + i + '手未将军' };
  }
  if (s.status !== 'redwin') return { ok: false, why: '终局状态=' + s.status };
  return { ok: true };
}

// ---------- 种子加载: 旧分片在 fixed 引擎下重跑严格门, 保留通过者 ----------
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';
const baseOf = (name) => { let b = name; while (b.length && CIRCLED.includes(b[b.length - 1])) b = b.slice(0, -1); return b; };
function redComboKey(fen) {
  const rows = fen.trim().split(/\s+/)[0].split('/');
  const cnt = { R: 0, N: 0, C: 0, P: 0 };
  for (let y = 0; y < rows.length; y++) { let x = 0; for (const ch of rows[y]) { if (/\d/.test(ch)) { x += +ch; continue; } const u = ch.toUpperCase(); if ('RNCP'.includes(u) && ch === u) cnt[u]++; x++; } }
  return Object.entries(cnt).filter(([, v]) => v > 0).map(([k, v]) => k.repeat(v)).sort().join('');
}

const TARGET = 22;                  // 11 种子 + 缓冲补到 ≥20, 取 22
const PER_COMBO = 2;                // 每个红攻子组合至多再补 2 局
const found = [];
const seenShard = new Set();
const nameCount = {};
const comboHits = new Array(combos.length).fill(0);
const start = Date.now();
const HARD_DEADLINE = start + 12 * 60 * 1000;

let oldSeeds = [];
try { oldSeeds = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { oldSeeds = []; }
for (const p of oldSeeds) {
  if (!gate1(p.fen)) continue;
  let ok = true;
  for (const n of [1, 2, 3]) { BUDGET = 1500000; if (findCheck(E.createState({ fen: p.fen }), n)) { ok = false; break; } }
  if (!ok) continue;
  BUDGET = 2000000; if (!findCheck(E.createState({ fen: p.fen }), 4)) continue;
  for (const z of [1, 2, 3]) { BUDGET = 2000000; if (findAll(E.createState({ fen: p.fen }), z)) { ok = false; break; } }
  if (!ok) continue;
  const v = verifyLine(p.fen, p.line); if (!v.ok) continue;
  const sg = fenSignature(p.fen);
  if (seenPuzzle.has(sg) || seenShard.has(sg)) continue;
  seenShard.add(sg);
  const base = baseOf(p.name);
  const suffix = p.name.slice(base.length);
  nameCount[base] = Math.max(nameCount[base] || 0, suffix ? CIRCLED.indexOf(suffix[0]) + 1 : 1);
  const ci = combos.findIndex(c => [...c].sort().join('') === redComboKey(p.fen));
  if (ci >= 0) comboHits[ci]++;
  found.push(p);
  console.error(`seed kept: ${p.name} | ${p.line}`);
}
console.error(`\n种子复核通过 ${found.length}/${oldSeeds.length} 局, 开始补样...\n`);

let round = 0;
while (found.length < TARGET && Date.now() < HARD_DEADLINE) {
  let anyProgress = false;
  for (let ci = 0; ci < combos.length; ci++) {
    if (found.length >= TARGET || Date.now() > HARD_DEADLINE) break;
    if (comboHits[ci] >= PER_COMBO) continue;
    const combo = combos[ci];
    // 按攻子数量配防守子(弱攻子配少守卫, 强攻子可破士象全)
    const pool = guardSets.filter(gs => gs.n <= combo.length);
    for (let attempt = 0; attempt < 600; attempt++) {
      if (found.length >= TARGET || Date.now() > HARD_DEADLINE) break;
      const rng = mulberry((round * combos.length + ci) * 7919 + attempt * 131 + 101);
      const gs = pool[Math.floor(rng() * pool.length)];
      const rk = ((round + ci) % 2 === 0) ? [3, 9] : [5, 9];
      const reds = samplePositions(combo, rng, occOf(gs.g, rk));
      if (!reds) continue;
      const fen = makeFen(gs.g, reds, [4, 0], rk);
      const sig = fenSignature(fen);
      if (seenPuzzle.has(sig) || seenShard.has(sig)) continue;
      const perDeadline = Date.now() + 12000;
      const g = gates(fen, perDeadline);
      if (!g) continue;
      const line = genLine(fen, 4);
      if (!line || !line.endsWith('#')) continue;
      const v = verifyLine(fen, line);
      if (!v.ok) continue;
      seenShard.add(sig);
      comboHits[ci]++; anyProgress = true;
      const key = [...combo].sort().join('');
      const base = COMBO_NAMES[key] || '连将杀形';
      nameCount[base] = (nameCount[base] || 0) + 1;
      const circled = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮'];
      const name = base + (nameCount[base] > 1 ? (circled[nameCount[base]] || nameCount[base]) : '');
      const firstMove = line.split(' ')[0];
      const hint = `四步连将杀(${base})：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着 ${firstMove} 起，红子力协同成杀。`;
      found.push({ chapter: 'mate4', name, mate: 4, fen, hint, line });
      console.error(`got ${found.length}/${TARGET}: ${name} [${combo.join('')}] | ${line}`);
      break; // 该组合本轮回试到一局, 换下一个组合
    }
  }
  round++;
  if (!anyProgress) break; // 所有未达配额的组合在本轮均无产出
}

// ---------- 落盘 ----------
const json = JSON.stringify(found, null, 1);
fs.writeFileSync(OUT, json, 'utf8');
console.error(`\nwritten ${found.length} puzzles -> ${OUT} (${((Date.now() - start) / 1000).toFixed(1)}s)`);

// ---------- 落盘后读回重跑全部质量门 ----------
console.error('\n=== 读回 JSON 自验 ===');
const back = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let fail = 0;
back.forEach((p, i) => {
  const s0 = gate1(p.fen);
  if (!s0) { console.error(`#${i} ${p.name}: 门1失败`); fail++; return; }
  for (const n of [1, 2, 3]) { BUDGET = 1500000; if (findCheck(E.createState({ fen: p.fen }), n)) { console.error(`#${i} ${p.name}: 门2 findCheck(${n})非空`); fail++; break; } }
  if (fail) return;
  BUDGET = 2000000; if (!findCheck(E.createState({ fen: p.fen }), 4)) { console.error(`#${i} ${p.name}: 门2 findCheck(4)无解`); fail++; return; }
  for (const z of [1, 2, 3]) { BUDGET = 2000000; if (findAll(E.createState({ fen: p.fen }), z)) { console.error(`#${i} ${p.name}: 门3 findAll(${z})非空`); fail++; break; } }
  if (fail) return;
  const v = verifyLine(p.fen, p.line);
  if (!v.ok) { console.error(`#${i} ${p.name}: 门5 ${v.why}`); fail++; return; }
  if (p.mate !== 4 || p.chapter !== 'mate4') { console.error(`#${i} ${p.name}: schema异常`); fail++; }
});
console.error(fail === 0 ? `自验通过: ${back.length}/${back.length} 局全部质量门 OK` : `自验失败: ${fail} 局未达标`);

// ---------- 报告 ----------
console.error('\n=== 报告 ===');
console.error('局数:', back.length);
const byShape = {};
for (const p of back) { const sh = p.name.replace(/[①-⑮]/g, ''); byShape[sh] = (byShape[sh] || 0) + 1; }
console.error('杀形清单:', JSON.stringify(byShape, null, 0));
const mats = {};
for (const p of back) {
  const rows = p.fen.split(' ')[0].split('/'); const cnt = { r: {}, b: {} };
  for (let y = 0; y < rows.length; y++) { let x = 0; for (const ch of rows[y]) { if (/\d/.test(ch)) { x += +ch; continue; } const isR = ch === ch.toUpperCase(); const t = ch.toUpperCase(); if (t !== 'K') (isR ? cnt.r : cnt.b)[t] = (isR ? cnt.r : cnt.b)[t] || 0 + 0, (isR ? cnt.r : cnt.b)[t]++; x++; } }
  mats[p.name] = '红' + Object.entries(cnt.r).map(([k, v]) => v + k).join('') + ' 黑' + Object.entries(cnt.b).map(([k, v]) => v + k).join('');
}
console.error('子力清单:'); for (const p of back) console.error('  ', p.name, '::', mats[p.name]);
console.error('未达标项:', fail === 0 ? '无' : fail + ' 局');
process.exit(fail === 0 ? 0 : 1);
