// ============================================================
// AI 强度不退化自测: node test/ai-strength-check.mjs
//   「随机大师(level5, 多 seed, 仅等优着间加权随机)」
//   vs「确定性 argmax 大师(level5, deterministic)」
//   先后手交换若干局, 固定每手墙钟。断言:
//     随机方不出现系统性败局(等强应多和/互有胜负), 无非法着/无死循环/均终局。
// 环境变量: GAMES=8  ATK_MS=700  (每手墙钟 ms)
// ============================================================
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { mulberry32 } from '../js/engine.js';

const num = (v, d) => (v == null || v === '' ? d : Number(v));
const GAMES = num(process.env.GAMES, 8);
const MS = num(process.env.MS, 700);

const rngFor = (seed, ply) => mulberry32((seed ^ Math.imul(ply + 1, 2654435761)) >>> 0);
function isLegal(s, mv) {
  return mv && E.legalMoves(s).some(m =>
    m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
}

// side: 'r'|'b' 表示"随机方"执哪方; 返回从随机方视角的结果 1胜/0和/-1负
function playOne(gameSeed, randomSide) {
  const s = E.createState({ seed: gameSeed });
  let illegal = 0, threw = 0;
  while (s.status === 'playing' && s.moves.length < 220) {
    const isRandom = s.turn === randomSide;
    let mv = null;
    try {
      mv = isRandom
        ? searchBestMove(s, { level: 5, deadline: Date.now() + MS, rng: rngFor(gameSeed, s.moves.length) })
        : searchBestMove(s, { level: 5, deadline: Date.now() + MS, deterministic: true });
    } catch (e) { threw++; break; }
    if (!isLegal(s, mv)) { illegal++; break; }
    E.applyMove(s, mv.from, mv.to);
  }
  let res;
  if (threw || illegal) res = 'ABORT';
  else if (s.status === 'draw' || s.status === 'playing') res = 'D'; // 达手数上限未终局按未分胜负(和)
  else {
    const winner = s.status === 'redwin' ? 'r' : 'b';
    res = winner === randomSide ? 'W' : 'L';
  }
  return { res, plies: s.moves.length, illegal, threw };
}

let W = 0, D = 0, L = 0, aborts = 0, totalPlies = 0;
for (let g = 0; g < GAMES; g++) {
  const randomSide = g % 2 === 0 ? 'r' : 'b'; // 先后手交换
  const r = playOne(1000 + g * 13, randomSide);
  totalPlies += r.plies;
  if (r.res === 'W') W++; else if (r.res === 'D') D++; else if (r.res === 'L') L++; else aborts++;
  console.log(`局${String(g + 1).padStart(2)} 随机方执${randomSide}: ${r.res} (${r.plies}手) ${r.illegal ? '非法' : ''}${r.threw ? '抛错' : ''}`);
}
const n = GAMES;
console.log(`\n随机方视角 W/D/L = ${W}/${D}/${L}  (共 ${n} 局, 每手 ${MS}ms)`);
console.log(`平均手数 ${(totalPlies / n).toFixed(0)}  异常/非法局 ${aborts}`);
// 断言: 无异常; 随机方不系统性败局(胜场不少于负场, 或接近)
const okCount = (aborts === 0 && L <= W + 1);
console.log(okCount ? '✅ 强度不退化(随机仅在等优着间, 未系统性走劣)' : '❌ 随机方出现系统性败局, 需收紧噪声窗');
process.exit(okCount ? 0 : 1);
