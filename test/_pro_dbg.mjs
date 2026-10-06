import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { searchBestMovePro } from '../js/ai-pro.js';
const rngFor=(s,ply)=>mulberry32((s ^ Math.imul(ply+1,2654435761))>>>0);
for (const seed of [3001]) {
  const s = E.createState({seed});
  while (s.status==='playing' && s.moves.length<240) {
    let mv;
    try { mv = searchBestMovePro(s,{level:5,deadline:Date.now()+700,rng:rngFor(seed,s.moves.length)}); }
    catch(e){ console.log('抛错 at ply', s.moves.length, 'turn', s.turn); console.log(e.stack); break; }
    E.applyMove(s,mv.from,mv.to);
  }
  console.log('终态', s.status, s.reason, '手数', s.moves.length);
}
