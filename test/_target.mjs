// 复现指定 gameSeed/proSide 的对局, 报告终局/子差(修复后 pro)
import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { searchBestMovePro as proSearch } from '../js/ai-pro.js';
import { searchBestMove as classicSearch } from './ai-baseline.mjs';
const MS = Number(process.env.MS||900);
const VAL = { K:60000,A:200,B:200,N:400,R:900,C:450,P:100 };
function matDiff(s){let r=0,b=0;for(let y=0;y<=9;y++)for(let x=0;x<=8;x++){const p=s.board[y][x];if(!p)continue;const v=p.hidden?200:VAL[p.t];if(p.c==='r')r+=v;else b+=v;}return r-b;}
const rngFor=(seed,ply)=>mulberry32((seed ^ Math.imul(ply+1,2654435761))>>>0);
// targets: seed/proSide
const T = JSON.parse(process.env.TARGETS || '[[4043,"b",63],]');
for (const [seed,proSide,crashMove] of T){
  const s=E.createState({seed});
  let illegal=0,threw=0;
  while(s.status==='playing' && s.moves.length<240){
    const isPro=s.turn===proSide; let mv;
    try{ mv=(isPro?proSearch:classicSearch)(s,{level:5,deadline:Date.now()+MS,rng:rngFor(seed,s.moves.length)}); }
    catch(e){ threw++; break; }
    E.applyMove(s,mv.from,mv.to);
  }
  let md=matDiff(s); if(proSide==='b') md=-md;
  let res = threw?'THREW' : (s.status==='playing'||s.status==='draw')?'D' : ((s.status==='redwin'?'r':'b')===proSide?'W':'L');
  console.log(`seed=${seed} pro=${proSide} 原崩@${crashMove}手 -> 终局:${res} ${s.moves.length}手 子差(pro)=${md} ${s.status}/${s.reason||''} threw=${threw}`);
}
