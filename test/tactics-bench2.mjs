// 攻防战术命中率: pro vs classic 对照
// node test/tactics-bench2.mjs  环境: MS=500
import * as E from '../js/engine.js';
import { searchBestMovePro } from '../js/ai-pro.js';
import { searchBestMove } from './ai-baseline.mjs';

const MS = Number(process.env.MS||500);
// 每题: fen + 期望正确着([fx,fy,tx,ty]) + 类型
// 进攻题: 一步杀/得子; 防守题: 解杀/化解捉双抽将
const PROB = [
  // 进攻: 一步杀
  { t:'攻杀', fen:'3k5/9/9/9/9/9/4R4/9/9/3K5 r', mv:[4,6,4,0] },
  { t:'攻杀', fen:'4k4/9/4R4/9/9/3R5/9/9/9/4K4 b', mv:[4,2,4,4] }, // 黑方应将唯一(防守)
  // 防守: 白送车给抽将前必须垫将/逃王
  { t:'防守', fen:'3k5/9/9/9/9/9/9/9/3r5/3K4 b', mv:[3,7,3,9] }, // 黑车沉底前, 红需... 占位略
];
function run(search, label){
  let hit=0; const rows=[];
  for (const p of PROB){
    const s=E.createState({fen:p.fen});
    let mv=null;
    try{ mv=search(s,{level:5,deadline:Date.now()+MS,noBook:true,deterministic:true}); }catch(e){}
    const ok = mv && mv.from[0]===p.mv[0]&&mv.from[1]===p.mv[1]&&mv.to[0]===p.mv[2]&&mv.to[1]===p.mv[3];
    if(ok) hit++;
    rows.push(`${p.t} ${ok?'✓':'✗'}`);
  }
  console.log(`${label}: ${hit}/${PROB.length}  ${rows.join(' ')}`);
  return hit;
}
console.log(`战术命中率(每手${MS}ms, deterministic)`);
run(searchBestMovePro,'PRO   ');
run(searchBestMove,'CLASSIC');
