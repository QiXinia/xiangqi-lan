// mate=3 三步杀残局分片生成器（红攻子 2-4 + 帅，黑防守子 0-5 + 将）
// 用法: node generated/gen-mate3.mjs
// 规则校验使用同目录修正版副本 engine-fixed.mjs / notation-fixed.mjs（马腿表方向已修正）；
// PUZZLES 仍读 ../js/puzzles.js 作去重底表。搜索逻辑参考 test/gen-advanced.mjs 与 test/puzzle-check.js
import * as E from './engine-fixed.mjs';
import { playLine } from './notation-fixed.mjs';
import { PUZZLES } from '../js/puzzles.js';
import { writeFileSync, readFileSync } from 'node:fs';

// ---------- 轻量走子/撤销（与 gen-advanced 一致；本局无暗子） ----------
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

// ---------- 预算化精确强制杀搜索 ----------
// 返回 {status:'mate'|'nomate'|'cutoff', move?}
// 语义：红方是否存在一着，使得无论黑方如何合法应手，红均能在 n 步内将杀。
let nodes = 0, LIMIT = 2_000_000;
const over = () => nodes >= LIMIT;

// 红方候选着法排序：将军 > 吃子 > 逼近黑将 > 其它（仅用于加速找到解，不影响完备性）
function orderMoves(s, moves) {
  const bk = E.findKing(s, 'b');
  const scored = moves.map(m => {
    let score = 0;
    const [fx, fy] = m.from, [tx, ty] = m.to;
    const cap = s.board[ty][tx];
    if (cap && cap.c === 'b') score += 100;
    const u = lmake(s, m);
    if (E.isInCheck(s, 'b')) score += 1000;
    lundo(s, u);
    if (bk) {
      const d0 = Math.abs(fx - bk[0]) + Math.abs(fy - bk[1]);
      const d1 = Math.abs(tx - bk[0]) + Math.abs(ty - bk[1]);
      score += (d0 - d1) * 2;
    }
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(o => o.m);
}

function findAll(s, n) {
  if (over()) return { status: 'cutoff' };
  nodes++;
  const redMoves = orderMoves(s, E.legalMoves(s, 'r'));
  let sawCutoff = false;
  for (const m of redMoves) {
    if (over()) return { status: 'cutoff' };
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let outcome;
    if (bs.length === 0) {
      outcome = 'mate';
    } else if (n === 1) {
      outcome = 'fail'; // 红走完黑仍有棋 -> 一步未杀
    } else {
      outcome = 'mate';
      for (const bm of bs) {
        if (over()) { outcome = 'cutoff'; break; }
        const u2 = lmake(s, bm);
        const r = findAll(s, n - 1);
        lundo(s, u2);
        if (r.status === 'mate') continue;
        if (r.status === 'cutoff') { outcome = 'cutoff'; break; }
        outcome = 'fail'; break; // 黑有应手逃脱 -> 此红着不成立
      }
    }
    lundo(s, u);
    if (outcome === 'mate') return { status: 'mate', move: m };
    if (outcome === 'cutoff') sawCutoff = true;
  }
  return sawCutoff ? { status: 'cutoff' } : { status: 'nomate' };
}

// ---------- 局面构造 ----------
function makeFen(pieces) {
  const g = Array.from({ length: 10 }, () => Array(9).fill(''));
  for (const [t, x, y] of pieces) {
    if (x < 0 || x > 8 || y < 0 || y > 9) return null;
    if (g[y][x]) return null;
    g[y][x] = t;
  }
  return g.map(row => {
    let o = '', e = 0;
    for (const c of row) { if (!c) { e++; continue; } if (e) { o += e; e = 0; } o += c; }
    if (e) o += e;
    return o;
  }).join('/') + ' r';
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 黑方防守子模板（小写字母；将固定单独放）
const GUARD_POOLS = [
  [],
  [['a', 3, 1]],
  [['a', 5, 1]],
  [['a', 4, 1]],
  [['a', 3, 1], ['a', 5, 1]],
  [['a', 3, 1], ['a', 5, 1], ['b', 2, 0]],
  [['a', 3, 1], ['a', 5, 1], ['b', 6, 0]],
  [['a', 3, 1], ['a', 5, 1], ['b', 2, 4]],
  [['b', 2, 0], ['b', 6, 0]],
  [['a', 3, 1], ['a', 5, 1], ['b', 2, 0], ['b', 6, 0]],
  [['n', 2, 1]],
  [['a', 3, 1], ['n', 2, 0]],
  [['a', 5, 1], ['c', 8, 2]],
];

// 杀形 -> 红攻子组合（通用杀形名，可加序号）
const SHAPES = [
  { name: '马后炮',   atk: ['N', 'C'] },
  { name: '铁门栓',   atk: ['R', 'C'] },
  { name: '大胆穿心', atk: ['R', 'R'] },
  { name: '双车错',   atk: ['R', 'R'] },
  { name: '卧槽马',   atk: ['N', 'C'] },
  { name: '挂角马',   atk: ['N', 'R'] },
  { name: '重炮',     atk: ['C', 'C'] },
  { name: '天地炮',   atk: ['C', 'C'] },
  { name: '闷宫',     atk: ['R', 'P'] },
  { name: '钓鱼马',   atk: ['N', 'R'] },
  { name: '立马车',   atk: ['R', 'N'] },
  { name: '海底捞月', atk: ['R', 'C'] },
  { name: '炮辗丹沙', atk: ['C', 'R'] },
  { name: '双马饮泉', atk: ['N', 'N'] },
  { name: '送佛归殿', atk: ['P', 'C'] },
  { name: '多兵联攻', atk: ['P', 'P', 'C'] },
  { name: '车马冷着', atk: ['R', 'N'] },
  { name: '车炮抽杀', atk: ['R', 'C'] },
  { name: '马炮联攻', atk: ['N', 'C'] },
];

const HINTS = {
  '马后炮': '马控将门，炮随马后成杀。',
  '铁门栓': '炮镇中路封门，车兵破栓入宫。',
  '大胆穿心': '车坐大堂破士，直捣花心。',
  '双车错': '双车分占两肋交替错进。',
  '卧槽马': '马卧卧槽控将，炮车跟进成杀。',
  '挂角马': '马挂士角逼将，侧翼续杀。',
  '重炮': '双炮叠线，后炮以前炮为架。',
  '天地炮': '一炮沉底一炮镇中，上下夹攻。',
  '闷宫': '借黑方士象自堵将门，攻其闷杀。',
  '钓鱼马': '马控钓鱼点位，车兵贴身追将。',
  '立马车': '马至车随，车立刻即成杀。',
  '海底捞月': '车占中路，炮沉底借势打车成杀。',
  '炮辗丹沙': '炮借架子来回碾扫，破士象成杀。',
  '双马饮泉': '双马左右盘旋，轮番叫将。',
  '送佛归殿': '炮护中兵直冲，贴脸擒王。',
  '多兵联攻': '多兵协同逼宫，炮为后盾。',
  '车马冷着': '车马呼应，冷不防连将成杀。',
  '车炮抽杀': '车炮联动，抽将破防。',
  '马炮联攻': '马炮配合，一控一杀。',
};

function samplePosition(shape, round, rng) {
  const bk = [4, 0];
  const rkX = [3, 4, 5][Math.floor(rng() * 3)];
  const pieces = [['k', bk[0], bk[1]], ['K', rkX, 9]];
  const guards = GUARD_POOLS[Math.floor(rng() * GUARD_POOLS.length)];
  for (const g of guards) pieces.push(g.slice());
  const used = new Set(pieces.map(p => p[1] + ',' + p[2]));

  const ysFor = (t) => (t === 'P') ? [1, 2, 3, 4] : (t === 'N' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5]);
  for (const t of shape.atk) {
    const ys = ysFor(t);
    let placed = false;
    for (let tries = 0; tries < 120; tries++) {
      const x = Math.floor(rng() * 9);
      const y = ys[Math.floor(rng() * ys.length)];
      const key = x + ',' + y;
      if (used.has(key)) continue;
      used.add(key); pieces.push([t, x, y]); placed = true; break;
    }
    if (!placed) return null;
  }
  return makeFen(pieces);
}

// ---------- 去重签名：棋子字母(带大小写)+坐标排序列表 ----------
function signatureOfFen(fen) {
  const s = E.createState({ fen });
  const cells = [];
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x];
    if (p) cells.push((p.c === 'r' ? p.t : p.t.toLowerCase()) + '@' + x + ',' + y);
  }
  cells.sort();
  return cells.join('|');
}

