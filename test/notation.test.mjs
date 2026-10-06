// 中文谱解析互逆测试: node test/notation.test.mjs
// 对大量随机/实战局面, 每条合法着法经 moveNotation→parseMove 必须还原同一着法
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { parseMove, canon, playLine } from '../js/notation.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } };

function checkState(s, tag) {
  for (const c of ['r', 'b']) {
    if (s.turn !== c) continue;
    for (const m of E.legalMoves(s, c)) {
      const notation = E.moveNotation(s, m.from, m.to);
      const back = parseMove(s, notation);
      if (!back || back.from[0] !== m.from[0] || back.from[1] !== m.from[1] ||
        back.to[0] !== m.to[0] || back.to[1] !== m.to[1]) {
        ok(false, `${tag} 互逆失败: ${notation} -> ${JSON.stringify(back)} 原着 ${JSON.stringify(m.from)}->${JSON.stringify(m.to)}`);
      } else pass++;
    }
  }
}

// 1. 开局及多局 AI 自对弈全着法互逆
for (const seed of [1, 22]) {
  const s = E.createState();
  checkState(s, '开局');
  while (s.status === 'playing' && s.moves.length < 60) {
    const mv = searchBestMove(s, { level: 3, deadline: Date.now() + 1500, rng: E.mulberry32(seed + s.moves.length) });
    if (!mv) break;
    E.applyMove(s, mv.from, mv.to);
    checkState(s, `seed${seed}#${s.moves.length}`);
  }
}

// 2. 残局局面(含兵卒/马炮多同名)互逆
for (const fen of [
  '4k4/9/4C4/1C7/9/9/9/9/9/3K5 r',
  '2b1k1b2/9/2R4R1/9/9/9/9/9/9/3K5 r',
  '4k4/8C/9/3PP4/9/9/9/9/9/3K5 r',
  '3aka3/9/5R3/9/1R7/9/9/9/9/3K5 r'
]) {
  checkState(E.createState({ fen }), fen);
}

// 3. 已知谱着解析
{
  const s = E.createState();
  const r = playLine(s, ['炮二平五', '炮8平5', '马二进三', '马8进7', '车一进一', '车9平8']);
  ok(r.ok, '顺炮横车谱着全部合法, error=' + r.errorText);
  ok(r.moves.length === 6, '解析出 6 手');
  ok(s.board[2][1] && s.board[2][1].c === 'b' && s.board[2][1].t === 'C', '黑左炮移到右肋(炮8平5 后黑炮在中路)');
}

// 4. 前后同名子(双兵同列/双车)解析
{
  const s = E.createState({ fen: '4k4/9/9/9/3P5/9/3P5/9/9/3K5 r' }); // 两红兵同列
  const m1 = parseMove(s, '前兵进一');
  ok(m1 && m1.from[0] === 3 && m1.from[1] === 4 && m1.to[1] === 3, '前兵进一 解析到上游兵');
  const m2 = parseMove(s, '后兵进一');
  ok(m2 && m2.from[0] === 3 && m2.from[1] === 6 && m2.to[1] === 5, '后兵进一 解析到下游兵');
}

// 5. 非法着法返回 null
{
  const s = E.createState();
  ok(parseMove(s, '炮二进九') === null, '炮二进九(无子可打/越子) 非法返回 null');
}

ok(canon('炮 二 平 五') === '炮2平5', 'canon 去空格与中文数字');

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ HAS FAILURES'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
