// 通用探测：对传入 FEN 列表跑 AI 多 seed 自弈，打印每局每 seed 的 plies/status/reason。
// 用法:
//   WIN_MS=1500 ATK_MS=1200 DEF_MS=900 SEEDS=3 WIN_CAP=220 DRAW_CAP=86 CAND='[...]' node generated/new/probe-theorem.mjs
// win : 红强方 vs 黑防守, 双方均用 WIN_MS, 红须在 WIN_CAP 内 redwin
// draw: 红强攻用 ATK_MS, 黑弱方守用 DEF_MS, 黑须守满 DRAW_CAP 不被 redwin
import * as E from '../../js/engine.js';
import { searchBestMove } from '../../js/ai.js';

const num = (v, d) => (v == null || v === '' ? d : Number(v));
const WIN_MS = num(process.env.WIN_MS, 1500);
const ATK_MS = num(process.env.ATK_MS, 1200);   // draw: 红强攻每手
const DEF_MS = num(process.env.DEF_MS, 900);    // draw: 黑弱方每手
const SEEDS = num(process.env.SEEDS, 3);
const WIN_CAP = num(process.env.WIN_CAP, 220);
const DRAW_CAP = num(process.env.DRAW_CAP, 86);

const CAND = JSON.parse(process.env.CAND || '[]');

function isLegal(s, mv) {
  if (!mv) return false;
  return E.legalMoves(s).some(m => m.from[0]===mv.from[0] && m.from[1]===mv.from[1] && m.to[0]===mv.to[0] && m.to[1]===mv.to[1]);
}
function playOne(pz, seed) {
  const s = E.createState({ fen: pz.fen });
  const rng = E.mulberry32((seed * 2654435761 + 17) >>> 0);
  const cap = pz.type === 'win' ? WIN_CAP : DRAW_CAP;
  while (s.status === 'playing' && s.moves.length < cap) {
    // 轮到谁走决定思考时长
    let ms;
    if (pz.type === 'win') ms = WIN_MS;
    else ms = (s.turn === 'r') ? ATK_MS : DEF_MS;
    let mv;
    try { mv = searchBestMove(s, { level: 5, deadline: Date.now() + ms, noBook: true, rng }); }
    catch (e) { return { result: 'ILLEGAL', why: e.message, plies: s.moves.length }; }
    if (!isLegal(s, mv)) return { result: 'ILLEGAL', why: 'illegal', plies: s.moves.length };
    E.applyMove(s, mv.from, mv.to);
  }
  const plies = s.moves.length;
  if (pz.type === 'win') return s.status === 'redwin' ? { result: 'PASS', plies } : { result: 'FAIL', status: s.status, reason: s.reason, plies };
  return s.status === 'redwin' ? { result: 'FAIL', status: s.status, reason: s.reason, plies }
    : { result: 'PASS', status: s.status, reason: s.reason, plies };
}

for (const pz of CAND) {
  const reps = [];
  for (let sd = 1; sd <= SEEDS; sd++) reps.push(playOne(pz, sd));
  const ok = reps.every(r => r.result === 'PASS');
  console.log(`${ok?'✓':'✗'} [${pz.type==='win'?'例胜':'守和'}] ${pz.name}`);
  console.log(`   ${pz.fen}`);
  console.log(`   reps: ${JSON.stringify(reps)}`);
}
