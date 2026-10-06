// 对 puzzle-check 报"标注步数偏长"的关, 以任意强制杀穷举重算最短步数与主变, 产出 recut.json
// 用法: node generated/recut.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../js/engine.js';
import { PUZZLES } from '../js/puzzles.js';
import { playLine } from '../js/notation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDS = [117, 119, 120, 121, 132, 136, 147, 151, 166, 189];

function mk(s, m) {
  const [fx, fy] = m.from, [tx, ty] = m.to;
  const p = s.board[fy][fx], cap = s.board[ty][tx];
  s.board[ty][tx] = p; s.board[fy][fx] = null;
  s.turn = s.turn === 'r' ? 'b' : 'r';
  return { p, cap, fx, fy, tx, ty };
}
function un(s, u) {
  s.board[u.fy][u.fx] = u.p; s.board[u.ty][u.tx] = u.cap;
  s.turn = s.turn === 'r' ? 'b' : 'r';
}
let NODES = 0; const CAP = 6_000_000; const B = Symbol('b');
function findAll(s, n) {
  for (const m of E.legalMoves(s, 'r')) {
    if (++NODES > CAP) throw B;
    const u = mk(s, m);
    const bs = E.legalMoves(s, 'b');
    let good = bs.length === 0;
    if (!good && n > 1) { good = true; for (const bm of bs) { const u2 = mk(s, bm); const r = findAll(s, n - 1); un(s, u2); if (!r) { good = false; break; } } }
    un(s, u);
    if (good) return m;
  }
  return null;
}
function shortest(fen, max = 5) {
  for (let n = 1; n <= max; n++) { NODES = 0; let r = null; try { r = findAll(E.createState({ fen }), n); } catch (e) { if (e !== B) throw e; return null; } if (r) return n; }
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
    for (const bm of bs) {
      const u2 = mk(s, bm); let k = 0;
      try { for (let z = 1; z <= cur - 1; z++) { NODES = 0; if (findAll(s, z)) { k = z; break; } } } catch (e) { if (e !== B) throw e; k = k || 0; }
      un(s, u2);
      if (k === 0) { best = bm; break; }
      if (k > bn) { bn = k; best = bm; }
    }
    out.push(E.moveNotation(s, best.from, best.to)); mk(s, best); cur--;
  }
  return null;
}
function lineVerify(fen, line) {
  const s = E.createState({ fen });
  const texts = line.replace(/\s*#\s*$/, '').split(/\s+/).filter(Boolean);
  const r = playLine(s, texts);
  return r.ok && s.status === 'redwin';
}

const patch = {};
for (const id of IDS) {
  const pz = PUZZLES.find(p => p.id === id);
  if (!pz) { console.error('missing', id); process.exit(1); }
  const n = shortest(pz.fen, 5);
  if (!n) { console.error(`#${id} ${pz.name} 重算失败(超预算)`); process.exit(1); }
  const line = bestline(pz.fen, n);
  if (!line || !lineVerify(pz.fen, line)) { console.error(`#${id} ${pz.name} 主变失败`); process.exit(1); }
  const chapter = n === 1 ? 'mate1' : n === 2 ? 'mate2' : n === 3 ? 'mate3' : 'mate4';
  patch[pz.fen] = { mate: n, chapter, line };
  console.log(`#${id} ${pz.name}: ${pz.chapter}(${pz.mate}步) -> ${chapter}(${n}步)  ${line}`);
}
fs.writeFileSync(path.join(__dirname, 'recut.json'), JSON.stringify(patch, null, 1));
console.log('写出 recut.json,', Object.keys(patch).length, '关');
