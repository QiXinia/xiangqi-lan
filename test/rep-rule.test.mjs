// 循环走子规则边界测试: node test/rep-rule.test.mjs
//  1) 双方无意义往返(双闲): 第2次同局面 repWarn(无长将责任方)且不终局; 第3次判 repetition 和棋
//  2) 一方连续长将: 第2次 repWarn 标出长将方; 第3次长将方判负(perpetual)
//  3) 第2次预警后主动变招脱离循环: repWarn 解除
import * as E from '../js/engine.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ FAIL:', msg); } }
function play(s, seq) { for (const [f, t] of seq) E.applyMove(s, f, t); }

// ---------- 1. 双闲循环: 红车在己方底线左右闲走, 黑将在 4/5 路底线往返 ----------
{
  const s = E.createState({ fen: '4k4/9/9/9/9/9/9/9/9/R2K5 r' });
  // 红车(0,9)<->(1,9); 黑将(4,0)<->(5,0); 4 个半回合一个周期回到初始局面
  const cyc = [
    [[0, 9], [1, 9]], [[4, 0], [5, 0]], [[1, 9], [0, 9]], [[5, 0], [4, 0]]
  ];
  play(s, cyc); // 第 2 次出现初始局面
  ok(s.status === 'playing', '双闲: 第2次重复仍行棋中');
  ok(!!s.repWarn && s.repWarn.perpetualSide === null, '双闲: 第2次重复给和棋预警(无长将方)');
  play(s, cyc); // 第 3 次
  ok(s.status === 'draw' && s.reason === 'repetition', `双闲: 第3次重复判和, got ${s.status}/${s.reason}`);
}

// ---------- 2. 红方长将: 红车在 (4,1)/(5,1) 反复竖将, 黑将 4/5 路往返躲避 ----------
{
  const s = E.createState({ fen: '4k4/3R5/9/9/9/9/9/9/9/3K5 r' });
  // 局面 S_a = 车(4,1) 将(5,0) 轮红; S_b = 车(5,1) 将(4,0) 轮红; 周期 4 半回合
  // 先走成 S_a
  play(s, [[[3, 1], [4, 1]], [[4, 0], [5, 0]]]);
  const toB = [[[4, 1], [5, 1]], [[5, 0], [4, 0]]]; // S_a -> S_b
  const toA = [[[5, 1], [4, 1]], [[4, 0], [5, 0]]]; // S_b -> S_a
  play(s, toB); // S_b 第1次
  play(s, toA); // S_a 第2次
  ok(s.status === 'playing', '长将: 第2次重复仍行棋中(预警阶段)');
  ok(!!s.repWarn && s.repWarn.perpetualSide === 'r', `长将: 预警标出红方为长将方, got ${s.repWarn && s.repWarn.perpetualSide}`);
  play(s, toB); // S_b 第2次
  play(s, toA); // S_a 第3次 -> 终局
  ok(s.status === 'blackwin' && s.reason === 'perpetual', `长将: 红方长将判负(黑胜), got ${s.status}/${s.reason}`);
}

// ---------- 3. 预警后主动变招: repWarn 应解除 ----------
{
  const s = E.createState({ fen: '4k4/9/9/9/9/9/9/9/9/R2K5 r' });
  const cyc = [
    [[0, 9], [1, 9]], [[4, 0], [5, 0]], [[1, 9], [0, 9]], [[5, 0], [4, 0]]
  ];
  play(s, cyc); // 第2次 -> 预警
  ok(!!s.repWarn, '变招: 已出现循环预警');
  // 红方不再往返, 改走车(0,9)->(2,9) 脱离; 黑方也走一步闲(将 4->5)
  E.applyMove(s, [0, 9], [2, 9]);
  E.applyMove(s, [4, 0], [5, 0]);
  ok(s.repWarn === null && s.status === 'playing', '变招: 脱离循环后预警解除且继续对局');
}

console.log(fail ? `\n❌ rep-rule FAIL x${fail}` : `\n✅ rep-rule ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
