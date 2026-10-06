// mate 残局非法 FEN 自动修复: 枚举合法化修正(移动到同类合法位/删除超编子),
// 每个候选经引擎静态校验 + 强制杀重算, 择优; 无法修复则剔除。输出 fixed-mate.json / drops
import * as E from '../js/engine.js';
import { playLine } from '../js/notation.js';
import { PUZZLES } from '../js/puzzles.js';
import fs from 'fs';

const ROOT = '/home/user/Doubao/chats/38444973861070338/xiangqi-lan';

// ---------- 板级 FEN ----------
function parseBoard(fen) {
  const rows = fen.trim().split(/\s+/)[0].split('/');
  const b = Array.from({ length: 10 }, () => Array(9).fill(null));
  rows.forEach((row, y) => {
    let x = 0;
    for (const ch of row) { if (/\d/.test(ch)) { x += +ch; continue; } b[y][x] = ch; x++; }
  });
  return b;
}
function boardFen(b, turn = 'r') {
  const rows = [];
  for (let y = 0; y < 10; y++) {
    let r = '', e = 0;
    for (let x = 0; x < 9; x++) { const c = b[y][x]; if (!c) { e++; continue; } if (e) { r += e; e = 0; } r += c; }
    if (e) r += e;
    rows.push(r);
  }
  return rows.join('/') + ' ' + turn;
}
const PSET = (a) => new Set(a.map(([x, y]) => x + ',' + y));
const SITES = {
  K: { r: PSET([[3,9],[4,9],[5,9],[3,8],[4,8],[5,8],[3,7],[4,7],[5,7]]), b: PSET([[3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]]) },
  A: { r: PSET([[3,9],[5,9],[4,8],[3,7],[5,7]]), b: PSET([[3,0],[5,0],[4,1],[3,2],[5,2]]) },
  B: { r: PSET([[2,9],[6,9],[0,7],[4,7],[8,7],[2,5],[6,5]]), b: PSET([[2,0],[6,0],[0,2],[4,2],[8,2],[2,4],[6,4]]) }
};
const EVENS = new Set([0, 2, 4, 6, 8]);
const CAP = { K: 1, A: 2, B: 2, N: 2, R: 2, C: 2, P: 5 };
const isR = (ch) => ch === ch.toUpperCase();
const siteOK = (t, c, x, y) => {
  const key = x + ',' + y;
  if (t === 'K' || t === 'A' || t === 'B') return SITES[t][c].has(key);
  if (t === 'P') {
    if (c === 'r') return y <= 6 && (y <= 4 || EVENS.has(x));
    return y >= 3 && (y >= 5 || EVENS.has(x));
  }
  return true;
};
// 返回问题列表: [{t,c,x,y,kind:'site'}] 与数量问题
function audit(b) {
  const issues = [];
  const cnt = { r: {}, b: {} };
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const ch = b[y][x]; if (!ch || ch === 'x' || ch === 'o') continue;
    const t = ch.toUpperCase(), c = isR(ch) ? 'r' : 'b';
    cnt[c][t] = (cnt[c][t] || 0) + 1;
    if (!siteOK(t, c, x, y)) issues.push({ t, c, x, y });
  }
  const over = [];
  for (const c of ['r', 'b']) for (const t in CAP) if ((cnt[c][t] || 0) > CAP[t])
    over.push({ t, c, n: cnt[c][t], max: CAP[t] });
  return { issues, over, cnt };
}
function engineOK(fen) {
  try {
    const s = E.createState({ fen });
    if (!E.findKing(s, 'r') || !E.findKing(s, 'b')) return false;
    if (s.turn !== 'r') return false;
    if (E.isInCheck(s, 'b')) return false; // 轮红但黑正被将
    if (E.isInCheck(s, 'r')) return false; // 红首着被迫解将
    if (!E.legalMoves(s, 'r').length || !E.legalMoves(s, 'b').length) return false;
    return true;
  } catch (e) { return false; }
}

