import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { mulberry32 } from '../js/engine.js';
let bad=0, n=0;
for (let g=0; g<60; g++) {
  const r = mulberry32(9000+g);
  const s = E.createState();
  for (let i=0;i<12;i++){ const lm=E.legalMoves(s); if(!lm.length) break; const mv=lm[Math.floor(r()*lm.length)]; E.applyMove(s,mv.from,mv.to); }
  if (s.status!=='playing') continue;
  n++;
  try {
    const mv = searchBestMove(s,{level:5,deadline:Date.now()+300,noBook:true,deterministic:true});
    if (!E.legalMoves(s).some(m=>m.from[0]===mv.from[0]&&m.from[1]===mv.from[1]&&m.to[0]===mv.to[0]&&m.to[1]===mv.to[1])){ bad++; console.log('非法!', g); }
  } catch(e){ bad++; console.log('抛错', g, e.message); }
}
console.log(`fuzz ${n} 局面, 异常 ${bad}`);
