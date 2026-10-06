// ============================================================
// AI-PRO 自对弈: 增强引擎执红 vs 执黑, 统计双方胜/和、终局原因、手数、子差、异常
// 用法: node test/pro-selfplay.mjs
// 环境: GAMES=100 MS=800 SEED0=2026 JSON=路径
// ============================================================
import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { searchBestMovePro } from '../js/ai-pro.js';
import fs from 'fs';

const num = (v, d) => (v == null || v === '' ? d : Number(v));
const GAMES = num(process.env.GAMES, 100);
const MS = num(process.env.MS, 800);
const SEED0 = num(process.env.SEED0, 3001);
const JSON_OUT = process.env.JSON || 'test/logs/pro-selfplay.json';
const rngFor = (seed, ply) => mulberry32((seed ^ Math.imul(ply + 1, 2654435761)) >>> 0);
const VAL = { K: 60000, A: 200, B: 200, N: 400, R: 900, C: 450, P: 100 };
function matDiff(s) {
  let r = 0, b = 0;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x]; if (!p) continue;
    const v = p.hidden ? 200 : VAL[p.t];
    if (p.c === 'r') r += v; else b += v;
  }
  return r - b;
}
function isLegal(s, mv) {
  return mv && E.legalMoves(s).some(m => m.from[0]===mv.from[0]&&m.from[1]===mv.from[1]&&m.to[0]===mv.to[0]&&m.to[1]===mv.to[1]);
}
function playOne(gameSeed) {
  const s = E.createState({ seed: gameSeed });
  let illegal=0, threw=0, overTime=0;
  while (s.status === 'playing' && s.moves.length < 240) {
    let mv=null; const t0=Date.now();
    try { mv = searchBestMovePro(s, { level:5, deadline:Date.now()+MS, rng:rngFor(gameSeed, s.moves.length) }); }
    catch(e){ threw++; break; }
    if (Date.now()-t0 > MS+600) overTime++;
    if (!isLegal(s,mv)){ illegal++; break; }
    E.applyMove(s, mv.from, mv.to);
  }
  return { s, illegal, threw, overTime };
}
let redWin=0, blackWin=0, draw=0, abort=0;
let reasonCount={};
let totalMoves=0, matSum=0, nFinished=0;
let totalIllegal=0, totalOver=0;
const tAll=Date.now();
for (let g=0; g<GAMES; g++) {
  const { s, illegal, threw, overTime } = playOne(SEED0+g);
  totalIllegal+=illegal; totalOver+=overTime;
  if (threw||illegal){ abort++; reasonCount.abort=(reasonCount.abort||0)+1; continue; }
  totalMoves += s.moves.length;
  if (s.status==='redwin'){ redWin++; }
  else if (s.status==='blackwin'){ blackWin++; }
  else { draw++; }
  const r = s.status==='draw'||s.status==='playing' ? 'draw/limit' : (s.status==='redwin'?'redwin':'blackwin');
  reasonCount[r+'|'+(s.reason||'')]=(reasonCount[r+'|'+(s.reason||'')]||0)+1;
  matSum += matDiff(s); nFinished++;
  console.log(`局 ${g+1}/${GAMES}: ${s.status} reason=${s.reason||'-'} 手数=${s.moves.length} 子差(红)=${matDiff(s)}`);
}
const dt=(Date.now()-tAll)/1000;
console.log(`\n===== PRO 自对弈 ${GAMES} 局 (${MS}ms/手) =====`);
console.log(`红胜 ${redWin}  黑胜 ${blackWin}  和棋 ${draw}  异常 ${abort}`);
console.log(`平均手数 ${(totalMoves/GAMES).toFixed(0)}  平均终局子差(红) ${nFinished?(matSum/nFinished).toFixed(0):0}`);
console.log(`非法着 ${totalIllegal}  超时手 ${totalOver}  总耗时 ${dt.toFixed(1)}s`);
console.log('终局原因分布:', JSON.stringify(reasonCount));
fs.mkdirSync('test/logs',{recursive:true});
fs.writeFileSync(JSON_OUT, JSON.stringify({games:GAMES,ms:MS,redWin,blackWin,draw,abort,totalIllegal,totalOver,reasonCount,sec:dt},null,2));
console.log('已写', JSON_OUT);
