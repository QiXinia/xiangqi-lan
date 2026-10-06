import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { searchBestMovePro as proSearch } from '../js/ai-pro.js';
import { searchBestMove as classicSearch } from './ai-baseline.mjs';
const MS=900;
const rngFor=(seed,ply)=>mulberry32((seed ^ Math.imul(ply+1,2654435761))>>>0);
const gameSeed=2040, proSide="r";
const s=E.createState({seed:gameSeed});
while(s.status==='playing' && s.moves.length<240){
  const isPro=s.turn===proSide;
  let mv;
  try{ mv=(isPro?proSearch:classicSearch)(s,{level:5,deadline:Date.now()+MS,rng:rngFor(gameSeed,s.moves.length)}); }
  catch(e){ console.log('THREW at move',s.moves.length,e.message); break; }
  const lm=E.legalMoves(s);
  const ok = mv && lm.some(m=>m.from[0]===mv.from[0]&&m.from[1]===mv.from[1]&&m.to[0]===mv.to[0]&&m.to[1]===mv.to[1]);
  if(!ok){ console.log(`ILLEGAL/NULL @${s.moves.length} side=${s.turn} mv=${JSON.stringify(mv)} status=${s.status} legalCount=${lm.length} FEN=${E.toFEN(s)}`); break; }
  E.applyMove(s,mv.from,mv.to);
}
console.log('end',s.status,s.moves.length);
