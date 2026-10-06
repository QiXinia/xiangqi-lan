// 古谱名局残局生成器: 红先 3-5 步强制杀, 古谱构图(红 3-5 子压境, 黑合法士象/马/车/炮/卒防守)
// 命名取自《适情雅趣》《橘中秘》《韬略元机》等名局; 全部经穷举求解 + playLine 终局校验 + 镜像去重
// 用法: node generated/gen-classic.mjs
import * as E from '../js/engine.js';
import { playLine } from '../js/notation.js';
import { PUZZLES } from '../js/puzzles.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

function lmake(s, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty };
}
function lundo(s, u) { s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap; s.turn = s.turn === 'r' ? 'b' : 'r'; }

let nodes = 0, LIMIT = 2_000_000;
const over = () => nodes >= LIMIT;
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
    if (bk) score += (Math.abs(fx - bk[0]) + Math.abs(fy - bk[1]) - Math.abs(tx - bk[0]) - Math.abs(ty - bk[1])) * 2;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(o => o.m);
}
function findAll(s, n) {
  if (over()) return { status: 'cutoff' };
  nodes++;
  for (const m of orderMoves(s, E.legalMoves(s, 'r'))) {
    if (over()) return { status: 'cutoff' };
    const u = lmake(s, m);
    const bs = E.legalMoves(s, 'b');
    let outcome;
    if (bs.length === 0) outcome = 'mate';
    else if (n === 1) outcome = 'fail';
    else {
      outcome = 'mate';
      for (const bm of bs) {
        if (over()) { outcome = 'cutoff'; break; }
        const u2 = lmake(s, bm);
        const r = findAll(s, n - 1);
        lundo(s, u2);
        if (r.status === 'mate') continue;
        if (r.status === 'cutoff') { outcome = 'cutoff'; break; }
        outcome = 'fail'; break;
      }
    }
    lundo(s, u);
    if (outcome === 'mate') return { status: 'mate', move: m };
  }
  return { status: 'nomate' };
}
function buildLine(fen, n) {
  const s = E.createState({ fen });
  const out = [];
  let cur = n, guard = 0;
  while (cur > 0 && guard++ < 20) {
    nodes = 0; LIMIT = DEEP2 ? 7_000_000 : DEEP ? 15_000_000 : 5_000_000;
    let r;
    try { r = findAll(s, cur); } catch { return null; }
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
        nodes = 0; LIMIT = DEEP2 ? 7_000_000 : DEEP ? 15_000_000 : 5_000_000;
        const rr = findAll(s, z);
        if (rr.status === 'mate') { k = z; break; }
        if (rr.status === 'cutoff') { k = -1; break; }
      }
      lundo(s, u2);
      if (k < 0) { inconclusive = true; break; }
      if (k === 0) return null;
      if (k > bestK) { bestK = k; best = bm; }
    }
    if (inconclusive || !best) return null;
    out.push(E.moveNotation(s, best.from, best.to));
    lmake(s, best);
    cur = bestK;
  }
  return out.join(' ');
}

