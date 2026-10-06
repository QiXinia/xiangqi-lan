import * as E from '../js/engine.js';
import { searchBestMovePro } from '../js/ai-pro.js';
import { mulberry32 } from '../js/engine.js';
// 初始局面
let s = E.createState();
let mv = searchBestMovePro(s, { level: 5, deadline: Date.now()+800, noBook:true, deterministic:true });
console.log('初始:', mv.from, '-', mv.to, 'depth', mv.depth, 'nodes', mv.nodes);
// 合法性
const lm = E.legalMoves(s);
console.log('合法?', lm.some(m=>m.from[0]===mv.from[0]&&m.from[1]===mv.from[1]&&m.to[0]===mv.to[0]&&m.to[1]===mv.to[1]));
// 随机局面 fuzz 40
let bad=0;
for (let g=0; g<40; g++) {
  const r = mulberry32(100+g);
  const t = E.createState();
  for (let i=0;i<10;i++){ const ll=E.legalMoves(t); if(!ll.length) break; const m2=ll[Math.floor(r()*ll.length)]; E.applyMove(t,m2.from,m2.to); }
  if (t.status!=='playing') continue;
  try {
    const m3 = searchBestMovePro(t,{level:5,deadline:Date.now()+250,noBook:true,deterministic:true});
    if (!E.legalMoves(t).some(m=>m.from[0]===m3.from[0]&&m.from[1]===m3.from[1]&&m.to[0]===m3.to[0]&&m.to[1]===m3.to[1])){bad++;console.log('非法',g);}
  } catch(e){bad++;console.log('抛错',g,e.message);}
}
console.log('fuzz40 异常', bad);
// 对称性
const s1 = E.createState({fen:'3k5/9/9/9/9/9/4R4/9/9/3K5 r'});
const m1 = searchBestMovePro(s1,{level:5,deadline:Date.now()+500,noBook:true,deterministic:true});
console.log('杀局首选', m1.from,'-',m1.to,'score',m1.score);
