import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
const s=E.createState(); E.applyMove(s,[7,7],[4,7]); E.applyMove(s,[1,2],[4,2]); E.applyMove(s,[7,9],[6,7]);
const t0=Date.now();
const mv = searchBestMove(s, { level:5, deadline:Date.now()+1500, noBook:true, deterministic:true });
console.log('result', mv, 'elapsed', Date.now()-t0);