// ---------- 强制杀求解(同 merge.mjs) ----------
let NODES = 0, BUDGET = 900000;
const B = Symbol('b');
function mk(s, m) { const [fx, fy] = m.from, [tx, ty] = m.to; const p = s.board[fy][fx], cap = s.board[ty][tx]; s.board[ty][tx] = p; s.board[fy][fx] = null; s.turn = s.turn === 'r' ? 'b' : 'r'; return { p, cap, fx, fy, tx, ty }; }
function un(s, u) { s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap; s.turn = s.turn === 'r' ? 'b' : 'r'; }
function findAll(s, n) {
  for (const m of E.legalMoves(s, 'r')) {
    if (++NODES > BUDGET) throw B;
    const u = mk(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) { good = true; for (const bm of bs) { const u2 = mk(s, bm); const r = findAll(s, n - 1); un(s, u2); if (!r) { good = false; break; } } }
    un(s, u);
    if (good) return m;
  }
  return null;
}
function bestline(fen, n) {
  const s = E.createState({ fen }); const out = []; let cur = n, g = 0;
  while (cur > 0 && g++ < 20) {
    let r; NODES = 0; try { r = findAll(s, cur); } catch (e) { if (e !== B) throw e; r = null; }
    if (!r) return null;
    out.push(E.moveNotation(s, r.from, r.to)); mk(s, r);
    const bs = E.legalMoves(s, 'b');
    if (!bs.length) { out.push('#'); return out.join(' '); }
    let best = null, bn = -1;
    for (const bm of bs) { const u2 = mk(s, bm); let k = 0; try { for (let z = 1; z <= cur - 1; z++) { NODES = 0; if (findAll(s, z)) { k = z; break; } } } catch (e) { if (e !== B) throw e; k = k || 0; } un(s, u2); if (k === 0) { best = bm; break; } if (k > bn) { bn = k; best = bm; } }
    out.push(E.moveNotation(s, best.from, best.to)); mk(s, best); cur--;
  }
  return null;
}
function solve(fen, target) {
  // 依次试 target, target-1, target+1 ... 找步数最接近 target 的强制杀
  const order = [0, -1, 1, -2, 2].map(d => target + d).filter(n => n >= 1 && n <= 6);
  for (const n of order) {
    NODES = 0; let r = null;
    try { r = findAll(E.createState({ fen }), n); } catch (e) { if (e !== B) throw e; continue; }
    if (r) { const line = bestline(fen, n); if (line) return { mate: n, line, delta: Math.abs(n - target) }; }
  }
  return null;
}
function lineVerify(fen, line) {
  const s = E.createState({ fen });
  const texts = line.replace(/\s*#\s*$/, '').split(/\s+/).filter(Boolean);
  const r = playLine(s, texts);
  return r.ok && s.status === 'redwin';
}

// ---------- 候选修正动作 ----------
function targetSites(b, t, c, x, y) {
  // 同类合法空点, 按距原位曼哈顿距离排序
  let sites = [];
  if (t === 'K' || t === 'A' || t === 'B') sites = [...SITES[t][c]].map(k => k.split(',').map(Number));
  else if (t === 'P') {
    if (c === 'r') { for (let yy = 0; yy <= 6; yy++) for (let xx = 0; xx <= 8; xx++) if (siteOK('P', c, xx, yy)) sites.push([xx, yy]); }
    else { for (let yy = 3; yy <= 9; yy++) for (let xx = 0; xx <= 8; xx++) if (siteOK('P', c, xx, yy)) sites.push([xx, yy]); }
  }
  return sites.filter(([xx, yy]) => !b[yy][xx]).sort((a, c2) => (Math.abs(a[0] - x) + Math.abs(a[1] - y)) - (Math.abs(c2[0] - x) + Math.abs(c2[1] - y)));
}
function clone(b) { return b.map(r => r.slice()); }

function fixOne(pz) {
  const b0 = parseBoard(pz.fen);
  const { issues, over } = audit(b0);
  // BFS: 状态=[board, 已改动列表, 代价]
  let states = [{ b: b0, moves: [], cost: 0 }];
  const allBad = [...issues];
  // 超编: 把同类型多余子也加入待处理(优先移动非法子; 若处理完位置问题仍超编, 再删)
  for (let depth = 0; depth < 6; depth++) {
    const next = [];
    let anyBad = false;
    for (const st of states) {
      const au = audit(st.b);
      if (!au.issues.length && !au.over.length) { next.push(st); continue; }
      anyBad = true;
      // 选第一个问题处理
      let job = null;
      if (au.issues.length) {
        const it = au.issues[0]; job = { kind: 'site', t: it.t, c: it.c, x: it.x, y: it.y };
      } else {
        const o = au.over[0];
        // 找一个该类型子删除(优先删"对红杀法影响小"的黑方防守子; 红方超编罕见)
        const cells = [];
        for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) { const ch = st.b[y][x]; if (ch && ch.toUpperCase() === o.t && isR(ch) === (o.c === 'r')) cells.push([x, y]); }
        for (const [x, y] of cells) {
          const nb = clone(st.b); nb[y][x] = null;
          next.push({ b: nb, moves: [...st.moves, `删${o.t}@${x},${y}`], cost: st.cost + 5 });
        }
        continue;
      }
      const ch = st.b[job.y][job.x];
      const sites = targetSites(st.b, job.t, job.c, job.x, job.y).slice(0, 6);
      for (const [tx, ty] of sites) {
        const nb = clone(st.b); nb[ty][tx] = ch; nb[job.y][job.x] = null;
        next.push({ b: nb, moves: [...st.moves, `${ch}(${job.x},${job.y})→(${tx},${ty})`], cost: st.cost + Math.abs(tx - job.x) + Math.abs(ty - job.y) });
      }
      // 若该方该类超编, 也允许直接删除此子
      const cntNow = audit(st.b).cnt[job.c][job.t] || 0;
      if (cntNow > CAP[job.t]) { const nb = clone(st.b); nb[job.y][job.x] = null; next.push({ b: nb, moves: [...st.moves, `删${ch}@${job.x},${job.y}`], cost: st.cost + 5 }); }
    }
    // 去重 + 限量
    const seen = new Set();
    states = [];
    next.sort((a, c2) => a.cost - c2.cost);
    for (const st of next) { const k = boardFen(st.b); if (seen.has(k)) continue; seen.add(k); if (states.length < 120) states.push(st); }
    if (!anyBad) break;
    if (!states.length) break;
  }
  // 合法终态
  const finals = states.filter(st => { const au = audit(st.b); return !au.issues.length && !au.over.length; });
  const cands = [];
  for (const st of finals) {
    const fen = boardFen(st.b, 'r');
    if (!engineOK(fen)) continue;
    cands.push({ fen, moves: st.moves, cost: st.cost });
  }
  // 按改动代价排序后依次求杀, 取首个步数最接近原关的
  cands.sort((a, c2) => a.cost - c2.cost);
  let best = null;
  for (const cd of cands.slice(0, 40)) {
    let r;
    try { r = solve(cd.fen, pz.mate); } catch (e) { if (e === B) continue; throw e; }
    if (r && lineVerify(cd.fen, r.line)) {
      const score = r.delta * 100 + cd.cost;
      if (!best || score < best.score) best = { ...cd, ...r, score };
      if (r.delta === 0) break;
    }
  }
  return best;
}

