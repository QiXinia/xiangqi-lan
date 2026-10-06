import * as E from '../js/engine.js';
import { searchBestMove as newSearch } from '../js/ai.js';
import { searchBestMove as oldSearch } from '../test/ai-baseline.mjs';
function pos(){ const s=E.createState(); E.applyMove(s,[7,7],[4,7]); E.applyMove(s,[1,2],[4,2]); E.applyMove(s,[7,9],[6,7]); return s; }
for (const [nm,fn] of [['OLD',oldSearch],['NEW',newSearch]]) {
  const s=pos(); const t0=Date.now();
  const mv=fn(s,{level:5,deadline:Date.now()+1500,noBook:true,deterministic:true});
  console.log(nm,'depth',mv.depth,'nodes',mv.nodes,'elapsed',Date.now()-t0,'move',mv.from,'->',mv.to);
}