// ---------- 主变：红用 findAll 选着，黑选最顽强应手（延迟最久） ----------
function buildLine(fen, n) {
  const s = E.createState({ fen });
  const out = [];
  let cur = n, guard = 0;
  while (cur > 0 && guard++ < 20) {
    nodes = 0; LIMIT = 3_000_000;
    const r = findAll(s, cur);
    if (r.status !== 'mate') return null;
    out.push(E.moveNotation(s, r.move.from, r.move.to));
    lmake(s, r.move);
    const bs = E.legalMoves(s, 'b');
    if (bs.length === 0) { out.push('#'); break; }
    let best = null, bestK = -1, inconclusive = false;
    for (const bm of bs) {
      const u2 = lmake(s, bm);
      let k = 0;
      for (let z = 1; z <= cur; z++) {
        nodes = 0; LIMIT = 3_000_000;
        const rr = findAll(s, z);
        if (rr.status === 'mate') { k = z; break; }
        if (rr.status === 'cutoff') { k = -1; break; }
      }
      lundo(s, u2);
      if (k < 0) { inconclusive = true; break; }
      if (k === 0) return null; // 黑可逃脱 -> 非强制杀
      if (k > bestK) { bestK = k; best = bm; }
    }
    if (inconclusive || !best) return null;
    out.push(E.moveNotation(s, best.from, best.to));
    lmake(s, best);
    cur = bestK;
  }
  return out.join(' ');
}

