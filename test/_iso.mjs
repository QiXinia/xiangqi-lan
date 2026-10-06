import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
function pos(){ const s=E.createState(); E.applyMove(s,[7,7],[4,7]); E.applyMove(s,[1,2],[4,2]); E.applyMove(s,[7,9],[6,7]); return s; }
const tests = {
  allOn: {},
  noThreat: {threatExt:false},
  noLmr2: {lmr2:false},
  noSee: {see:false},
  noNullR: {nullR:false},
  noEval2: {eval2:false},
};
for (const [name, ov] of Object.entries(tests)) {
  const s = pos();
  const mv = searchBestMove(s, { level:5, deadline:Date.now()+1500, noBook:true, feat:ov });
  console.log(name.padEnd(10), 'depth', mv.depth, 'nodes', mv.nodes, 'score', mv.score);
}
