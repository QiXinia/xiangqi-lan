import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
{
  const s = E.createState({ fen: '4k4/9/4N4/9/5C3/9/9/9/9/3K5 r' });
  const mv = searchBestMove(s, { level: 3, deadline: Date.now()+2000, noBook:true });
  console.log('一步杀:', mv.from, '->', mv.to, 'score', mv.score);
}
{
  const s = E.createState();
  E.applyMove(s,[7,7],[4,7]); E.applyMove(s,[1,2],[4,2]); E.applyMove(s,[7,9],[6,7]);
  const mv = searchBestMove(s, { level: 5, deadline: Date.now()+1500, noBook:true });
  const legal = E.legalMoves(s).some(m=>m.from[0]===mv.from[0]&&m.from[1]===mv.from[1]&&m.to[0]===mv.to[0]&&m.to[1]===mv.to[1]);
  console.log('中局合法:', legal, mv.from,'->',mv.to, 'depth', mv.depth, 'nodes', mv.nodes);
}
