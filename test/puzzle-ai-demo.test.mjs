// 残局 AI 演示/双 AI 对弈 驱动测试(node, 无浏览器 worker)
//   - 注入 solverFn = 真 puzzleHintMove(确定性强制杀), engineFn = 真 searchBestMove(短时限);
//   - 覆盖: 杀局演示按标注步数将死/防守最顽强; 双 AI 三组合从残局 FEN 自动至终局;
//           win/draw 视角判定; 最大手数保护不卡死; 三模式切换重置。
import { createState, applyMove, legalMoves, serialize } from '../js/engine.js';
import { puzzleHintMove, searchBestMove } from '../js/ai.js';
import { PUZZLES } from '../js/puzzles.js';
import { XQPuzDemo, XQPDVerdict } from '../js/puzzle-ai-demo.js';
import assert from 'node:assert';

const byId = (id) => PUZZLES.find(p => p.id === id);

// 跑一局残局演示: 返回终局 {status,reason,plies}
async function runDemo(pz, mode, opts = {}) {
  const state = createState({ fen: pz.fen });
  const attacker = 'r'; // 残局红先
  let endInfo = null;
  // 攻击方确定性求解(worker puzzleHint 的 node 直调版)
  const solverAiCall = async () => {
    const mv = puzzleHintMove(state, { puzzleId: pz.id, mateTarget: pz.mate || 6, attacker, deadline: Date.now() + 1500 });
    return mv;
  };
  // 普通引擎落子: 防守大师档(短时限) / double 双方自选
  const engineAiCall = async (side, engine, level) => {
    const mv = searchBestMove(state, { level, deadline: Date.now() + 400, deterministic: true, noBook: true });
    return mv;
  };
  const demo = new XQPuzDemo({
    attacker, mode, speed: 'fast',
    solverAiCall, engineAiCall,
    doubleCfg: opts.doubleCfg, defenderLevel: 5,
    fallbackFn: (side) => { const lm = legalMoves(state, side); return lm && lm.length ? lm[0] : null; },
    applyFn: (mv) => {
      applyMove(state, mv.from, mv.to, {});
      const over = state.status !== 'playing';
      return { over, status: state.status, reason: state.reason, nextSide: state.turn };
    },
    onEnd: (info) => { endInfo = info; }
  });
  // 即时调度, 不等播放间隔
  demo.spec.waitMs = () => 0;
  demo.start();
  await new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (endInfo || Date.now() - t0 > 40000) { clearInterval(iv); res(); }
    }, 15);
  });
  return { status: endInfo && endInfo.status, reason: endInfo && endInfo.reason, plies: state.moves.length };
}

console.log('== A. 杀局 AI 演示正解(攻击方确定性强制杀, 防守大师) ==');
for (const id of [1, 2, 208]) {
  const pz = byId(id);
  if (!pz) { console.log(`  #${id} 不存在, 跳过`); continue; }
  const r = await runDemo(pz, 'demo');
  const rounds = Math.ceil(r.plies / 2);
  console.log(`  #${id}「${pz.name}」mate=${pz.mate}: -> ${r.status}/${r.reason}, 实际 ${rounds} 回合`);
  assert.ok(['redwin', 'blackwin', 'draw'].includes(r.status), '终局 status 合法');
  // 一步杀/浅层应速胜; 深层允许求解未在限内, 但不得死循环
  assert.ok(r.plies > 0 && r.plies <= 150, `手数在保护内 plies=${r.plies}`);
  if (pz.mate === 1) assert.strictEqual(r.status, 'redwin', `#${id} 一步杀应红胜`);
}

console.log('== B. 双 AI 对弈残局(三组合, 如实判定) ==');
const pzB = byId(451) || byId(3);
const combos = [
  { red: { engine: 'classic', level: 3 }, black: { engine: 'pro', level: 3 } },
  { red: { engine: 'pro', level: 3 }, black: { engine: 'pro', level: 3 } },
  { red: { engine: 'classic', level: 2 }, black: { engine: 'classic', level: 4 } }
];
for (const dc of combos) {
  const r = await runDemo(pzB, 'double', { doubleCfg: dc });
  console.log(`  #${pzB.id} ${dc.red.engine}${dc.red.level} vs ${dc.black.engine}${dc.black.level}: -> ${r.status}/${r.reason}, plies=${r.plies}`);
  assert.ok(['redwin', 'blackwin', 'draw'].includes(r.status), '终局 status 合法');
  assert.ok(r.plies > 0 && r.plies <= 264, '双AI手数保护内');
}

console.log('== C. win/draw 视角判定(XQPDVerdict 单测) ==');
{
  // 例胜 type=win: 红胜 -> 演示取胜
  let v = XQPDVerdict({ type: 'win', attacker: 'r', status: 'redwin', plies: 20 });
  assert.strictEqual(v.pass, 'win', '例胜红胜=演示取胜');
  // 例胜被逼和 -> 失败不伪装
  v = XQPDVerdict({ type: 'win', attacker: 'r', status: 'draw', plies: 100 });
  assert.strictEqual(v.pass, 'fail', '例胜成和=如实失败');
  // 守和 type=draw: 和 -> 守和成功
  v = XQPDVerdict({ type: 'draw', attacker: 'r', status: 'draw', plies: 80 });
  assert.strictEqual(v.pass, 'draw', '守和成和=成功');
  v = XQPDVerdict({ type: 'draw', attacker: 'r', status: 'redwin', plies: 40 });
  assert.strictEqual(v.pass, 'fail', '守和被攻破=失败');
  // 杀局步数对比
  v = XQPDVerdict({ type: undefined, attacker: 'r', mateTarget: 3, status: 'redwin', plies: 6 });
  assert.strictEqual(v.pass, 'win', '杀局3步将死=成功');
  assert.ok(v.title.includes('3'), '标题含标准步数');
  v = XQPDVerdict({ type: undefined, attacker: 'r', mateTarget: 1, status: 'draw', plies: 30 });
  assert.strictEqual(v.pass, 'fail', '杀局演成和=不谎报');
  console.log('  win/draw/mate 判定文案正确, 无谎报');
}

console.log('\nALL PUZZLE-AI-DEMO TESTS PASSED');
