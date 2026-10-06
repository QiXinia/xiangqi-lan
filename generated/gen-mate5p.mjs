// mate5p 分片生成器: 红方 5/6/7 步连将杀 (每手红着必须将军)
// 蓝本 test/gen-advanced.mjs; node generated/gen-mate5p.mjs
// 使用修正版引擎 generated/engine-fixed.mjs (马腿表已修), 记谱 notation-fixed.mjs.
// 质量门: createState 双方不被将/将帅不照面; findCheck 最短恰为 mate;
//         findAll 对所有 z<mate 无更短任意杀(缓杀/控杀); 最顽强应将主变 playLine 终局 redwin.
import * as E from './engine-fixed.mjs';
import { playLine } from './notation-fixed.mjs';
import { PUZZLES } from '../js/puzzles.js';
import fs from 'node:fs';
import path from 'node:path';

const OUT = new URL('../generated/shard-mate5p.json', import.meta.url).pathname;

// ---------- 就地走子/撤销 (切换 turn, 供搜索) ----------
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

// ---------- 节点预算 (三态: 找到杀着=move对象; 证明无='NO'; 耗尽='UNK') ----------
let NODES = 0, EXHAUST = false;
function budgetSet(n) { NODES = n; EXHAUST = false; }

function bkpos(s) { return E.findKing(s, 'b'); }

// 红着排序: 将军 > 吃子 > 逼近九宫
function redScore(s, m) {
  const u = lmake(s, m);
  let sc = 0;
  if (E.isInCheck(s, 'b')) sc += 1000;
  const cap = s.board[m.to[1]][m.to[0]];
  if (cap) sc += 200;
  lundo(s, u);
  const kp = bkpos(s);
  sc -= (Math.abs(m.to[0] - kp[0]) + Math.abs(m.to[1] - kp[1])) * 3;
  return sc;
}
function orderRed(s, moves) { return moves.slice().sort((a, b) => redScore(s, b) - redScore(s, a)); }

// 连将杀: 红方每手必须将军. 返回 move | 'NO'(证明无) | 'UNK'(预算耗尽)
function findCheck(s, n) {
  if (EXHAUST) return 'UNK';
  if (NODES-- <= 0) { EXHAUST = true; return 'UNK'; }
  const cands = [];
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    const chk = E.isInCheck(s, 'b');
    lundo(s, u);
    if (chk) cands.push(m);
  }
  cands.sort((a, b) => redScore(s, b) - redScore(s, a));
  for (const m of cands) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let res;
    if (bs.length === 0) res = 'MATE';
    else if (n > 1) {
      res = 'MATE';
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = findCheck(s, n - 1);
        lundo(s, u2);
        if (r === 'NO') { res = 'NO'; break; }
        if (r === 'UNK') { res = 'UNK'; break; }
      }
    } else res = 'NO';
    lundo(s, u);
    if (res === 'MATE') return m;
    if (res === 'UNK') return 'UNK';
  }
  return 'NO';
}

// 任意强制杀(允许缓手): 所有红着. 返回 move | 'NO' | 'UNK'
function findAll(s, n) {
  if (EXHAUST) return 'UNK';
  if (NODES-- <= 0) { EXHAUST = true; return 'UNK'; }
  const moves = orderRed(s, E.legalMoves(s, 'r'));
  for (const m of moves) {
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let res;
    if (bs.length === 0) res = 'MATE';
    else if (n > 1) {
      res = 'MATE';
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = findAll(s, n - 1);
        lundo(s, u2);
        if (r === 'NO') { res = 'NO'; break; }
        if (r === 'UNK') { res = 'UNK'; break; }
      }
    } else res = 'NO';
    lundo(s, u);
    if (res === 'MATE') return m;
    if (res === 'UNK') return 'UNK';
  }
  return 'NO';
}

