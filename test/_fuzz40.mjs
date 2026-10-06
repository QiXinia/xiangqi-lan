import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { searchBestMovePro } from '../js/ai-pro.js';
let bad=0,n=0;
for (let g=0; g<40; g++) {
  const r=mulberry32(9000+g);
  const s=E.createState();
  for(let i=0;i<14;i++){const lm=E.legalMoves(s); if(!lm.length)break; const m=lm[Math.floor(r()*lm.length)]; E.applyMove(s,m.from,m.to);}
  if(s.status!=='playing')continue;
  n++;
  try{ const mv=searchBestMovePro(s,{level:5,deadline:Date.now()+200,noBook:true,deterministic:true});
    if(!E.legalMoves(s).some(m=>m.from[0]===mv.from[0]&&m.from[1]===mv.from[1]&&m.to[0]===mv.to[0]&&m.to[1]===mv.to[1])){bad++;console.log('非法',g);}
  }catch(e){bad++;console.log('抛错',g,e.message);}
}
console.log(`fuzz ${n} 局面, 异常 ${bad}`);
