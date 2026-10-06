// 两步杀(mate=2)残局分片生成器: node generated/gen-mate2.mjs
// 复用 test/gen-advanced.mjs 的 findAll(允许缓手的强制杀) 与 test/puzzle-check.js 的 line(最顽强应着) 写法。
// 质量门全部由求解器实跑判定, 不手工编造局面; 落盘前读回 JSON 重跑全部校验。
import * as E from './engine-fixed.mjs';
import { playLine } from './notation-fixed.mjs';
import { PUZZLES } from '../js/puzzles.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shard-mate2.json');

// ---------- 轻量走子/撤销(经典明子, 与 gen-advanced 一致) ----------
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
// 允许缓手的任意强制杀(连将/困毙均计为胜), 与 gen-advanced.findAll 同构
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
// 红方一步"真将杀"(黑将仍在盘上、正被将军、且黑无合法着法); 排除引擎允许的"吃将"退化着
function findMate1(s) {
  for (const m of E.legalMoves(s, 'r')) {
    const u = lmake(s, m);
    if (!E.findKing(s, 'b')) { lundo(s, u); continue; } // 吃将 ≠ 将杀, 跳过
    const bs = E.legalMoves(s, 'b');
    const chk = E.isInCheck(s, 'b');
    lundo(s, u);
    if (bs.length === 0 && chk) return m;
  }
  return null;
}

// 主变: 红方首着取 findAll 强制杀(允许缓手做杀); 黑方取最顽强应着; 红方终着取真将杀。
// 返回 {line, finalT, moves:[{m,piece}]}; 若黑可逃脱或无真将杀终着则返回 null(丢弃)。
function buildLine(fen, n) {
  const s = E.createState({ fen });
  const out = []; const moveRec = [];
  let cur = n, guard = 0;
  while (cur > 0 && guard++ < 20) {
    let r;
    if (cur === 1) { r = findMate1(s); }
    else { BUDGET = 500000; r = findAll(s, cur); }
    if (!r) return null;
    const piece = s.board[r.from[1]][r.from[0]];
    out.push(E.moveNotation(s, r.from, r.to));
    moveRec.push({ m: r, piece });
    lmake(s, r);
    const bs = E.legalMoves(s, 'b');
    if (!bs.length) {
      if (!E.isInCheck(s, 'b')) return null; // 困毙非将杀, 丢弃
      out.push('#'); break;
    }
    let best = null, bestN = -1, bestCap = -1;
    for (const bm of bs) {
      const u2 = lmake(s, bm);
      let k = 0;
      for (let z = 1; z <= 4; z++) { BUDGET = 500000; if (findAll(s, z)) { k = z; break; } }
      lundo(s, u2);
      if (k === 0) return null; // 黑可逃脱 → 非强制杀
      const cap = bm.cap ? 1 : 0;
      if (k > bestN || (k === bestN && cap > bestCap)) { bestN = k; bestCap = cap; best = bm; }
    }
    out.push(E.moveNotation(s, best.from, best.to));
    lmake(s, best);
    cur--;
  }
  return { line: out.join(' '), finalT: moveRec[moveRec.length - 1].piece.t, moveRec };
}

// ---------- FEN 构造 ----------
function makeFen(guards, reds, king = [4, 0], rking = [3, 9]) {
  const g = Array.from({ length: 10 }, () => Array(9).fill(''));
  g[king[1]][king[0]] = 'k';
  for (const [t, x, y] of guards) g[y][x] = t;
  for (const [t, x, y] of reds) g[y][x] = t;
  g[rking[1]][rking[0]] = 'K';
  return g.map(row => {
    let o = '', e = 0;
    for (const c of row) { if (!c) { e++; continue; } if (e) { o += e; e = 0; } o += c; }
    if (e) o += e;
    return o;
  }).join('/') + ' r';
}

