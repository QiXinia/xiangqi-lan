// 实用残局定式胜/和规律验证: 例胜局 lv5红攻 lv4黑守须红胜; 例和局 lv5红攻 lv4黑守须红不胜
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';

const WINS = [
  ['马擒单士', '3ak4/9/9/9/9/9/9/7N1/9/3K5 r'],
  ['炮仕胜双士', '3aka3/9/9/9/9/9/9/4C4/9/3AKA2 r'],
  ['单车胜双士', '3aka3/9/9/9/9/9/9/9/R8/3K5 r'],
  ['单车胜单马', '4k4/9/2n6/9/9/9/9/9/R8/3K5 r'],
  ['单车胜单炮', '4k4/9/2c6/9/9/9/9/9/R8/3K5 r'],
  ['海底捞月', '3k5/3r5/9/9/9/9/9/4R4/9/2C1K4 r'],
  ['马兵胜单士', '4ka3/9/9/9/4P4/9/7N1/9/9/3K5 r'],
  ['高低兵胜双士', '3aka3/9/4P4/9/3P5/9/9/9/9/3K5 r'],
  ['炮兵仕胜单士', '3ak4/9/9/9/4P4/9/4C4/9/4A4/4K4 r'],
  ['车兵胜双士', '3aka3/9/4P4/9/9/9/9/9/R8/3K5 r']
];
const DRAWS = [
  ['士象全和单车', '2bakab2/9/9/9/9/9/9/9/R8/3K5 r'],
  ['单马难胜光将', '4k4/9/9/9/9/9/9/7N1/9/3K5 r'],
  ['孤炮难胜光将', '4k4/9/9/9/9/9/9/4C4/9/3K5 r'],
  ['单兵难胜双士', '3aka3/9/9/4P4/9/9/9/9/9/3K5 r']
];

function play(fen, seed, maxMoves) {
  const s = E.createState({ fen });
  if (E.isInCheck(s, 'b') || E.isInCheck(s, 'r')) return { status: 'illegal-init' };
  const rng = E.mulberry32(seed);
  while (s.status === 'playing' && s.moves.length < maxMoves) {
    const lv = s.turn === 'r' ? 5 : 4;
    const mv = searchBestMove(s, { level: lv, deadline: Date.now() + 1200, rng });
    if (!mv) break;
    E.applyMove(s, mv.from, mv.to);
  }
  return { status: s.status, reason: s.reason, n: s.moves.length };
}

console.log('== 例胜(期望 redwin) ==');
for (const [name, fen] of WINS) {
  const r1 = play(fen, 11, 150), r2 = play(fen, 22, 150);
  const ok = r1.status === 'redwin' && r2.status === 'redwin';
  console.log(`${ok ? '✓' : '✗'} ${name}: [${r1.status}/${r1.reason}/${r1.n}] [${r2.status}/${r2.reason}/${r2.n}]`);
}
console.log('== 例和(期望 非redwin) ==');
for (const [name, fen] of DRAWS) {
  const r1 = play(fen, 11, 130), r2 = play(fen, 22, 130);
  const ok = r1.status !== 'redwin' && r2.status !== 'redwin';
  console.log(`${ok ? '✓' : '✗'} ${name}: [${r1.status}/${r1.reason}/${r1.n}] [${r2.status}/${r2.reason}/${r2.n}]`);
}