// ---------- 主流程 ----------
const fixed = [], drops = [];
const bads = PUZZLES.filter(p => p.chapter !== 'endgame' && (() => {
  const b = parseBoard(p.fen); const { issues, over } = audit(b);
  // 引擎层问题也算(初始将军)
  let engBad = false;
  try { const s = E.createState({ fen: p.fen }); engBad = E.isInCheck(s, 'b') || E.isInCheck(s, 'r') || !E.legalMoves(s, 'r').length; } catch (e) { engBad = true; }
  return issues.length || over.length || engBad;
})());
console.log('待修复 mate 局:', bads.length);
let i = 0;
for (const pz of bads) {
  i++;
  process.stdout.write(`[${i}/${bads.length}] #${pz.id} ${pz.name} ... `);
  const r = fixOne(pz);
  if (r) {
    const chapter = r.mate >= 5 ? 'mate5p' : 'mate' + r.mate;
    fixed.push({ id: pz.id, name: pz.name, chapter, mate: r.mate, fen: r.fen, hint: pz.hint, line: r.line, fixes: r.moves });
    console.log(`修复✓ mate${pz.mate}→${r.mate} [${r.moves.join('; ')}]`);
  } else { drops.push({ id: pz.id, name: pz.name, fen: pz.fen }); console.log('无法修复, 剔除✗'); }
}
fs.writeFileSync(ROOT + '/generated/fixed-mate.json', JSON.stringify(fixed, null, 1));
fs.writeFileSync(ROOT + '/generated/fixed-drops.json', JSON.stringify(drops, null, 1));
console.log(`\n修复 ${fixed.length} 关, 剔除 ${drops.length} 关`);
