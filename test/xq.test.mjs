// ============================================================
// XQ* 模块自测: node test/xq.test.mjs
// 覆盖:
//  1) 悔棋 applyMove/undoMoves 往返后 FEN/positionKey 完全一致(人机/同台/残局等价路径)
//  2) XQUndoPlan 各模式撤回半回合数
//  3) 时钟规则: 落子加秒 / 包干超时判负 / 读秒(注入假时钟)
//  4) 战绩组装与 JSON 往返
//  5) 棋谱导出: 开局识别 + 导出着法与 notation.js 互逆、可被引擎回放
// ============================================================
import * as E from '../js/engine.js';
import { playLine } from '../js/notation.js';
import { XQUndoPlan } from '../js/xq-game-actions.js';
import { XQMakeClock } from '../js/xq-clock.js';
import { XQBuildRecord, XQRoundTrip } from '../js/xq-records.js';
import { XQExportText, XQDetectOpening, XQReplayCheck } from '../js/xq-exporter.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } };

// ---------- 1. 悔棋往返: FEN / positionKey 完全一致 ----------
{
  const s = E.createState();
  const keySnap = [E.positionKey(s)];
  const fenSnap = [E.toFEN(s)];
  const rng = E.mulberry32(7);
  for (let i = 0; i < 10 && s.status === 'playing'; i++) {
    const ms = E.legalMoves(s, s.turn);
    if (!ms.length) break;
    const mv = ms[Math.floor(rng() * ms.length)];
    E.applyMove(s, mv.from, mv.to);
    keySnap.push(E.positionKey(s));
    fenSnap.push(E.toFEN(s));
  }
  const total = s.moves.length;
  // 撤回到第 5 手
  E.undoMoves(s, total - 5);
  ok(s.moves.length === 5, `撤回 ${total - 5} 手后剩 5 手(实际 ${s.moves.length})`);
  ok(E.positionKey(s) === keySnap[5], '往返后 positionKey 与第5手快照一致');
  ok(E.toFEN(s) === fenSnap[5], '往返后 FEN 与第5手快照一致');
  // 全部撤回到初始
  E.undoMoves(s, s.moves.length);
  ok(E.positionKey(s) === keySnap[0], '全部撤回到初始 positionKey 一致');
  ok(E.toFEN(s) === fenSnap[0], '全部撤回到初始 FEN 一致');
}

// 揭棋往返(暗子揭示状态经 undoMoves 重建应一致)
{
  const s = E.createState({ jieqi: true, seed: 123 });
  const key0 = E.positionKey(s);
  const rng = E.mulberry32(99);
  for (let i = 0; i < 6 && s.status === 'playing'; i++) {
    const ms = E.legalMoves(s, s.turn); if (!ms.length) break;
    const mv = ms[Math.floor(rng() * ms.length)];
    E.applyMove(s, mv.from, mv.to);
  }
  const midKey = E.positionKey(s);
  E.undoMoves(s, s.moves.length);
  ok(E.positionKey(s) === key0, '揭棋撤回到初始 positionKey 一致(暗子状态重建)');
}

// ---------- 2. XQUndoPlan 各模式撤回数 ----------
{
  // 人机: r 走->b(AI)走, 轮到 r(玩家) -> 撤一对
  const sa = E.createState();
  E.applyMove(sa, [4, 6], [4, 5]);
  E.applyMove(sa, [4, 3], [4, 4]);
  let plan = XQUndoPlan({ mode: 'ai', state: sa, mySide: 'r' });
  ok(plan.n === 2 && plan.pair === true, `人机轮到玩家撤一对(n=${plan.n})`);
  // 人机: r 刚走, 轮到 b(AI思考) -> 撤一着
  const sb = E.createState();
  E.applyMove(sb, [4, 6], [4, 5]);
  plan = XQUndoPlan({ mode: 'ai', state: sb, mySide: 'r' });
  ok(plan.n === 1 && plan.pair === false, `人机玩家刚走完撤一着(n=${plan.n})`);
  // 同台: 恒撤一着
  plan = XQUndoPlan({ mode: 'local', state: sa, mySide: 'r' });
  ok(plan.n === 1, '同台撤一着');
  // 残局: 轮到我(黑方防守, mySide=b)撤一对
  const sp = E.createState({ fen: '3akabrC/9/9/9/9/9/9/9/9/3K5 r' });
  plan = XQUndoPlan({ mode: 'puzzle', state: sp, mySide: 'r' });
  // 残局空盘 turn=r(我方) -> n=min(2,0)=0
  ok(plan.n === 0, '残局空盘悔棋=0');
  // 空盘
  const se = E.createState();
  ok(XQUndoPlan({ mode: 'ai', state: se, mySide: 'r' }).n === 0, '空盘人机悔棋=0');
}