// 黑防守子池: 士(宫) / 象(河口飞边)
const guardSets = [
  [],
  [['a', 3, 0]], [['a', 5, 0]],
  [['a', 3, 0], ['a', 5, 0]],
  [['a', 4, 1]],
  [['a', 3, 0], ['a', 4, 1]], [['a', 5, 0], ['a', 4, 1]],
  [['a', 3, 0], ['a', 5, 0], ['b', 2, 0]],
  [['a', 3, 0], ['a', 5, 0], ['b', 6, 0]],
  [['a', 3, 0], ['a', 5, 0], ['b', 2, 0], ['b', 6, 0]],
  [['b', 2, 0], ['b', 6, 0]],
  [['a', 4, 1], ['b', 2, 0], ['b', 6, 0]],
];
// 红攻子组合(2-4 子), 刻意覆盖车/马/炮/兵多种搭配与数量
const combos = [
  ['N', 'C'], ['N', 'C'], ['N', 'C'], ['N', 'C'],
  ['R', 'R'], ['R', 'R'], ['R', 'R'],
  ['R', 'C'], ['R', 'C'], ['R', 'C'], ['R', 'C'],
  ['C', 'C'], ['C', 'C'], ['C', 'C'],
  ['N', 'N'], ['N', 'N'],
  ['R', 'N'], ['R', 'N'], ['R', 'N'],
  ['R', 'P'], ['R', 'P'], ['N', 'P'], ['N', 'P'],
  ['R', 'C', 'C'], ['R', 'R', 'C'], ['N', 'R', 'C'],
  ['R', 'R', 'P'], ['N', 'C', 'C'], ['C', 'C', 'P'],
  ['R', 'N', 'P'], ['N', 'N', 'C'], ['R', 'C', 'P'],
];

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function occOf(guards, king, rking) {
  const s = new Set([king[0] + ',' + king[1], rking[0] + ',' + rking[1]]);
  for (const [, x, y] of guards) s.add(x + ',' + y);
  return s;
}
function samplePositions(combo, rng, occ) {
  const ys = (t) => (t === 'P' || t === 'N') ? [1, 2, 3, 4] : [0, 1, 2, 3, 4, 5];
  const reds = []; const used = new Set(occ);
  for (const t of combo) {
    let tries = 0, x, y, key;
    do { x = Math.floor(rng() * 9); y = ys(t)[Math.floor(rng() * ys(t).length)]; key = x + ',' + y; tries++; } while (used.has(key) && tries < 90);
    if (used.has(key)) return null;
    used.add(key); reds.push([t, x, y]);
  }
  return reds;
}

// ---------- 去重签名 ----------
function fenSig(fen) {
  const rows = fen.split(' ')[0].split('/');
  const cells = [];
  rows.forEach((row, y) => {
    let x = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { x += +ch; continue; }
      cells.push(ch + '@' + x + ',' + y); x++;
    }
  });
  return cells.sort().join('|');
}
const existingSigs = new Set(PUZZLES.map(p => fenSig(p.fen)));

