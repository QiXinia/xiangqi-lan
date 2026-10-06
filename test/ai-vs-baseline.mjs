// ============================================================
// 新版大师(js/ai.js) vs 基线大师(test/ai-baseline.mjs) 客观对弈自测
//   固定每手墙钟, 先后手各半, 统计新方视角 W/D/L、胜率、平均终局子差、平均手数、异常数。
// 用法: node test/ai-vs-baseline.mjs
// 环境: GAMES=40 MS=1000 SEED0=2026 FEAT_JSON=可选(新方特性覆盖)
// ============================================================
import * as E from '../js/engine.js';
import { mulberry32 } from '../js/engine.js';
import { searchBestMove as newSearch } from '../js/ai.js';
import { searchBestMove as oldSearch } from './ai-baseline.mjs';
import fs from 'fs';

const num = (v, d) => (v == null || v === '' ? d : Number(v));
const GAMES = num(process.env.GAMES, 40);
const MS = num(process.env.MS, 1000);
const SEED0 = num(process.env.SEED0, 2026);
const FEAT = process.env.FEAT_JSON ? JSON.parse(process.env.FEAT_JSON) : undefined;

const rngFor = (seed, ply) => mulberry32((seed ^ Math.imul(ply + 1, 2654435761)) >>> 0);
function isLegal(s, mv) {
  return mv && E.legalMoves(s).some(m =>
    m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
}
// 红方子力合计(用 VAL), 含暗子回退
const VAL = { K: 60000, A: 200, B: 200, N: 400, R: 900, C: 450, P: 100 };
function materialDiff(s) {
  let r = 0, b = 0;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x];
    if (!p) continue;
    const v = p.hidden ? 200 : VAL[p.t];
    if (p.c === 'r') r += v; else b += v;
  }
  return r - b; // 红方视角
}

// newSide: 新方执哪方; 返回新方视角结果 1/0/-1, 及终局子差(新方视角)、手数
function playOne(gameSeed, newSide) {
  const s = E.createState({ seed: gameSeed });
  let illegal = 0, threw = 0, overTime = 0;
  while (s.status === 'playing' && s.moves.length < 240) {
    const isNew = s.turn === newSide;
    let mv = null;
    const t0 = Date.now();
    try {
      const fn = isNew ? newSearch : oldSearch;
      mv = fn(s, { level: 5, deadline: Date.now() + MS, rng: rngFor(gameSeed, s.moves.length), feat: FEAT });
    } catch (e) { threw++; break; }
    if (Date.now() - t0 > MS + 600) overTime++;
    if (!isLegal(s, mv)) { illegal++; break; }
    E.applyMove(s, mv.from, mv.to);
  }
  let res;
  if (threw || illegal) res = 'ABORT';
  else if (s.status === 'draw' || s.status === 'playing') res = 'D';
  else {
    const winner = s.status === 'redwin' ? 'r' : 'b';
    res = winner === newSide ? 'W' : 'L';
  }
  // 子差: 转成新方视角
  const md = materialDiff(s);
  const mdNew = newSide === 'r' ? md : -md;
  return { res, plies: s.moves.length, mdNew, illegal, threw, overTime };
}

let W = 0, D = 0, L = 0, aborts = 0, totalPlies = 0, totalMd = 0, totalOT = 0;
const perGame = [];
const tStart = Date.now();
for (let g = 0; g < GAMES; g++) {
  const newSide = g % 2 === 0 ? 'r' : 'b';
  const r = playOne(SEED0 + g * 17, newSide);
  totalPlies += r.plies; totalMd += r.mdNew; totalOT += r.overTime;
  if (r.res === 'W') W++; else if (r.res === 'D') D++; else if (r.res === 'L') L++; else aborts++;
  perGame.push({ g: g + 1, newSide, ...r });
  console.log(`局${String(g+1).padStart(2)} 新方执${newSide}: ${r.res} (${r.plies}手 子差${r.mdNew}) ${r.illegal?'非法':''}${r.threw?'抛错':''}${r.overTime?'超时'+r.overTime:''}`);
}
const n = GAMES;
const summary = {
  games: GAMES, ms: MS, seed0: SEED0, feat: FEAT || 'default',
  W, D, L, aborts,
  winRate: n ? ((W + D/2) / n) : 0,
  avgPlies: totalPlies / n, avgMatDiff: totalMd / n,
  totalOverTime: totalOT,
  elapsedSec: ((Date.now() - tStart)/1000).toFixed(0),
};
console.log('\n===== 新方(新版大师)视角 =====');
console.log(`W/D/L = ${W}/${D}/${L}  胜率(含和半)=${(summary.winRate*100).toFixed(1)}%  净胜=${W-L}`);
console.log(`平均手数 ${summary.avgPlies.toFixed(0)}  平均终局子差(新方) ${summary.avgMatDiff.toFixed(0)}  异常局 ${aborts}  超时手数 ${totalOT}`);
fs.mkdirSync('test/logs', { recursive: true });
const out = process.env.JSON || 'test/logs/ai-vs-baseline.json';
fs.writeFileSync(out, JSON.stringify(summary, null, 1));
console.log('明细已写', out);