// ---------- 3. 时钟规则(假时钟) ----------
{
  // 3a. 加秒制: 落子后给刚走完方加 inc 秒
  let t = 0; const f = () => t;
  const c = XQMakeClock({ base: 10, inc: 3, byo: 0 }, { now: f });
  t = 8000; c.tick('r');                 // 红思考8s, 剩 2s
  ok(c.view().r.remain === 2000, `红主时剩2000(实际 ${c.view().r.remain})`);
  c.settle('r');                        // 红落子, 加3s
  ok(c.view().r.remain === 5000, `红落子加3s后剩5000(实际 ${c.view().r.remain})`);
  t = 13000; c.tick('b'); c.settle('b'); // 黑思考5s, 加3s
  ok(c.view().b.remain === 8000, `黑落子加秒后剩8000(实际 ${c.view().b.remain})`);

  // 3b. 包干: 主时耗尽判负
  let t2 = 0; const f2 = () => t2;
  const c2 = XQMakeClock({ base: 5, inc: 0, byo: 0 }, { now: f2 });
  t2 = 4900; let loser = c2.tick('r');
  ok(loser === null, '包干4.9s未超时');
  t2 = 5100; loser = c2.tick('r');
  ok(loser === 'r', '包干5.1s红超时判负');

  // 3c. 读秒: 主时耗尽进读秒, 读秒耗尽才判负
  let t3 = 0; const f3 = () => t3;
  const c3 = XQMakeClock({ base: 5, inc: 0, byo: 3 }, { now: f3 });
  t3 = 5100; loser = c3.tick('r');
  ok(loser === null && c3.view().r.phase === 'byo', '主时耗尽进入读秒(未判负)');
  t3 = 8200; loser = c3.tick('r');
  ok(loser === 'r', '读秒3s耗尽红判负');

  // 3d. 不计时: 永不超时
  let t4 = 0; const f4 = () => t4;
  const c4 = XQMakeClock({ base: 0, inc: 0, byo: 0 }, { now: f4 });
  ok(c4.running === false && c4.tick('r') === null, '不计时时钟永不超时');
}

// ---------- 4. 战绩组装与往返 ----------
{
  const s = E.createState();
  E.applyMove(s, [4, 6], [4, 5]);
  const rec = XQBuildRecord({
    mode: '人机对弈', result: '胜', reason: 'checkmate', state: s,
    cfg: { jieqi: false, time: '10', aiLevel: 3, aiEngine: 'classic' },
    mySide: 'r', durationMs: 12345
  });
  ok(rec.plies === 1, '战绩手数=1');
  ok(rec.side === 'r', '战绩记录先后手');
  ok(rec.aiEngine === 'classic' && rec.aiLevel === 3, '战绩记录引擎/等级');
  ok(rec.durationMs === 12345, '战绩记录用时');
  ok(XQRoundTrip(rec), '战绩 JSON 往返字段齐全');
}

// ---------- 5. 棋谱导出 ----------
{
  const g = E.createState();
  const r = playLine(g, ['炮二平五', '炮8平5', '马二进三', '马8进7']);
  ok(r.ok, '构造顺炮开局谱');
  const mv = g.moves;
  const op = XQDetectOpening(mv, {});
  ok(op.length > 0, '识别到开局名: ' + op);
  ok(XQReplayCheck(mv, {}), '导出着法可被 notation 互逆回放(引擎重放一致)');
  const txt = XQExportText({ moves: mv, result: '红胜', reason: 'checkmate', mode: '人机对弈' });
  ok(txt.includes('炮二平五') && txt.includes('马8进7'), '导出文本含标准着法');
  ok(txt.includes('结果: 红胜') && txt.includes('手数: 4'), '导出文本含结果与手数');
  ok(txt.includes(op), '导出文本含开局名');
}

console.log(`\n${fail === 0 ? '✅ XQ ALL PASS' : '❌ XQ HAS FAILURES'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
