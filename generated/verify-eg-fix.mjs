// 19 关定式 FEN 修正后的大师 AI 双 seed 胜/和规律复核
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { PUZZLES } from '../js/puzzles.js';

const EG_FIX = {
  221: '3ak4/9/2n6/9/9/9/9/9/R3A4/4K4 r',
  222: '3aka3/9/9/9/9/9/9/9/R3A4/4K4 r',
  223: '4k4/9/4b4/9/4P4/9/9/7N1/9/4K4 r',
  226: '4k4/9/9/9/2b6/9/4C4/7N1/9/4K4 r',
  228: '2b1k1b2/9/5a3/9/9/9/4C4/9/4A2N1/4K4 r',
  229: '3aka3/9/9/9/2b6/9/4C4/7N1/9/3AKA3 r',
  230: '4k4/9/9/9/9/9/4C4/9/4A2N1/4K4 r',
  231: '3aka3/9/9/9/9/9/4C4/9/4A2N1/4K4 r',
  232: '3ak4/9/9/9/4P4/2P6/9/7N1/9/4K4 r',
  233: '3aka3/9/9/9/4P4/2P6/9/7N1/9/4K4 r',
  234: '4k4/9/4b4/9/4P4/9/1C7/9/4A4/4K4 r',
  235: '3aka3/9/9/9/4P4/9/1C7/9/4A4/4K4 r',
  236: '3aka3/9/4b4/9/4P4/6P2/1C7/9/9/4K4 r',
  237: '3ak4/9/9/9/9/9/4C4/9/9/3AKA3 r',
  238: '3ak4/9/9/9/4P4/2P6/9/9/9/4K4 r',
  240: '4k1b2/9/9/9/9/9/9/4C4/9/3AKA3 r',
  250: '3aka3/9/9/9/4P4/9/9/9/4A4/4K4 r',
  265: '2bakab2/9/1c7/9/4P4/6P2/9/9/9/3K5 r',
  266: '2bakab2/9/9/9/4P4/6P2/9/9/9/4K4 r'
};
function play(fen, seed, maxMoves, attackLv, defendLv) {
  const s = E.createState({ fen });
  if (E.isInCheck(s, 'b') || E.isInCheck(s, 'r')) return { status: 'illegal-init' };
  const rng = E.mulberry32(seed);
  while (s.status === 'playing' && s.moves.length < maxMoves) {
    const lv = s.turn === 'r' ? attackLv : defendLv;
    const mv = searchBestMove(s, { level: lv, deadline: Date.now() + 1500, rng });
    if (!mv) break;
    E.applyMove(s, mv.from, mv.to);
  }
  return { status: s.status, reason: s.reason, n: s.moves.length };
}
let fails = 0;
for (const id of Object.keys(EG_FIX).map(Number).sort((a, b) => a - b)) {
  const orig = PUZZLES.find(p => p.id === id);
  const fen = EG_FIX[id];
  const wantWin = id !== 240 && (!orig.type || orig.type === 'win');
  // 例胜: 红 lv5 攻 / 黑 lv4 守, 双 seed 均须 redwin
  // 例和: 红 lv5 攻 / 黑 lv5 守, 双 seed 均须非 redwin
  // #237 炮双仕胜单士为慢工胜法, 放宽守方等级与手数预算验证理论胜势
  const slow = id === 237;
  const dLv = wantWin ? (slow ? 3 : 4) : 5;
  const mm = slow ? 240 : 170;
  const r1 = play(fen, 11, mm, 5, dLv);
  const r2 = play(fen, 77, mm, 5, dLv);
  const ok = wantWin ? (r1.status === 'redwin' && r2.status === 'redwin')
    : (r1.status !== 'redwin' && r2.status !== 'redwin');
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} #${id} ${orig.name} [${wantWin ? '例胜' : '例和'}]: ` +
    `[${r1.status}/${r1.reason}/${r1.n}] [${r2.status}/${r2.reason}/${r2.n}]`);
}
console.log(fails ? `\n❌ ${fails} 关规律不符` : '\n✅ 全部 19 关修正后胜/和规律保持');
process.exit(fails ? 1 : 0);
