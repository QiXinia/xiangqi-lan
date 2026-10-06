// 临时调试: 给定 FEN 与着法序列, 回放并打印首个失败点/终局
import * as E from '../../js/engine.js';
import { playLine } from '../../js/notation.js';

const nm = { r: { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' },
             b: { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' } };
export function show(s) {
  for (let y = 0; y <= 9; y++) {
    let row = y + ' ';
    for (let x = 0; x <= 8; x++) { const p = s.board[y][x]; row += (p ? nm[p.c][p.t] : '.') + ' '; }
    console.log(row);
  }
  console.log('turn', s.turn, 'status', s.status, s.reason);
}
export function test(fen, moves, verbose = true) {
  const s = E.createState({ fen });
  const r = playLine(s, moves);
  if (verbose) {
    console.log('FEN:', fen);
    console.log('ok=', r.ok, 'errIdx=', r.errorIndex, 'errText=', r.errorText,
      'plies=', s.moves.length, 'status=', s.status, s.reason);
    if (!r.ok) show(s);
  }
  return { s, r };
}