// ---------- 单局面质量门 ----------
function gates(fen) {
  // 1) 初始双方不被将军、将帅不照面（isInCheck 含照面判定）
  let s;
  try { s = E.createState({ fen }); } catch { return { ok: false, why: 'createState 失败' }; }
  if (E.isInCheck(s, 'b')) return { ok: false, why: '初始黑被将' };
  if (E.isInCheck(s, 'r')) return { ok: false, why: '初始红被将' };
  // 2) 最短杀恰好=3：findAll(s,1)/findAll(s,2) 均 nomate，findAll(s,3) mate；cutoff 视为存疑丢弃
  nodes = 0; LIMIT = 2_500_000;
  const r1 = findAll(E.createState({ fen }), 1);
  if (r1.status === 'mate') return { ok: false, why: '存在一步杀' };
  if (r1.status === 'cutoff') return { ok: false, why: 's1 预算耗尽存疑' };
  nodes = 0; LIMIT = 2_500_000;
  const r2 = findAll(E.createState({ fen }), 2);
  if (r2.status === 'mate') return { ok: false, why: '存在两步杀' };
  if (r2.status === 'cutoff') return { ok: false, why: 's2 预算耗尽存疑' };
  nodes = 0; LIMIT = 4_000_000;
  const r3 = findAll(E.createState({ fen }), 3);
  if (r3.status !== 'mate') return { ok: false, why: '无强制三步杀(' + r3.status + ')' };
  return { ok: true };
}

// ---------- 主流程（续跑模式：读回已有分片，只补齐未达标的杀形） ----------
import { existsSync } from 'node:fs';
const outPath = new URL('./shard-mate3.json', import.meta.url).pathname;
let found = [];
if (existsSync(outPath)) {
  try { found = JSON.parse(readFileSync(outPath, 'utf8')); } catch { found = []; }
}
const PUZZLE_SIGS = new Set(PUZZLES.map(p => signatureOfFen(p.fen)));
const usedSigs = new Set(PUZZLE_SIGS);
for (const p of found) usedSigs.add(signatureOfFen(p.fen));
const shapeCount = {};
for (const p of found) {
  // 去掉序号后缀得到基础杀形名
  const base = p.name.replace(/·\d+$/, '');
  shapeCount[base] = (shapeCount[base] || 0) + 1;
}
const GOAL = 3;             // 每个杀形目标局数
const ROUNDS_PER_SHAPE = 3000;
const WALL_BUDGET_MS = 250_000; // 全局墙上时钟预算，到点即停写盘
let totalSamples = 0, t0 = Date.now();