// 证明: 不存在以"非将军首着"开始的 z 步任意杀 (首着将军者已由 findCheck 覆盖)
// 返回 'NO'(证明无更短) | 'UNK'(耗尽) | 'MATE'(发现更短缓杀)
function noShorterNonCheck(s, z) {
  const moves = orderRed(s, E.legalMoves(s, 'r'));
  for (const m of moves) {
    const u = lmake(s, m);
    if (E.isInCheck(s, 'b')) { lundo(s, u); continue; } // 将军首着 -> findCheck 已证
    const bs = E.legalMoves(s, 'b');
    let res;
    if (bs.length === 0) res = 'MATE';
    else if (z > 1) {
      res = 'MATE';
      for (const bm of bs) {
        const u2 = lmake(s, bm);
        const r = findAll(s, z - 1);
        lundo(s, u2);
        if (r === 'NO') { res = 'NO'; break; }
        if (r === 'UNK') { res = 'UNK'; break; }
      }
    } else res = 'NO';
    lundo(s, u);
    if (res === 'MATE') return 'MATE';
    if (res === 'UNK') return 'UNK';
  }
  return 'NO';
}

// 最顽强应将主变 (lineCheck 蓝本): 黑方选剩余连将距离最长的应着
function lineCheck(fen, n) {
  const s = E.createState({ fen });
  const out = []; let cur = n, guard = 0;
  while (cur > 0 && guard++ < 40) {
    budgetSet(3000000);
    const r = findCheck(s, cur);
    if (r === 'NO' || r === 'UNK') return out.join(' ');
    out.push(E.moveNotation(s, r.from, r.to));
    lmake(s, r);
    const bs = E.legalMoves(s, 'b');
    if (!bs.length) { out.push('#'); break; }
    let best = null, bestN = -1;
    for (const bm of bs) {
      const u2 = lmake(s, bm);
      let k = 0;
      for (let z = 1; z <= cur; z++) {
        budgetSet(1500000);
        const rr = findCheck(s, z);
        if (rr === 'UNK') { k = -1; break; }
        if (rr !== 'NO') { k = z; break; }
      }
      lundo(s, u2);
      if (k <= 0) { best = null; break; }
      if (k > bestN) { bestN = k; best = bm; }
    }
    if (!best) return out.join(' ');
    out.push(E.moveNotation(s, best.from, best.to));
    lmake(s, best);
    cur--;
  }
  return out.join(' ');
}

// ---------- 局面采样 ----------
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const SHI_POS = [[3, 0], [5, 0], [4, 1], [3, 2], [5, 2]];
const XIANG_POS = [[2, 0], [6, 0], [0, 2], [4, 2], [8, 2], [2, 4], [6, 4]];
const GUARD_CELLS = [...SHI_POS.map(p => ['a', ...p]), ...XIANG_POS.map(p => ['b', ...p])];

function sampleGuards(rng) {
  const pool = GUARD_CELLS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const n = 1 + Math.floor(rng() * 5); // 1..5 防守子, 提升防守韧性以支撑长杀
  return pool.slice(0, n).map(([t, x, y]) => [t, x, y]);
}
// 加权: 攻子偏向黑九宫附近, 提高连续将军密度
const WY_RAIL = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4];   // 车/炮可沉底
const WY_HORSE = [1, 1, 2, 2, 3, 3, 4];           // 马/兵
const WX = [1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8]; // 略偏中路
function sampleReds(combo, rng, occ) {
  const reds = []; const used = new Set(occ);
  for (const t of combo) {
    const wys = (t === 'P' || t === 'N') ? WY_HORSE : WY_RAIL;
    let tries = 0, x, y, key;
    do { x = WX[Math.floor(rng() * WX.length)]; y = wys[Math.floor(rng() * wys.length)]; key = x + ',' + y; tries++; } while (used.has(key) && tries < 200);
    if (used.has(key)) return null;
    used.add(key); reds.push([t, x, y]);
  }
  return reds;
}
function makeFen(guards, reds) {
  const g = Array.from({ length: 10 }, () => Array(9).fill(''));
  g[0][4] = 'k';
  for (const [t, x, y] of guards) g[y][x] = t;
  for (const [t, x, y] of reds) g[y][x] = t;
  g[9][3] = 'K';
  return g.map(row => { let o = '', e = 0; for (const c of row) { if (!c) { e++; continue; } if (e) { o += e; e = 0; } o += c; } if (e) o += e; return o; }).join('/') + ' r';
}

