// ============================================================
// AI-PRO 多样性/可复现/确定性测试: node test/ai-pro-diversity.test.mjs
// 复刻 ai-diversity 断言, 针对增强引擎 searchBestMovePro:
//  ①开局库首选着随 seed 多变且全部合法
//  ②无强制战术的开放中局 tabiya 上, 多 seed 首选着不唯一
//  ③强制局面/唯一应将/deterministic 跨 seed 完全一致
//  ④一批随机局面 × 多 seed 不抛错、着法合法、不出现同子立即往返
// ============================================================
import * as E from '../js/engine.js';
import { searchBestMovePro } from '../js/ai-pro.js';
import { PUZZLES } from '../js/puzzles.js';
import { mulberry32 } from '../js/engine.js';
import { playLine } from '../js/notation.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ FAIL:', msg); } }
const key = (mv) => `${mv.from[0]},${mv.from[1]}-${mv.to[0]},${mv.to[1]}`;
function isLegal(s, mv) {
  return mv && E.legalMoves(s).some(m =>
    m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
}
function rngFor(seed, ply) { return mulberry32((seed ^ Math.imul(ply + 1, 2654435761)) >>> 0); }

// ① 开局库: 40 seed 首选着集合 >1 且全部合法
{
  const seen = new Set(); let bad = 0;
  for (let s = 1; s <= 40; s++) {
    const st = E.createState({ seed: s });
    const mv = searchBestMovePro(st, { level: 5, deadline: Date.now() + 200, rng: rngFor(s, 0) });
    if (!isLegal(st, mv)) bad++;
    seen.add(key(mv));
  }
  console.log('① 开局首选着数(40seed):', seen.size, [...seen].join(' '));
  ok(seen.size > 1, `开局首选着应多变(>1), 实际 ${seen.size}`);
  ok(bad === 0, `开局首选着全部合法, 非法 ${bad}`);
}

// ② 开放中局 tabiya(noBook): 多 seed 首选着不唯一
{
  const st = E.createState();
  playLine(st, ['炮二平五', '马8进7', '马二进三', '马2进3', '车一平二', '车9平8']);
  const seen = new Set();
  for (let s = 1; s <= 24; s++) {
    const mv = searchBestMovePro(st, { level: 2, deadline: Date.now() + 400, noBook: true, rng: rngFor(123, s) });
    seen.add(key(mv));
  }
  console.log('② 中局 tabiya 首选着数(24seed,lv2):', seen.size, [...seen].join(' '));
  ok(seen.size > 1, `中局 tabiya 首选着应多变(>1), 实际 ${seen.size}`);
}

// ③a 一步杀: 20 seed 首选一致且走完即胜
{
  const mates = PUZZLES.filter(p => p.chapter === 'mate1' && p.mate === 1).slice(0, 5);
  let allStable = true;
  for (const pz of mates) {
    let ref = null, wins = 0;
    for (let s = 1; s <= 20; s++) {
      const st = E.createState({ fen: pz.fen });
      const mv = searchBestMovePro(st, { level: 5, deadline: Date.now() + 500, noBook: true, rng: rngFor(pz.id * 7, s) });
      if (!ref) ref = key(mv);
      else if (key(mv) !== ref) allStable = false;
      const st2 = E.createState({ fen: pz.fen });
      E.applyMove(st2, mv.from, mv.to);
      if (st2.status === 'redwin') wins++;
    }
    console.log(`③a ${pz.name}: 首选=${ref} 20seed 胜 ${wins}/20`);
    ok(wins === 20, `${pz.name} 每 seed 走完即胜`);
  }
  ok(allStable, '一步杀首选着跨 20 seed 完全一致');
}
// ③b 被将且唯一合法应将: 多 seed 一致
{
  const fen = '4k4/9/4R4/9/9/3R5/9/9/9/4K4 b';
  const lm = E.legalMoves(E.createState({ fen }));
  ok(lm.length === 1, `唯一应将局面构造正确(合法着=${lm.length})`);
  const seen = new Set();
  for (let s = 1; s <= 12; s++) {
    const st = E.createState({ fen });
    const mv = searchBestMovePro(st, { level: 5, deadline: Date.now() + 300, noBook: true, rng: rngFor(99, s) });
    seen.add(key(mv));
  }
  console.log('③b 唯一应将首选集合数(应=1):', seen.size);
  ok(seen.size === 1, `唯一应将局面着法应完全一致, 实际 ${seen.size}`);
}
// ③c deterministic:true 跨 seed 不变
{
  const st = E.createState();
  playLine(st, ['炮二平五', '马8进7', '马二进三', '马2进3', '车一平二']);
  const seen = new Set();
  for (let s = 1; s <= 6; s++) {
    const mv = searchBestMovePro(st, { level: 5, deadline: Date.now() + 1500, noBook: true, deterministic: true, rng: rngFor(s, 0) });
    seen.add(key(mv));
  }
  console.log('③c deterministic 中局首选集合数(应=1):', seen.size);
  ok(seen.size === 1, `deterministic 跨 seed 应一致, 实际 ${seen.size}`);
}

// ④ 随机合法局面 × 多 seed: 不抛错/合法/不立即往返
{
  const r = mulberry32(2024);
  const tabiyas = [];
  for (let g = 0; g < 4; g++) {
    const st = E.createState();
    for (let i = 0; i < 10; i++) {
      const lm = E.legalMoves(st);
      if (!lm.length) break;
      const pick = lm[Math.floor(r() * lm.length)];
      E.applyMove(st, pick.from, pick.to);
    }
    if (st.status === 'playing') tabiyas.push(st);
  }
  let illegal = 0, threw = 0, commute = 0, total = 0;
  for (const st0 of tabiyas) {
    for (let s = 1; s <= 4; s++) {
      let mv = null;
      try {
        mv = searchBestMovePro(st0, { level: 3, deadline: Date.now() + 250, noBook: true, rng: rngFor(5, s) });
      } catch (e) { threw++; continue; }
      total++;
      if (!isLegal(st0, mv)) illegal++;
      const hist = st0.moves;
      if (hist && hist.length >= 2) {
        const myPrev = hist[hist.length - 2];
        if (myPrev && myPrev.c === st0.turn && myPrev.from[0] === mv.to[0] && myPrev.from[1] === mv.to[1]
          && myPrev.to[0] === mv.from[0] && myPrev.to[1] === mv.from[1]) commute++;
      }
    }
  }
  console.log(`④ 随机局面: ${total} 次调用, 非法 ${illegal}, 抛错 ${threw}, 立即往返 ${commute}`);
  ok(threw === 0, '随机局面下 searchBestMovePro 不抛异常');
  ok(illegal === 0, '随机局面下返回着法均合法');
  ok(commute === 0, `不出现同子立即往返(实际 ${commute})`);
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ HAS FAILURES'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
