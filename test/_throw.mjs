import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { searchBestMovePro as proSearch } from '../js/ai-pro.js';
const rngFor=(seed,ply)=>mulberry32((seed ^ Math.imul(ply+1,2654435761))>>>0);
for (const [seed,proSide] of [[4150,'r'],[4172,'r']]){
  const s=E.createState({seed});
  while(s.status==='playing' && s.moves.length<40){
    const mv=proSearch(s,{level:5,deadline:Date.now()+900,rng:rngFor(seed,s.moves.length)});
    if(!mv){console.log(`seed${seed} 返回null @${s.moves.length}手`);break;}
    E.applyMove(s,mv.from,mv.to);
  }
}
console.log('done');