// ---------- 杀形分类(基于最终真将杀的真实走法) ----------
function classify(fen, reds, build) {
  const s = E.createState({ fen });
  const texts = build.line.replace(/#\s*$/, '').trim().split(/\s+/);
  const moves = [];
  for (const t of texts) {
    const m = parseOne(s, t);
    moves.push({ m, piece: s.board[m.from[1]][m.from[0]] });
    lmake(s, m);
  }
  const last = moves[moves.length - 1];
  const rp = last.piece;
  const typeSet = new Set(reds.map(r => r[0]));
  const typeCount = {}; reds.forEach(r => typeCount[r[0]] = (typeCount[r[0]] || 0) + 1);
  // 检测真正的将军子力(终着可能是闪将, 真将军的是直线上的车/炮)
  const bk = E.findKing(s, 'b');
  if (!bk) { console.error('!! no black king after replay:', fen, build.line); return '巧胜'; }
  const [kx, ky] = bk;
  let lineKind = null, screen = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let x = kx + dx, y = ky + dy, s1 = null, hit = false;
    while (x >= 0 && x <= 8 && y >= 0 && y <= 9) {
      const q = s.board[y][x];
      if (q) {
        if (!s1) { s1 = q; if (q.c === 'r' && (q.t === 'R' || q.t === 'K')) { lineKind = 'R'; hit = true; } }
        else { if (q.c === 'r' && q.t === 'C') { lineKind = 'C'; screen = s1; hit = true; } break; }
      }
      x += dx; y += dy;
    }
    if (hit) break;
  }
  const checkerKind = lineKind || rp.t; // 无直线将军则按移动子(马/兵)判定
  let name;
  if (checkerKind === 'C') {
    if (screen && screen.c === 'r') {
      if (screen.t === 'N') name = '马后炮';
      else if (screen.t === 'P') name = '送佛归殿';
      else if (screen.t === 'C') {
        const cannons = reds.filter(r => r[0] === 'C').map(r => r[2]).sort((a, b) => a - b);
        name = (cannons.length === 2 && cannons[0] <= 1 && cannons[1] >= 4) ? '天地炮' : '重炮';
      }
      else if (screen.t === 'R') name = '车炮夹攻';
      else name = '炮架巧杀';
    } else if (screen && screen.c === 'b') {
      name = '闷宫';
    } else name = '空头炮';
  } else if (checkerKind === 'R') {
    if (typeCount['R'] >= 2) name = '双车错';
    else if (kx === last.m.to[0]) name = '铁门栓';
    else if (typeSet.has('C')) name = '车炮夹攻';
    else if (typeSet.has('N')) name = '立马车';
    else if (typeSet.has('P')) name = '大胆穿心';
    else name = '铁门栓';
  } else if (checkerKind === 'N') {
    const [hx, hy] = last.m.to;
    if (typeCount['N'] >= 2) name = '双马饮泉';
    else if ((hx === 3 || hx === 5) && hy === 2) name = '挂角马';
    else if ((hx === 2 || hx === 6) && hy === 1) name = '卧槽马';
    else if ((hx === 3 || hx === 5) && hy === 3) name = '钓鱼马';
    else if (typeSet.has('P')) name = '马兵控将';
    else name = '立马车';
  } else if (checkerKind === 'P') {
    name = typeSet.has('N') ? '马兵控将' : '三进兵';
  } else name = '巧胜';
  return name;
}
function parseOne(s, text) {
  const want = canon(text);
  for (const m of E.legalMoves(s, s.turn)) {
    if (canon(E.moveNotation(s, m.from, m.to)) === want) return m;
  }
  throw new Error('cannot parse ' + text);
}
function canon(text) {
  const CN = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  return String(text).replace(/[\s\.。,，・·-]/g, '').replace(/[一二三四五六七八九]/g, ch => String(CN[ch]));
}

// ---------- 主采样: 保留现有分片, 仅定向补挂角马/双马饮泉 ----------
const EXISTING = JSON.parse(readFileSync(OUT, 'utf8'));
const found = [...EXISTING];
const bucketCount = new Map();
const seen = new Set();
for (const p of found) {
  bucketCount.set(p.name, (bucketCount.get(p.name) || 0) + 1);
  seen.add(fenSig(p.fen));
}
// 定向目标: 挂角马补到 3, 双马饮泉补到 3; 其余桶已满, 不再新增
const WANTED = { '挂角马': 3, '双马饮泉': 3 };
let samples = 0;
const rejected = { check: 0, mate1: 0, no2: 0, notMate: 0, dup: 0, wrongBucket: 0 };

function wantedFull() {
  for (const [name, t] of Object.entries(WANTED)) if ((bucketCount.get(name) || 0) < t) return false;
  return true;
}

outer:
for (let round = 0; round < 800000 && !wantedFull(); round++) {
  samples++;
  const combo = combos[round % combos.length];
  const rng = mulberry(round * 7919 + 1013);
  for (let attempt = 0; attempt < 80; attempt++) {
    const guards = guardSets[Math.floor(rng() * guardSets.length)];
    const king = [3 + Math.floor(rng() * 3), 0];
    const rking = [[3, 9], [4, 9], [5, 9]][Math.floor(rng() * 3)];
    const occ = occOf(guards, king, rking);
    const reds = samplePositions(combo, rng, occ);
    if (!reds) continue;
    const fen = makeFen(guards, reds, king, rking);
    let st; try { st = E.createState({ fen }); } catch { continue; }
    if (E.isInCheck(st, 'b') || E.isInCheck(st, 'r')) { rejected.check++; continue; }
    BUDGET = 400000;
    if (findAll(E.createState({ fen }), 1)) { rejected.mate1++; continue; }
    BUDGET = 500000;
    if (!findAll(E.createState({ fen }), 2)) { rejected.no2++; continue; }
    const build = buildLine(fen, 2);
    if (!build || !build.line.endsWith('#')) { rejected.notMate++; continue; }
    if (build.finalT === 'K') { rejected.notMate++; continue; }
    const sig = fenSig(fen);
    if (existingSigs.has(sig) || seen.has(sig)) { rejected.dup++; continue; }
    const name = classify(fen, reds, build);
    // 只收定向桶, 且未达目标
    if (!(name in WANTED) || (bucketCount.get(name) || 0) >= WANTED[name]) { rejected.wrongBucket++; continue; }
    const firstMove = build.line.split(' ')[0];
    const hint = `首着「${firstMove}」做杀，黑方任何应着均成${name}。`;
    found.push({ chapter: 'mate2', name, mate: 2, fen, hint, line: build.line });
    seen.add(sig);
    bucketCount.set(name, (bucketCount.get(name) || 0) + 1);
    console.error(`got [${name}] (${bucketCount.get(name)}/${WANTED[name]}): ${build.line}`);
    continue outer;
  }
}