// ---------- 布子 ----------
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
// 黑将候选位(九宫)
const KING_SITES = [[4, 0], [3, 0], [5, 0], [4, 1], [3, 1], [5, 1], [4, 2], [3, 2], [5, 2]];
// 合法防守模板(士象均在合法位; 卒未过河在偶数列)
const GUARD_POOLS = [
  [],
  [['a', 4, 1]],
  [['a', 3, 0]],
  [['a', 5, 0]],
  [['a', 3, 2]],
  [['a', 5, 2]],
  [['a', 3, 0], ['a', 5, 0]],
  [['a', 4, 1], ['a', 3, 0]],
  [['a', 4, 1], ['a', 5, 2]],
  [['a', 3, 2], ['a', 5, 2]],
  [['b', 2, 0], ['b', 6, 0]],
  [['b', 4, 2]],
  [['b', 2, 4], ['b', 6, 4]],
  [['a', 3, 0], ['a', 5, 0], ['b', 2, 0], ['b', 6, 0]],
  [['a', 4, 1], ['b', 4, 2]],
  [['a', 3, 0], ['a', 5, 0], ['b', 4, 2]],
  [['a', 3, 2], ['a', 5, 2], ['b', 2, 0], ['b', 6, 0]],
  [['a', 3, 0], ['a', 5, 0], ['p', 4, 3]],
  [['a', 3, 0], ['a', 5, 0], ['p', 2, 4]],
  [['a', 4, 1], ['p', 6, 3]],
  [['b', 2, 0], ['b', 6, 0], ['p', 4, 3]],
  [['a', 3, 0], ['a', 5, 0], ['b', 2, 0], ['b', 6, 0], ['p', 4, 3]],
  [['n', 1, 2]],
  [['a', 3, 0], ['a', 5, 0], ['n', 1, 2]],
  [['a', 4, 1], ['n', 8, 3]],
  [['r', 0, 3]],
  [['c', 8, 2]],
  [['a', 3, 0], ['a', 5, 0], ['c', 8, 3]],
  [['p', 2, 3], ['p', 6, 3]],
  [['a', 4, 1], ['p', 2, 3], ['p', 6, 4]]
];
// 红攻子组合(古谱局 3-5 子, 常含兵)
const ATK_SETS = [
  ['R', 'N', 'C'], ['R', 'R', 'N'], ['R', 'R', 'C'], ['R', 'N', 'N'],
  ['R', 'C', 'C'], ['N', 'N', 'C'], ['R', 'N', 'P'], ['R', 'C', 'P'],
  ['N', 'C', 'P'], ['R', 'P', 'P'], ['C', 'P', 'P'], ['N', 'P', 'P'],
  ['R', 'N', 'C', 'P'], ['R', 'R', 'P'], ['C', 'C', 'P'],
  ['R', 'P', 'P', 'P'], ['N', 'N', 'P', 'P'], ['R', 'C', 'P', 'P'],
  ['R', 'N', 'P', 'P'], ['R', 'R', 'N', 'P']
];
// 古谱名局名(按子力特征分池)
const NAMES = {
  RN: ['车马冷着', '野马舞风', '白马卧栏', '饥鹰扑兔', '雕鹰搏兔', '良将安边', '铁骑追风', '马蹀阏氏血'],
  RC: ['炮辗丹沙', '车驾东巡', '烽火齐鸣', '拔寨回营', '海树波平', '澄水蛟龙', '投肉饲虎', '炮打边城'],
  RR: ['二鬼拍门', '头辆舆轮', '挡者披靡', '双车投井', '边车递职'],
  NC: ['丹凤朝阳', '鸳鸯并宿', '珠藏韫柜', '香饵钓鳌', '挂印封金'],
  NN: ['双马追风', '二马盘宫', '野马鬫堂'],
  CC: ['计罗并照', '神龟出洛', '重炮连环'],
  P: ['送佛归殿', '老卒扶车', '撞阵冲军', '三仙炼丹', '五丁凿路', '群鼠争穴', '三进兵', '蝴蝶高飞'],
  general: ['独占鳌头', '兔游月窟', '曲突徙薪', '冰损蓝关', '国士无双', '苍舒称象', '困魏掣燕', '丰沛三杰',
    '辅赵扶齐', '疾风扫叶', '明皇游宫', '藕断丝牵', '雁阵排空', '投石入水', '七子八婿', '双鹭窥鱼',
    '开门待寇', '闭门扫轨', '醋浸葫芦', '范蠡进施', '三令斩姬', '月下追信', '跨海征东', '十三太保',
    '一醉岳阳', '金不换', '封侯拜爵', '暗度陈仓', '明修栈道', '背水列阵', '十面埋伏', '破釜沉舟']
};
function namePoolFor(atk) {
  const has = t => atk.includes(t);
  if (has('R') && has('N') && !has('C')) return NAMES.RN;
  if (has('R') && has('C') && !has('N')) return NAMES.RC;
  if (has('R') && has('N') && has('C')) return [...NAMES.RN, ...NAMES.RC, ...NAMES.general];
  const nr = atk.filter(t => t === 'R').length, nc = atk.filter(t => t === 'C').length, nn = atk.filter(t => t === 'N').length, np = atk.filter(t => t === 'P').length;
  if (nr >= 2) return NAMES.RR;
  if (nn >= 2) return NAMES.NN;
  if (nc >= 2) return NAMES.CC;
  if (np >= 2) return NAMES.P;
  if (has('N') && has('C')) return NAMES.NC;
  return NAMES.general;
}
function samplePosition(atk, rng) {
  const kp = KING_SITES[Math.floor(rng() * KING_SITES.length)];
  const rkX = [3, 4, 5][Math.floor(rng() * 3)];
  const rkY = [7, 8, 9][Math.floor(rng() * 3)];
  const pieces = [['k', kp[0], kp[1]], ['K', rkX, rkY]];
  const gp = GUARD_POOLS_SMALL || GUARD_POOLS;
  const guards = gp[Math.floor(rng() * gp.length)];
  for (const g of guards) pieces.push(g.slice());
  const used = new Set(pieces.map(p => p[1] + ',' + p[2]));
  for (const t of atk) {
    let placed = false;
    for (let tries = 0; tries < 150; tries++) {
      let x, y;
      if (t === 'P') {
        // 70% 已过河压境(y0-4 任意列), 30% 未过河(y5/6 偶数列)
        if (rng() < 0.7) { x = Math.floor(rng() * 9); y = Math.floor(rng() * 5); }
        else { x = [0, 2, 4, 6, 8][Math.floor(rng() * 5)]; y = 5 + Math.floor(rng() * 2); }
      } else {
        x = Math.floor(rng() * 9); y = Math.floor(rng() * 6);
      }
      const key = x + ',' + y;
      if (used.has(key)) continue;
      used.add(key); pieces.push([t, x, y]); placed = true; break;
    }
    if (!placed) return null;
  }
  return makeFen(pieces);
}
function signatureOfFen(fen) {
  const s = E.createState({ fen });
  const cells = [];
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x];
    if (p) cells.push((p.c === 'r' ? p.t : p.t.toLowerCase()) + '@' + x + ',' + y);
  }
  cells.sort();
  const mir = cells.map(z => { const [a, rest] = z.split('@'); const [x, y] = rest.split(',').map(Number); return a + '@' + (8 - x) + ',' + y; }).sort();
  return [cells.join('|'), mir.join('|')];
}
function gates(fen, n) {
  let s;
  try { s = E.createState({ fen }); } catch { return false; }
  if (E.isInCheck(s, 'b') || E.isInCheck(s, 'r')) return false;
  if (!E.legalMoves(s, 'r').length || !E.legalMoves(s, 'b').length) return false;
  // 粗筛: n 步内有杀
  nodes = 0; LIMIT = n >= 5 ? (DEEP2 ? 7_000_000 : DEEP ? 18_000_000 : 6_000_000) : 2_500_000;
  let rn;
  try { rn = findAll(E.createState({ fen }), n); } catch { return false; }
  if (rn.status !== 'mate') return false;
  // 精确: n-1 步无杀
  if (n > 1) {
    nodes = 0; LIMIT = n >= 5 ? (DEEP2 ? 7_000_000 : DEEP ? 18_000_000 : 6_000_000) : 2_500_000;
    let rm;
    try { rm = findAll(E.createState({ fen }), n - 1); } catch { return false; }
    if (rm.status !== 'nomate') return false;
  }
  return true;
}

