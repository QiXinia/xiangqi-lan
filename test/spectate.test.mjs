// 观战 AI 对战 驱动测试(node, 无浏览器 worker)
//   - 注入 aiCallFn = 随机合法着(快), 用真 engine 判终局;
//   - 覆盖: 双方自动轮流至终局/每手合法/终局 status 三选一/0 卡死(最大手数保护)/0 非法;
//   - 暂停后不自动走、step 恰好一手、speed 改间隔、restart 归零、换配置生效。
import { createState, applyMove, legalMoves } from '../js/engine.js';
import { XQSpectate, SPEC_SPEEDS, SPEC_MAX_MOVES } from '../js/ai-spectate.js';
import assert from 'node:assert';

// 伪随机(可复现)
let _seed = 1234567;
function rnd() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }

// 跑一局: 返回 {status, reason, plies}
function runOne(red, black, speed = 'fast') {
  const state = createState({ jieqi: false, seed: 999 });
  let endInfo = null;
  const aiCallFn = async (side) => {
    const lm = legalMoves(state, side);
    if (!lm || !lm.length) return null;
    return lm[Math.floor(rnd() * lm.length)];
  };
  const applyFn = (mv) => {
    applyMove(state, mv.from, mv.to, {});
    const over = state.status !== 'playing';
    return { over, status: state.status, reason: state.reason, nextSide: state.turn };
  };
  const spec = new XQSpectate({
    red, black, speed,
    aiCallFn,
    fallbackFn: (side) => { const lm = legalMoves(state, side); return lm && lm.length ? lm[0] : null; },
    applyFn,
    onEnd: (info) => { endInfo = info; }
  });
  spec.waitMs = () => 0; // node 测试不等待播放间隔, 即时调度, 靠最大手数保护收敛
  spec.start();
  // 等终局: 驱动自调度(fast=160ms/手), 上限约 SPEC_MAX_MOVES 手
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (endInfo || Date.now() - t0 > 30000) {
        clearInterval(iv);
        resolve({ status: endInfo && endInfo.status, reason: endInfo && endInfo.reason, plies: state.moves.length });
      }
    }, 20);
  });
}

const combos = [
  [{ engine: 'classic', level: 3 }, { engine: 'classic', level: 3 }],
  [{ engine: 'pro', level: 3 }, { engine: 'pro', level: 3 }],
  [{ engine: 'classic', level: 2 }, { engine: 'pro', level: 4 }]
];

console.log('== 三组合自动对弈 ==');
for (const [red, black] of combos) {
  const r = await runOne(red, black, 'fast');
  console.log(`  ${red.engine}${red.level} vs ${black.engine}${black.level}: -> ${r.status}/${r.reason}, plies=${r.plies}`);
  assert.ok(['redwin', 'blackwin', 'draw'].includes(r.status), `终局 status 合法, 实得 ${r.status}`);
  assert.ok(r.plies > 0 && r.plies <= SPEC_MAX_MOVES + 4, `手数在保护内, plies=${r.plies}`);
  assert.ok(!String(r.reason).includes('undefined'), 'reason 非 undefined');
}

console.log('== 暂停/单步/调速/重开/换配置 ==');
{
  const state = createState({ jieqi: false, seed: 7 });
  let calls = 0;
  const aiCallFn = async () => { calls++; const lm = legalMoves(state, state.turn); return lm[0]; };
  const applyFn = (mv) => { applyMove(state, mv.from, mv.to, {}); const over = state.status !== 'playing'; return { over, status: state.status, reason: state.reason, nextSide: state.turn }; };
  const spec = new XQSpectate({ red: { engine: 'classic', level: 1 }, black: { engine: 'pro', level: 1 }, aiCallFn, applyFn });
  spec.setPaused(true);
  spec.start();
  await new Promise(r => setTimeout(r, 500));
  assert.strictEqual(calls, 0, '暂停后不自动走(calls=0)');
  const before = state.moves.length;
  await spec.stepOnce();
  assert.strictEqual(state.moves.length, before + 1, 'step 恰好推进一手');
  // 调速: 等待间隔生效
  spec.setSpeed('slow'); assert.strictEqual(spec.waitMs(), SPEC_SPEEDS.slow, 'speed=slow 间隔');
  spec.setSpeed('fast'); assert.strictEqual(spec.waitMs(), SPEC_SPEEDS.fast, 'speed=fast 间隔');
  // 换配置生效
  spec.reset({ engine: 'pro', level: 5 }, { engine: 'classic', level: 2 }, 'mid');
  assert.strictEqual(spec.cfgFor('r').level, 5, '换红档=5');
  assert.strictEqual(spec.cfgFor('b').engine, 'classic', '换黑引擎=classic');
  assert.strictEqual(spec.moveCount, 0, 'restart 手数归零');
  assert.strictEqual(spec.side, 'r', 'restart 红先');
  spec.stop();
}

console.log('== aiCall 回 null 兜底不死循环 ==');
{
  const state = createState({ jieqi: false, seed: 3 });
  let endInfo = null;
  // aiCall 恒回 null, 靠 fallbackFn 取合法着推进
  const spec = new XQSpectate({
    red: { engine: 'classic', level: 1 }, black: { engine: 'pro', level: 1 }, speed: 'fast',
    aiCallFn: async () => null,
    fallbackFn: (side) => { const lm = legalMoves(state, side); return lm && lm.length ? lm[0] : null; },
    applyFn: (mv) => { applyMove(state, mv.from, mv.to, {}); const over = state.status !== 'playing'; return { over, status: state.status, reason: state.reason, nextSide: state.turn }; },
    onEnd: (i) => { endInfo = i; }
  });
  spec.waitMs = () => 0; // 即时调度, 不等待播放间隔
  spec.start();
  await new Promise((res) => { const t0 = Date.now(); const iv = setInterval(() => { if (endInfo || Date.now() - t0 > 20000) { clearInterval(iv); res(); } }, 20); });
  assert.ok(endInfo, '回 null 也在最大手数内收敛终局, 不死循环');
  assert.ok(['redwin', 'blackwin', 'draw'].includes(endInfo.status), '兜底终局 status 合法');
  console.log('  兜底 ->', endInfo.status, endInfo.reason, 'plies=', state.moves.length);
}

console.log('\nALL SPECTATE TESTS PASSED');
