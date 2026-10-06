import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { searchBestMovePro } from '../js/ai-pro.js';
const fen='9/3kr4/3c5/3R5/2PC5/9/9/9/9/2B1KA3 r - - 0 1';
let bad=0;
for(let i=0;i<10;i++){
  const s=E.createState({fen});
  try{ searchBestMovePro(s,{level:5,deadline:Date.now()+900,rng:mulberry32(i*7+1)}); }
  catch(e){ bad++; console.log('THROW',e.name,e.message); }
}
console.log('FEN复现10次 bad=',bad);
// seed4042
const rng=(seed,ply)=>mulberry32((seed^Math.imul(ply+1,2654435761))>>>0);
for(let t=0;t<3;t++){
  const s=E.createState({seed:4042});
  let n=0;
  while(s.status==='playing'&&s.moves.length<140){
    const mv=searchBestMovePro(s,{level:5,deadline:Date.now()+900,rng:rng(4042,s.moves.length)});
    if(!mv)break; E.applyMove(s,mv.from,mv.to); n++;
  }
  console.log('seed4042 run',t,'end',s.status,n,'手');
}
