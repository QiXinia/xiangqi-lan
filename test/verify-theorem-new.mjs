// ============================================================
// 新增例胜/例和定式的「产品真实 AI」多 seed 复核(后台):
//   node test/verify-theorem-new.mjs
//   win : 红=大师强方 必须在 cap 内战胜 黑=大师防守, 且每个 seed 都胜
//   draw: 红=大师强方进攻, 黑(弱方)必须守满 40+ 回合不被红胜, 每个 seed 都守住
// 只读 generated/new/theorem-endgames.mjs, 输出 test/logs/theorem-new.json
// 环境变量: WIN_MS / DEF_MS / SEEDS / WIN_CAP / DRAW_CAP / QUIET
// ============================================================
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { mulberry32 } from '../js/engine.js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const num = (v, d) => (v == null || v === '' ? d : Number(v));
const WIN_MS = num(process.env.WIN_MS, 900);     // 例胜局每手
const DEF_MS = num(process.env.DEF_MS, 1100);    // 守和局每手(防守方稍强更严)
const SEEDS = num(process.env.SEEDS, 3);
const WIN_CAP = num(process.env.WIN_CAP, 150);   // 例胜 ply 上限
const DRAW_CAP = num(process.env.DRAW_CAP, 86);  // 守和须守满的 ply(>40 回合=80)

const fragUrl = pathToFileURL(path.join(ROOT, 'generated/new/theorem-endgames.mjs')).href + '?t=' + Date.now();
const frag = await import(fragUrl);
// 分片: SLICE=i/n 只处理 index % n === i 的局, 便于多核并行
const SLICE = process.env.SLICE || '';
let sliceTag = '';
const LIST = !SLICE ? frag.NEW_PUZZLES : (() => {
  const [i, n] = SLICE.split('/').map(Number); sliceTag = '-' + i;
  return frag.NEW_PUZZLES.filter((_, idx) => idx % n === i);
})();

function isLegal(s, mv) {
  if (!mv) return false;
  return E.legalMoves(s).some(m => m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
}
function playOne(pz, seed) {
  const s = E.createState({ fen: pz.fen });
  const cap = pz.type === 'win' ? WIN_CAP : DRAW_CAP;
  const ms = pz.type === 'win' ? WIN_MS : DEF_MS;
  const rng = mulberry32((seed * 2654435761 + 17) >>> 0);
  while (s.status === 'playing' && s.moves.length < cap) {
    let mv;
    try { mv = searchBestMove(s, { level: 5, deadline: Date.now() + ms, noBook: true, rng }); }
    catch (e) { return { result: 'ILLEGAL', why: e.message, plies: s.moves.length }; }
    if (!isLegal(s, mv)) return { result: 'ILLEGAL', why: 'illegal-move', plies: s.moves.length };
    E.applyMove(s, mv.from, mv.to);
  }
  const plies = s.moves.length;
  if (pz.type === 'win') {
    return s.status === 'redwin' ? { result: 'PASS', plies } : { result: 'FAIL', status: s.status, reason: s.reason, plies };
  }
  // draw: 红(强方)未能在 cap 内获胜即视为守住
  return s.status === 'redwin' ? { result: 'FAIL', status: s.status, reason: s.reason, plies }
    : { result: 'PASS', status: s.status, plies };
}

const results = [];
for (const pz of LIST) {
  const reps = [];
  for (let sd = 1; sd <= SEEDS; sd++) reps.push(playOne(pz, sd));
  const ok = reps.every(r => r.result === 'PASS');
  results.push({ name: pz.name, type: pz.type, pass: ok, reps });
  const tag = (pz.type === 'win' ? '[例胜] ' : '[守和] ') + pz.name;
  if (ok) console.log(`✓ ${tag}  ${reps.map(r => r.plies + 'ply').join(', ')}`);
  else console.log(`✗ ${tag}  ${JSON.stringify(reps)}`);
}
const wins = results.filter(r => r.type === 'win');
const draws = results.filter(r => r.type === 'draw');
const wp = wins.filter(r => r.pass).length, dp = draws.filter(r => r.pass).length;
console.log(`\n例胜 ${wp}/${wins.length} 多 seed 必胜；守和 ${dp}/${draws.length} 多 seed 守满`);
const failed = results.filter(r => !r.pass).map(r => ({ name: r.name, type: r.type, reps: r.reps }));
fs.mkdirSync(path.join(ROOT, 'test/logs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test/logs/theorem-new' + sliceTag + '.json'), JSON.stringify({ SLICE: SLICE || 'all', WIN_MS, DEF_MS, SEEDS, wp, w: wins.length, dp, d: draws.length, failed }, null, 1));
console.log('明细 test/logs/theorem-new.json');
process.exit(failed.length ? 1 : 0);