// 多样性: 不同子力组合
const combos = [
  ['R', 'N', 'C'],       // 车马炮联攻
  ['R', 'R', 'N'],       // 双车马
  ['R', 'C', 'C'],       // 车双炮
  ['N', 'C', 'P', 'P'],  // 马炮双兵
  ['N', 'N', 'R'],       // 双马盘宫+车
  ['R', 'P', 'P'],       // 车兵追殿
  ['R', 'R', 'C'],       // 双车炮
  ['N', 'N', 'C'],       // 双马炮
  ['R', 'N', 'N'],       // 车马双马
  ['R', 'C', 'P'],       // 车炮兵
  ['N', 'C', 'C'],       // 马双炮
  ['R', 'N', 'P', 'P'],  // 车马双兵
  ['C', 'C', 'R', 'N'],  // 车双炮马
  ['R', 'R', 'P'],       // 双车兵
];

// 通用杀形名 (按组合, 可加序号)
const SHAPE_BASE = {
  'RNC': ['车马联攻', '车马闹宫', '车马冷将'],
  'RRN': ['双车牧马', '双车迫宫'],
  'RCC': ['车炮叠杀', '炮辗丹沙'],
  'NCPP': ['马炮双兵', '炮兵催宫'],
  'NNR': ['双马盘宫', '双马盘绕'],
  'RPP': ['车兵追殿', '老兵擒王'],
  'RRC': ['双车炮杀', '车炮借势'],
  'NNC': ['双马炮杀', '马炮盘旋'],
  'RNN': ['车马双马', '三骑闹宫'],
  'RCP': ['车炮兵错', '炮兵借车'],
  'NCC': ['马双炮杀', '炮马盘旋'],
  'RNPP': ['车马双兵', '车马兵逼宫'],
  'CCRN': ['车双炮马', '四子联攻'],
  'RRP': ['双车兵杀', '双车兵错'],
};
const nameCount = {};
function shapeName(comboKey) {
  const bases = SHAPE_BASE[comboKey] || ['连将杀'];
  const base = bases[Object.keys(nameCount).length % bases.length];
  nameCount[base] = (nameCount[base] || 0) + 1;
  return nameCount[base] > 1 ? base + '·' + nameCount[base] : base;
}

// 棋子位置签名 (去重)
function signature(fen) {
  const rows = fen.split(' ')[0].split('/');
  const pieces = [];
  for (let y = 0; y < rows.length; y++) {
    let x = 0;
    for (const ch of rows[y]) {
      if (/\d/.test(ch)) { x += +ch; continue; }
      pieces.push(ch + '@' + x + ',' + y); x++;
    }
  }
  pieces.sort(); return pieces.join('|');
}

// ---------- 预算常量 ----------
const B_COARSE = 1500000;     // 粗筛 findCheck(s,7) 探测
const B_SHORT = 4000000;     // 严格 findCheck 最短性
const B_FINDALL = 20000000;  // 严格 findAll 无更短缓杀
const budgetUsedLog = [];

const quota = { 5: 8, 6: 5, 7: 2 };
const got = { 5: 0, 6: 0, 7: 0 };
const found = [];
const seen = new Set();
for (const p of PUZZLES) seen.add(signature(p.fen));
// 断点续跑: 载入已有分片
if (fs.existsSync(OUT)) {
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    for (const p of prev) {
      found.push(p);
      got[p.mate] = (got[p.mate] || 0) + 1;
      seen.add(signature(p.fen));
      nameCount[p.name.replace(/·\d+$/, '')] = (nameCount[p.name.replace(/·\d+$/, '')] || 0) + 1;
    }
    console.error('resume: loaded', found.length, 'prev puzzles; got=', JSON.stringify(got));
  } catch (e) { console.error('resume load failed', e.message); }
}

