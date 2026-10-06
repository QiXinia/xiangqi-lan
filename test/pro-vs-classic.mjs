// ============================================================
// AI-PRO 大师 vs 经典大师(test/ai-baseline.mjs) 对抗
//   执先执后各半, 双方每手时限一致, 统计 pro 视角 W/D/L、胜率、子差、手数、异常
// 用法: node test/pro-vs-classic.mjs
// 环境: GAMES=100 MS=900 SEED0=4040 JSON=路径
// ============================================================
import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { appendFileSync } from 'node:fs';
import { searchBestMovePro as proSearch } from '../js/ai-pro.js';
import { searchBestMove as classicSearch } from './ai-baseline.mjs';
import fs from 'fs';

const num = (v, d) => (v == null || v === '' ? d : Number(v));
const GAMES = num(process.env.GAMES, 100);
const MS = num(process.env.MS, 900);
const SEED0 = num(process.env.SEED0, 4040);
const JSON_OUT = process.env.JSON || 'test/logs/pro-vs-classic.json';
const FEAT = process.env.FEAT_JSON ? JSON.parse(process.env.FEAT_JSON) : undefined; // pro 特性覆盖(A/B)
const rngFor = (seed, ply) => mulberry32((seed ^ Math.imul(ply + 1, 2654435761)) >>> 0);
const VAL = { K: 60000, A: 200, B: 200, N: 400, R: 900, C: 450, P: 100 };
function matDiff(s){ let r=0,b=0; for(let y=0;y<=9;y++)for(let x=0;x<=8;x++){const p=s.board[y][x];if(!p)continue;const v=p.hidden?200:VAL[p.t]; if(p.c==='r')r+=v;else b+=v;} return r-b; }
function isLegal(s,mv){ return mv && E.legalMoves(s).some(m=>m.from[0]===mv.from[0]&&m.from[1]===mv.from[1]&&m.to[0]===mv.to[0]&&m.to[1]===mv.to[1]); }

// proSide: pro 执哪方('r'/'b')
function playOne(gameSeed, proSide) {
  const s = E.createState({ seed: gameSeed });
  let illegal=0, threw=0, overTime=0;
  while (s.status==='playing' && s.moves.length<240) {
    const isPro = s.turn===proSide;
    let mv=null; const t0=Date.now();
    try {
      const fn = isPro ? proSearch : classicSearch;
      mv = fn(s, { level:5, deadline:Date.now()+MS, rng:rngFor(gameSeed, s.moves.length), feat: FEAT });
    } catch(e){ threw++; try{ appendFileSync('test/logs/abort-catch.log', `[THROW] seed=${gameSeed} pro=${proSide} move=${s.moves.length} name=${e.name} msg=${e.message} status=${s.status} FEN=${E.toFEN(s)} stack=${(e.stack||'').split('\n').slice(0,3).join(' | ')}\n`);}catch(_){} break; }
    if (Date.now()-t0 > MS+600) overTime++;
    const lm = E.legalMoves(s);
    if (!mv) {
      if (lm.length === 0) break; // 真终局(将杀/困毙): 正常按 status 判, 不计 ABORT
      // mv=null 但仍有合法着 = 真bug, 落盘堆栈
      appendFileSync('test/logs/abort-catch.log',
        `[NULLBUG] seed=${gameSeed} pro=${proSide} move=${s.moves.length} status=${s.status} legalCount=${lm.length} FEN=${E.toFEN(s)}\n`);
      illegal++; break;
    }
    if (!isLegal(s,mv)){
      appendFileSync('test/logs/abort-catch.log',
        `[ILLEGAL] seed=${gameSeed} pro=${proSide} move=${s.moves.length} mv=${JSON.stringify(mv)} legalCount=${lm.length} FEN=${E.toFEN(s)}\n`);
      illegal++; break;
    }
    E.applyMove(s, mv.from, mv.to);
  }
  let res;
  if (threw||illegal) res='ABORT';
  else if (s.status==='draw'||s.status==='playing') res='D';
  else res = (s.status==='redwin'?'r':'b')===proSide ? 'W':'L';
  // 子差转 pro 视角
  let md = matDiff(s); if (proSide==='b') md=-md;
  return { res, md, moves: s.moves.length, illegal, threw, overTime };
}
let W=0,D=0,L=0,abort=0,sumMd=0,sumMoves=0,totIllegal=0,totOver=0;
const tAll=Date.now();
for (let g=0; g<GAMES; g++) {
  const proSide = (g%2===0) ? 'r':'b';
  const { res, md, moves, illegal, threw, overTime } = playOne(SEED0+g, proSide);
  totIllegal+=illegal; totOver+=overTime;
  if (res==='ABORT'){ abort++; console.log(`局 ${g+1} PRO执${proSide}: ABORT`); continue; }
  if (res==='W') W++; else if (res==='L') L++; else D++;
  sumMd+=md; sumMoves+=moves;
  console.log(`局 ${g+1} PRO执${proSide}: ${res} (${moves}手 子差pro=${md})`);
}
const n = GAMES-abort;
const score = (W + 0.5*D);
const dt=(Date.now()-tAll)/1000;
console.log(`\n===== PRO vs CLASSIC ${GAMES} 局 (${MS}ms/手, pro 先后手各半) =====`);
console.log(`PRO 视角 W/D/L = ${W}/${D}/${L}  胜率(含和半) ${(score/n*100).toFixed(1)}%  净胜 ${W-L}`);
console.log(`平均手数 ${(sumMoves/n).toFixed(0)}  平均终局子差(pro) ${(sumMd/n).toFixed(0)}`);
console.log(`异常局 ${abort}  非法手 ${totIllegal}  超时手 ${totOver}  总耗时 ${dt.toFixed(1)}s`);
fs.mkdirSync('test/logs',{recursive:true});
fs.writeFileSync(JSON_OUT, JSON.stringify({games:GAMES,ms:MS,W,D,L,abort,winRate:score/n,avgMat:sumMd/n,avgMoves:sumMoves/n,totIllegal,totOver,sec:dt},null,2));
console.log('已写', JSON_OUT);
