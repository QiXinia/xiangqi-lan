// 古谱名局残局生成器 v2(参数化 + 可并行分片 + 扩充名池)
// 红先 3-5 步强制连将杀; 全部经穷举求解 + playLine 终局校验 + FEN/镜像去重
// 用法:
//   node generated/gen-classic2.mjs --only=3 --add=24 --seed=101 --out=generated/shard-c3a.json --ms=420000
//   node generated/gen-classic2.mjs --only=4 --add=24 --seed=202 --out=generated/shard-c4a.json --ms=420000
//   node generated/gen-classic2.mjs --only=4 --add=14 --seed=303 --out=generated/shard-c4b.json --ms=420000 --heavy
//   node generated/gen-classic2.mjs --only=5 --add=8  --seed=404 --out=generated/shard-c5a.json --ms=900000 --deep
import * as E from '../js/engine.js';
import { playLine } from '../js/notation.js';
import { PUZZLES } from '../js/puzzles.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

function arg(k, d) { const m = process.argv.find(a => a.startsWith('--' + k + '=')); return m ? m.split('=')[1] : d; }
const ONLY = parseInt(arg('only', '3'), 10);
const ADD = parseInt(arg('add', '20'), 10);
const SEED = parseInt(arg('seed', '1'), 10);
const OUT = arg('out', 'generated/shard-cx.json');
const BUDGET_MS = parseInt(arg('ms', '420000'), 10);
const HEAVY = process.argv.includes('--heavy');
const DEEP = process.argv.includes('--deep');
const MAXNAME = parseInt(arg('maxname', '3'), 10);

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
    nodes = 0; LIMIT = DEEP ? 14_000_000 : (n >= 5 ? 6_000_000 : 4_000_000);
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
        nodes = 0; LIMIT = DEEP ? 14_000_000 : (n >= 5 ? 6_000_000 : 4_000_000);
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
const KING_SITES = [[4, 0], [3, 0], [5, 0], [4, 1], [3, 1], [5, 1], [4, 2], [3, 2], [5, 2]];
// 轻守子池(三/四步杀)
const GUARD_LITE = [
  [], [['a', 4, 1]], [['a', 3, 0]], [['a', 5, 0]], [['a', 3, 2]], [['a', 5, 2]],
  [['a', 3, 0], ['a', 5, 0]], [['a', 4, 1], ['a', 3, 0]], [['a', 4, 1], ['a', 5, 2]],
  [['a', 3, 2], ['a', 5, 2]], [['b', 2, 0], ['b', 6, 0]], [['b', 4, 2]],
  [['b', 2, 4], ['b', 6, 4]], [['a', 4, 1], ['b', 4, 2]], [['p', 4, 3]],
  [['a', 3, 0], ['p', 2, 4]], [['n', 1, 2]], [['c', 8, 2]], [['r', 0, 3]],
  [['p', 2, 3], ['p', 6, 3]]
];
// 重守子池(四步 heavy / 五步, 古谱多子攻防)
const GUARD_HEAVY = [
  [['a', 3, 0], ['a', 5, 0], ['b', 2, 0], ['b', 6, 0]],
  [['a', 4, 1], ['a', 3, 0], ['b', 6, 0]],
  [['a', 3, 0], ['a', 5, 0], ['b', 4, 2]],
  [['a', 3, 2], ['a', 5, 2], ['b', 2, 0], ['b', 6, 0]],
  [['a', 3, 0], ['a', 5, 0], ['p', 4, 3]],
  [['a', 3, 0], ['a', 5, 0], ['p', 2, 4]],
  [['a', 4, 1], ['p', 6, 3]],
  [['b', 2, 0], ['b', 6, 0], ['p', 4, 3]],
  [['a', 3, 0], ['a', 5, 0], ['b', 2, 0], ['b', 6, 0], ['p', 4, 3]],
  [['a', 3, 0], ['a', 5, 0], ['n', 1, 2]],
  [['a', 4, 1], ['n', 8, 3]],
  [['a', 3, 0], ['a', 5, 0], ['c', 8, 3]],
  [['a', 4, 1], ['p', 2, 3], ['p', 6, 4]],
  [['b', 2, 0], ['b', 6, 0], ['n', 8, 2]],
  [['a', 3, 0], ['a', 5, 0], ['r', 8, 3]]
];
// 攻子组合
const ATK_LITE = [
  ['R', 'N', 'C'], ['R', 'R', 'N'], ['R', 'R', 'C'], ['R', 'N', 'N'],
  ['R', 'C', 'C'], ['N', 'N', 'C'], ['R', 'N', 'P'], ['R', 'C', 'P'],
  ['N', 'C', 'P'], ['R', 'P', 'P'], ['C', 'P', 'P'], ['N', 'P', 'P'],
  ['R', 'R', 'P'], ['C', 'C', 'P'], ['R', 'N', 'C', 'P'],
  ['R', 'P', 'P', 'P'], ['N', 'N', 'P', 'P'], ['R', 'C', 'P', 'P']
];
const ATK_FEW = [ // 五步杀精简子力, 便于预算内穷举
  ['R', 'N', 'C'], ['R', 'R', 'N'], ['R', 'N', 'P'], ['R', 'C', 'P'],
  ['N', 'C', 'P'], ['R', 'N'], ['R', 'C'], ['N', 'C'], ['R', 'P', 'P'], ['C', 'P', 'P']
];
// 古谱名局名(扩充版, 取自《适情雅趣》《橘中秘》《韬略元机》《梅花谱》及经典杀形)
const NAMES = {
  RN: ['车马冷着', '野马舞风', '白马卧栏', '饥鹰扑兔', '雕鹰搏兔', '良将安边', '铁骑追风', '马蹀阏氏血',
    '立马车', '横刀立马', '白马现蹄', '马踹连营', '车马盈门', '勒马停骖', '骅骝得步', '骏马奔江'],
  RC: ['炮辗丹沙', '车驾东巡', '烽火齐鸣', '拔寨回营', '海树波平', '澄水蛟龙', '投肉饲虎', '炮打边城',
    '炮打潼关', '镇山炮', '空头炮', '车炮抽杀', '铁门栓', '炮镇中原', '雷动中天', '鼓噪勒兵'],
  RR: ['二鬼拍门', '头辆舆轮', '挡者披靡', '双车投井', '边车递职', '双车胁士', '三车闹士', '双车保驾',
    '两车争先', '横行万里', '双车断桥', '轴轳千里'],
  NC: ['丹凤朝阳', '鸳鸯并宿', '珠藏韫柜', '香饵钓鳌', '挂印封金', '马后炮', '马炮争雄', '榴花映日',
    '马跳围墙', '炮助马威', '饮马长江', '一骑困城'],
  NN: ['双马追风', '二马盘宫', '野马鬫堂', '双马饮泉', '二马追风', '双马盘桓', '黄莺搏兔', '双马凌云'],
  CC: ['计罗并照', '神龟出洛', '重炮连环', '双杯献酒', '重炮禁门', '炮兵联动', '双炮归宫', '入洞出洞'],
  P: ['送佛归殿', '老卒扶车', '撞阵冲军', '三仙炼丹', '五丁凿路', '群鼠争穴', '三进兵', '蝴蝶高飞',
    '凤凰三点头', '老兵疲骑', '卒取咸阳', '短兵相接', '三战吕布', '独卒擒王', '老兵建功', '蚯蚓守拙'],
  general: ['独占鳌头', '兔游月窟', '曲突徙薪', '冰损蓝关', '国士无双', '苍舒称象', '困魏掣燕', '丰沛三杰',
    '辅赵扶齐', '疾风扫叶', '明皇游宫', '藕断丝牵', '雁阵排空', '投石入水', '七子八婿', '双鹭窥鱼',
    '开门待寇', '闭门扫轨', '醋浸葫芦', '范蠡进施', '三令斩姬', '月下追信', '跨海征东', '十三太保',
    '一醉岳阳', '金不换', '封侯拜爵', '暗度陈仓', '明修栈道', '背水列阵', '十面埋伏', '破釜沉舟',
    // 《适情雅趣》传世名
    '顺送襄江', '金门对策', '朱云折槛', '韩岳踹营', '范张行刺', '郅恽拒关', '张辽辟土', '二郎搜山',
    '七擒七纵', '火烧新野', '火烧赤壁', '甘宁劫营', '田单掠阵', '白起破赵', '乐毅收齐', '伍员刺僚',
    '先轸兴兵', '孙膑减灶', '吕虔赠刀', '朱亥击晋', '伍员吹箫', '自缚降吴', '赤壁鏖兵', '吴牛喘月',
    '完璧归赵', '投鞭断流', '拔剑斩蛇', '昆仑窃药', '英雄入彀', '指鹿为马', '秦琼卖马', '管鲍分金',
    '裴度还带', '诸葛出庐', '金蝉脱壳', '假道伐虢', '偷营劫寨', '断桥得路', '渔樵问答', '秋风五丈',
    '平顶冠', '御驾亲征', '老将出征', '金蝉脱壳', '沉舟破釜', '踏雪寻梅', '峻岭腾云', '塞翁失马']
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
function samplePosition(atk, rng, n) {
  const kp = KING_SITES[Math.floor(rng() * KING_SITES.length)];
  const rkX = [3, 4, 5][Math.floor(rng() * 3)];
  const rkY = [7, 8, 9][Math.floor(rng() * 3)];
  const pieces = [['k', kp[0], kp[1]], ['K', rkX, rkY]];
  // 步数越多守子越厚; 但五步杀(deep)用精简池
  let pool;
  if (DEEP) pool = GUARD_LITE;
  else if (HEAVY || n >= 4) pool = (rng() < 0.55 ? GUARD_HEAVY : GUARD_LITE);
  else pool = GUARD_LITE;
  const guards = pool[Math.floor(rng() * pool.length)];
  for (const g of guards) pieces.push(g.slice());
  const used = new Set(pieces.map(p => p[1] + ',' + p[2]));
  for (const t of atk) {
    let placed = false;
    for (let tries = 0; tries < 160; tries++) {
      let x, y;
      if (t === 'P') {
        if (rng() < 0.72) { x = Math.floor(rng() * 9); y = Math.floor(rng() * 5); }
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
  nodes = 0; LIMIT = n >= 5 ? (DEEP ? 14_000_000 : 7_000_000) : 3_000_000;
  let rn;
  try { rn = findAll(E.createState({ fen }), n); } catch { return false; }
  if (rn.status !== 'mate') return false;
  if (n > 1) {
    nodes = 0; LIMIT = n >= 5 ? (DEEP ? 14_000_000 : 7_000_000) : 3_000_000;
    let rm;
    try { rm = findAll(E.createState({ fen }), n - 1); } catch { return false; }
    if (rm.status !== 'nomate') return false;
  }
  return true;
}

// ---------- 主流程 ----------
const outPath = new URL('../' + OUT, import.meta.url).pathname;
let found = [];
if (existsSync(outPath)) { try { found = JSON.parse(readFileSync(outPath, 'utf8')); } catch { found = []; } }
const usedSigs = new Set();
const addSig = (fen) => { for (const z of signatureOfFen(fen)) usedSigs.add(z); };
for (const p of PUZZLES) addSig(p.fen);
for (const p of found) addSig(p.fen);
const nameUsed = {};
for (const p of found) nameUsed[p.name] = (nameUsed[p.name] || 0) + 1;
const ATK = DEEP ? ATK_FEW : ATK_LITE;
const t0 = Date.now(), sampleCnt = { n: 0 };
function pickName(atk, rng) {
  const pool = namePoolFor(atk).filter(nm => (nameUsed[nm] || 0) < MAXNAME);
  const list = pool.length ? pool : NAMES.general.filter(nm => (nameUsed[nm] || 0) < MAXNAME);
  if (!list.length) return null;
  const nm = list[Math.floor(rng() * list.length)];
  nameUsed[nm] = (nameUsed[nm] || 0) + 1;
  const c = nameUsed[nm];
  return c > 1 ? nm + '·' + (c === 2 ? '二' : '三') : nm;
}
let got = 0, round = 0;
while (got < ADD) {
  if (Date.now() - t0 > BUDGET_MS) break;
  round++;
  if (round > 200000) break;
  const rng = mulberry(SEED * 7919 + round * 104729 + ONLY * 131);
  const atk = ATK[Math.floor(rng() * ATK.length)];
  const fen = samplePosition(atk, rng, ONLY);
  if (!fen) continue;
  sampleCnt.n++;
  const [sg, mg] = signatureOfFen(fen);
  if (usedSigs.has(sg) || usedSigs.has(mg)) continue;
  if (!gates(fen, ONLY)) continue;
  const line = buildLine(fen, ONLY);
  if (!line || !line.endsWith('#')) continue;
  const texts = line.replace(/#\s*$/, '').trim().split(/\s+/);
  if (texts.length !== 2 * ONLY - 1) continue;
  const sv = E.createState({ fen });
  const pl = playLine(sv, texts);
  if (!pl.ok || sv.status !== 'redwin') continue;
  const name = pickName(atk, rng);
  if (!name) continue;
  addSig(fen);
  found.push({
    chapter: 'classic', name, mate: ONLY, fen,
    hint: `古谱名局「${name.replace(/·[二三]$/, '')}」：红方先手，${ONLY} 步精巧连杀。`,
    line: line + ' '
  });
  got++;
  console.error(`[n=${ONLY} #${found.length}] ${name}: ${line}`);
  writeFileSync(outPath, JSON.stringify(found, null, 1), 'utf8');
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
console.error(`\n[only=${ONLY} seed=${SEED}] 采样 ${sampleCnt.n}，本片 ${found.length} 局(新增${got})，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`);