let samples = 0, rejected = { short: 0, no: 0, unk: 0, dup: 0, linebad: 0 };

function tryAccept(fen, comboKey, comboLabel) {
  // 门1: 双方不被将, 将帅不照面 (isInCheck false 即含照面)
  const st = E.createState({ fen });
  if (E.isInCheck(st, 'b') || E.isInCheck(st, 'r')) return 'rej';

  // 粗筛: 7 步内是否存在连将杀 (不苛求最短, 最短性交给严格阶段)
  budgetSet(B_COARSE);
  const probe = findCheck(E.createState({ fen }), 7);
  if (probe === 'NO' || probe === 'UNK') { rejected.no++; return 'rej'; }

  // 严格确定最短连将 m = 1..7
  let m = 0;
  for (let n = 1; n <= 7; n++) {
    budgetSet(B_SHORT);
    const r = findCheck(E.createState({ fen }), n);
    if (r === 'UNK') { rejected.unk++; return 'rej'; }
    if (r !== 'NO') { m = n; break; }
  }
  if (m < 5 || m > 7) { rejected.short++; return 'rej'; }
  if (got[m] >= quota[m]) return 'rej';

  // 门2 已由上面最短扫描保证: n<m 全部 'NO'
  budgetSet(B_SHORT);
  const mateMove = findCheck(E.createState({ fen }), m);
  if (mateMove === 'NO' || mateMove === 'UNK') { rejected.no++; return 'rej'; }

  // 门3: findAll 对所有 z<m 无更短任意杀 (首着非将军者; 将军者门2已证)
  for (let z = 1; z < m; z++) {
    budgetSet(B_FINDALL);
    const r = noShorterNonCheck(E.createState({ fen }), z);
    budgetUsedLog.push({ m, z, budget: B_FINDALL, result: r });
    if (r === 'UNK') { rejected.unk++; return 'rej'; }   // 无法确定 -> 丢弃
    if (r === 'MATE') { rejected.short++; return 'rej'; } // 存在更短缓杀
  }

  // 主变
  const ln = lineCheck(fen, m);
  if (!ln.endsWith('#')) { rejected.linebad++; return 'rej'; }

  // 门5: playLine 全 ok, 终局 redwin, 每红着后黑被将
  const toks = ln.slice(0, -1).trim().split(/\s+/).filter(Boolean);
  if (toks.length !== 2 * m - 1) { rejected.linebad++; return 'rej'; }
  const v = E.createState({ fen });
  const pl = playLine(v, toks);
  if (!pl.ok || v.status !== 'redwin') { rejected.linebad++; return 'rej'; }
  // 每红着(偶数步)走完, 黑必须被将军
  const chkState = E.createState({ fen });
  let recheck = true;
  for (let i = 0; i < toks.length; i++) {
    const mv = pl.moves[i];
    E.applyMove(chkState, mv.from, mv.to);
    if (i % 2 === 0 && !E.isInCheck(chkState, 'b')) { recheck = false; break; }
  }
  if (!recheck) { rejected.linebad++; return 'rej'; }

  // 门6: 去重
  const sig = signature(fen);
  if (seen.has(sig)) { rejected.dup++; return 'rej'; }

  const name = shapeName(comboKey);
  const firstRed = toks[0];
  const hint = `步步连将：${firstRed} 发起，借${comboLabel}换位抽选，黑方最顽强应将下 ${m} 步成杀。`;
  seen.add(sig);
  return { chapter: 'mate5p', name, mate: m, fen, hint, line: ln };
}