// ---------- 主流程 ----------
const outPath = new URL('./shard-classic.json', import.meta.url).pathname;
let found = [];
if (existsSync(outPath)) { try { found = JSON.parse(readFileSync(outPath, 'utf8')); } catch { found = []; } }
const usedSigs = new Set();
const addSig = (fen) => { for (const z of signatureOfFen(fen)) usedSigs.add(z); };
for (const p of PUZZLES) addSig(p.fen);
for (const p of found) addSig(p.fen);
// 已用名计数
const nameUsed = {};
for (const p of found) nameUsed[p.name] = (nameUsed[p.name] || 0) + 1;
const DEEP = process.argv.includes('--deep');
const DEEP2 = process.argv.includes('--deep2');
let GUARD_POOLS_SMALL = null;
const TARGETS = DEEP2 ? { 3: 0, 4: 0, 5: 10 } : DEEP ? { 3: 0, 4: 0, 5: 10 } : { 3: 20, 4: 20, 5: 12 };
const got = { 3: 0, 4: 0, 5: 0 };
if (DEEP || DEEP2) {
  // 五步杀分支因子大, 精简子力以便预算内穷举判定
  ATK_SETS.splice(0, ATK_SETS.length,
    ['R', 'N', 'C'], ['R', 'R', 'N'], ['R', 'N', 'P'], ['R', 'C', 'P'], ['N', 'C', 'P'],
    ['R', 'N'], ['R', 'C'], ['N', 'C'], ['R', 'P', 'P'], ['C', 'P', 'P']);
  GUARD_POOLS_SMALL = [
    [], [['a', 4, 1]], [['a', 3, 0]], [['a', 5, 0]], [['a', 3, 2]],
    [['a', 3, 0], ['a', 5, 0]], [['b', 4, 2]], [['b', 2, 0], ['b', 6, 0]],
    [['a', 4, 1], ['b', 4, 2]], [['p', 4, 3]], [['a', 3, 0], ['p', 2, 4]]
  ];
}
if (DEEP2) {
  // 极精简: 2 攻子 + 0-2 守子, 收紧预算加速判定
  ATK_SETS.splice(0, ATK_SETS.length,
    ['R', 'N'], ['R', 'C'], ['N', 'C'], ['R', 'R'], ['C', 'C'], ['R', 'P'], ['N', 'P'], ['C', 'P']);
  GUARD_POOLS_SMALL = [
    [], [['a', 4, 1]], [['a', 3, 0]], [['a', 5, 0]], [['a', 3, 2]],
    [['b', 4, 2]], [['a', 3, 0], ['a', 5, 0]], [['p', 4, 3]]
  ];
}
for (const p of found) got[p.mate] = (got[p.mate] || 0) + 1;
const BUDGET_MS = DEEP2 ? 360_000 : DEEP ? 420_000 : 480_000;
const t0 = Date.now(), sampleCnt = { n: 0 };
function pickName(atk, rng) {
  const pool = namePoolFor(atk).filter(nm => (nameUsed[nm] || 0) < 2);
  const list = pool.length ? pool : NAMES.general.filter(nm => (nameUsed[nm] || 0) < 2);
  if (!list.length) return null;
  const nm = list[Math.floor(rng() * list.length)];
  nameUsed[nm] = (nameUsed[nm] || 0) + 1;
  return nameUsed[nm] > 1 ? nm + '·二' : nm;
}
outer:
for (const n of [3, 4, 5]) {
  if (got[n] >= TARGETS[n]) continue;
  let round = 0;
  while (got[n] < TARGETS[n]) {
    if (Date.now() - t0 > BUDGET_MS) break outer;
    round++;
    if (round > 60000) break;
    const rng = mulberry(n * 7919 + round * 104729 + 13);
    const atk = ATK_SETS[Math.floor(rng() * ATK_SETS.length)];
    const fen = samplePosition(atk, rng);
    if (!fen) continue;
    sampleCnt.n++;
    const [sg, mg] = signatureOfFen(fen);
    if (usedSigs.has(sg) || usedSigs.has(mg)) continue;
    if (!gates(fen, n)) continue;
    const line = buildLine(fen, n);
    if (!line || !line.endsWith('#')) continue;
    const texts = line.replace(/#\s*$/, '').trim().split(/\s+/);
    if (texts.length !== 2 * n - 1) continue;
    const sv = E.createState({ fen });
    const pl = playLine(sv, texts);
    if (!pl.ok || sv.status !== 'redwin') continue;
    const name = pickName(atk, rng);
    if (!name) continue;
    addSig(fen);
    found.push({
      chapter: 'classic', name, mate: n, fen,
      hint: `古谱名局「${name.replace(/·二$/, '')}」：红方先手，${n} 步精巧成杀。`,
      line: line + ' '
    });
    got[n]++;
    console.error(`[classic n=${n} #${found.length}] ${name}: ${line}`);
  }
}
// 自验
const errs = [];
const nameSeen = new Set();
for (const pz of found) {
  if (nameSeen.has(pz.name)) errs.push(pz.name + ' 重名');
  nameSeen.add(pz.name);
  if (!gates(pz.fen, pz.mate)) errs.push(pz.name + ' gates 失败');
  const texts = pz.line.replace(/#\s*$/, '').trim().split(/\s+/);
  const sv = E.createState({ fen: pz.fen });
  const pl = playLine(sv, texts);
  if (!pl.ok || sv.status !== 'redwin') errs.push(pz.name + ' 主变失败');
}
if (errs.length) { console.error('自验失败:'); errs.forEach(e => console.error(' -', e)); process.exit(1); }
writeFileSync(outPath, JSON.stringify(found, null, 1), 'utf8');
console.error(`\n采样 ${sampleCnt.n}，产出 ${found.length} 局(3步${got[3]}/4步${got[4]}/5步${got[5]})，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