console.error('\n=== 采样结束 === samples=' + samples, 'rejected=', JSON.stringify(rejected));

writeFileSync(OUT, JSON.stringify(found, null, 1), 'utf8');
console.error('written', found.length, '→', OUT);

// ---------- 落盘前读回, 重跑全部质量门 ----------
function selfCheck() {
  const data = JSON.parse(readFileSync(OUT, 'utf8'));
  let fail = 0;
  const buckets = {};
  for (const pz of data) {
    const tag = `${pz.name}`;
    if (pz.chapter !== 'mate2' || pz.mate !== 2 || !pz.fen || !pz.hint || !pz.line) { console.log(`✗ ${tag}: schema 缺字段`); fail++; continue; }
    if (pz.id !== undefined) { console.log(`✗ ${tag}: 不应有 id`); fail++; }
    let s0; try { s0 = E.createState({ fen: pz.fen }); } catch (e) { console.log(`✗ ${tag}: FEN 非法 ${e.message}`); fail++; continue; }
    if (E.isInCheck(s0, 'b') || E.isInCheck(s0, 'r')) { console.log(`✗ ${tag}: 初始被将军`); fail++; continue; }
    // 门2: 恰好两步强制杀
    BUDGET = 500000;
    if (findAll(E.createState({ fen: pz.fen }), 1)) { console.log(`✗ ${tag}: 实际是一步杀`); fail++; continue; }
    BUDGET = 500000;
    if (!findAll(E.createState({ fen: pz.fen }), 2)) { console.log(`✗ ${tag}: 无两步强制杀`); fail++; continue; }
    // 门3: line 去 # 后 playLine 全部 ok, 走完 redwin 且为真将杀
    const s = E.createState({ fen: pz.fen });
    const texts = pz.line.replace(/#\s*$/, '').trim().split(/\s+/);
    const r = playLine(s, texts);
    if (!r.ok) { console.log(`✗ ${tag}: 主变第${r.errorIndex + 1}手「${r.errorText}」非法`); fail++; continue; }
    if (s.status !== 'redwin') { console.log(`✗ ${tag}: 走完未红胜(${s.status}/${s.reason})`); fail++; continue; }
    if (s.reason !== 'checkmate') { console.log(`✗ ${tag}: 终局为${s.reason}非真将杀`); fail++; continue; }
    if (!E.findKing(s, 'b')) { console.log(`✗ ${tag}: 终局黑将被吃(退化着)`); fail++; continue; }
    buckets[pz.name] = (buckets[pz.name] || 0) + 1;
  }
  // 门4: 去重
  const sigs = new Set([...PUZZLES.map(p => fenSig(p.fen))]);
  for (const pz of data) {
    const sg = fenSig(pz.fen);
    if (sigs.has(sg)) { console.log(`✗ 重复: ${pz.name}`); fail++; }
    sigs.add(sg);
  }
  console.log('\n=== 自验结果 ===');
  console.log('局数:', data.length);
  console.log('杀形覆盖(' + Object.keys(buckets).length + '):');
  for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log(fail ? `\n❌ SELF-CHECK FAIL x${fail}` : `\n✅ SELF-CHECK ALL ${data.length} PASS`);
  process.exit(fail ? 1 : 0);
}
selfCheck();