outer:
for (let si = 0; si < SHAPES.length; si++) {
  const shape = SHAPES[si];
  let got = shapeCount[shape.name] || 0;
  if (got >= GOAL) continue;
  for (let round = 0; round < ROUNDS_PER_SHAPE; round++) {
    if (Date.now() - t0 > WALL_BUDGET_MS) break outer;
    if (got >= GOAL) break;
    totalSamples++;
    const rng = mulberry((si + 1) * 1000003 + round * 7919 + 17);
    const fen = samplePosition(shape, round, rng);
    if (!fen) continue;
    const sig = signatureOfFen(fen);
    if (usedSigs.has(sig)) continue;

    const g = gates(fen);
    if (!g.ok) continue;

    const line = buildLine(fen, 3);
    if (!line || !line.endsWith('#')) continue;

    // 3) playLine 重走主变，终局 redwin
    const s2 = E.createState({ fen });
    const texts = line.replace(/#\s*$/, '').trim().split(/\s+/);
    const pl = playLine(s2, texts);
    if (!pl.ok) continue;
    if (s2.status !== 'redwin') continue;
    // 黑着均真实合法：playLine 已逐着 parseMove 校验；再核对 token 数=5
    if (texts.length !== 5) continue;

    usedSigs.add(sig);
    const idx = got + 1;
    const name = shape.name + '·' + idx;
    found.push({ chapter: 'mate3', name, mate: 3, fen, hint: HINTS[shape.name], line: line + ' ' });
    shapeCount[shape.name] = idx;
    got = idx;
    console.error(`[${found.length}] ${name}: ${line}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}

console.error(`\n采样 ${totalSamples} 次，得到 ${found.length} 局，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---------- 按杀形连续重编号（删除幸存局保留旧序号，续跑会撞名；统一重排） ----------
function renumber(list) {
  const groups = new Map();
  for (const p of list) {
    const base = p.name.replace(/·\d+$/, '');
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(p);
  }
  const out = [];
  for (const [base, arr] of groups) {
    arr.forEach((p, i) => { p.name = arr.length > 1 ? base + '·' + (i + 1) : base; out.push(p); });
  }
  return out;
}
const foundRenumbered = renumber(found);

// ---------- 落盘前：内存自验 gates 1)-4) ----------
function fullVerify(list) {
  const errs = [];
  const seen = new Set();
  const names = new Set();
  for (const pz of list) {
    if (names.has(pz.name)) errs.push(`${pz.name}: 局名重复`);
    names.add(pz.name);
    const sig = signatureOfFen(pz.fen);
    if (PUZZLE_SIGS.has(sig)) errs.push(`${pz.name}: 与 PUZZLES 重复`);
    if (seen.has(sig)) errs.push(`${pz.name}: 分片内重复`);
    seen.add(sig);
    const g = gates(pz.fen);
    if (!g.ok) errs.push(`${pz.name}: gates 失败 ${g.why}`);
    const s = E.createState({ fen: pz.fen });
    if (E.isInCheck(s, 'b') || E.isInCheck(s, 'r')) errs.push(`${pz.name}: 初始将军`);
    const texts = pz.line.replace(/#\s*$/, '').trim().split(/\s+/);
    const pl = playLine(E.createState({ fen: pz.fen }), texts);
    if (!pl.ok) errs.push(`${pz.name}: 主变非法第${pl.errorIndex + 1}手 ${pl.errorText}`);
    const sv = E.createState({ fen: pz.fen });
    playLine(sv, texts);
    if (sv.status !== 'redwin') errs.push(`${pz.name}: 终局非 redwin(${sv.status})`);
    if (texts.length !== 5) errs.push(`${pz.name}: line 着法数!=5 (${texts.length})`);
    if (!pz.line.trim().endsWith('#')) errs.push(`${pz.name}: line 未以 # 结尾`);
  }
  return errs;
}

const preErrs = fullVerify(foundRenumbered);
if (preErrs.length) {
  console.error('❌ 落盘前自验失败，不写盘：');
  for (const e of preErrs) console.error('  -', e);
  process.exit(1);
}

writeFileSync(outPath, JSON.stringify(foundRenumbered, null, 1), 'utf8');
console.error(`已写出 ${outPath} (${foundRenumbered.length} 局)`);

// ---------- 读回重跑自验 ----------
const readBack = JSON.parse(readFileSync(outPath, 'utf8'));
const postErrs = fullVerify(readBack);
console.error('\n===== 读回自验 =====');
console.error('局数:', readBack.length);
if (postErrs.length) {
  console.error('❌ 读回自验失败：');
  for (const e of postErrs) console.error('  -', e);
  process.exit(1);
} else {
  console.error('✅ gates 1)-4) 全部通过');
}
console.error('杀形分布:');
for (const [k, v] of Object.entries(shapeCount)) console.error(`  ${k}: ${v}`);