// ---------- 主采样循环 ----------
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS || 400000);
const wantTotal = quota[5] + quota[6] + quota[7];
outer:
for (let round = 0; round < MAX_ROUNDS && (got[5] + got[6] + got[7]) < wantTotal; round++) {
  samples++;
  const combo = combos[round % combos.length];
  const comboKey = combo.join('');
  const rng = mulberry(round * 7919 + 13);
  for (let attempt = 0; attempt < 80; attempt++) {
    const guards = sampleGuards(rng);
    const occ = new Set(['4,0', '3,9']);
    for (const [, x, y] of guards) occ.add(x + ',' + y);
    const reds = sampleReds(combo, rng, occ);
    if (!reds) continue;
    const fen = makeFen(guards, reds);
    let st; try { st = E.createState({ fen }); } catch { continue; }
    if (E.isInCheck(st, 'b') || E.isInCheck(st, 'r')) continue;

    const acc = tryAccept(fen, comboKey, combo.join(''));
    if (acc === 'rej') continue;
    found.push(acc);
    got[acc.mate]++;
    fs.writeFileSync(OUT, JSON.stringify(found, null, 1));
    console.error(`[${found.length}/${wantTotal}] mate=${acc.mate} ${acc.name} :: ${acc.line}`);
    continue outer;
  }
}

// ---------- 落盘后自验: 读回 JSON 重跑关键门 ----------
console.error('\n=== 自验: 读回 ' + OUT + ' ===');
const raw = fs.readFileSync(OUT, 'utf8');
const arr = JSON.parse(raw);
let selfOk = true;
const counts = { 5: 0, 6: 0, 7: 0 };
for (const p of arr) {
  counts[p.mate] = (counts[p.mate] || 0) + 1;
  const s = E.createState({ fen: p.fen });
  // 门1
  const g1 = !E.isInCheck(s, 'b') && !E.isInCheck(s, 'r');
  // 最短连将
  budgetSet(B_SHORT); const rShortest = findCheck(E.createState({ fen: p.fen }), p.mate);
  let shorter = false;
  for (let n = 1; n < p.mate; n++) { budgetSet(B_SHORT); const r = findCheck(E.createState({ fen: p.fen }), n); if (r !== 'NO') { shorter = true; break; } }
  // playLine + 连将性
  const toks = p.line.slice(0, -1).trim().split(/\s+/).filter(Boolean);
  const vs = E.createState({ fen: p.fen });
  const pl = playLine(vs, toks);
  let chkEvery = true;
  if (pl.ok) {
    const cs = E.createState({ fen: p.fen });
    for (let i = 0; i < toks.length; i++) { E.applyMove(cs, pl.moves[i].from, pl.moves[i].to); if (i % 2 === 0 && !E.isInCheck(cs, 'b')) { chkEvery = false; break; } }
  }
  const ok = g1 && !shorter && rShortest !== 'NO' && rShortest !== 'UNK' && pl.ok && vs.status === 'redwin' && chkEvery && toks.length === 2 * p.mate - 1;
  if (!ok) selfOk = false;
  console.error(`  ${ok ? 'PASS' : 'FAIL'} mate=${p.mate} ${p.name} g1=${g1} noShorter=${!shorter} playLine=${pl.ok}/${vs.status} chkEvery=${chkEvery} nTok=${toks.length}`);
}

console.error('\n=== 报告 ===');
console.error('局数: mate5=' + counts[5] + ' mate6=' + counts[6] + ' mate7=' + counts[7] + ' total=' + arr.length);
console.error('采样数:', samples, ' 拒绝:', JSON.stringify(rejected));
console.error('findAll 无更短缓杀复核预算 B_FINDALL=' + B_FINDALL + ' (每次 noShorterNonCheck; 耗尽即弃局)');
console.error('findAll 复核记录条数:', budgetUsedLog.length);
console.error('自验:', selfOk ? 'ALL PASS' : 'HAS FAIL');
console.log(raw);
