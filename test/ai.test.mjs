// AI 测试: node test/ai.test.mjs
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ FAIL:', msg); } }

// ---------- 1. 一步杀: 马后炮(炮四平五, 马控两角, 炮架马打将) ----------
{
  // 黑光将(4,0); 红马(4,2)控(3,0)(5,0); 红炮(5,4)平中(4,4)即成马后炮
  const s = E.createState({ fen: '4k4/9/4N4/9/5C3/9/9/9/9/3K5 r' });
  ok(!E.isInCheck(s, 'b'), '走子前黑方未被将军(局面合法)');
  const mv = searchBestMove(s, { level: 3, deadline: Date.now() + 3000 });
  ok(mv.from[0] === 5 && mv.from[1] === 4 && mv.to[0] === 4 && mv.to[1] === 4,
    `AI 找到马后炮一步杀, got ${mv.from}->${mv.to} score=${mv.score}`);
  E.applyMove(s, mv.from, mv.to);
  ok(s.status === 'redwin' && s.reason === 'checkmate', '马后炮落子后红胜(将死)');
}

// ---------- 2. AI 着法合法性(中局) ----------
{
  const s = E.createState();
  E.applyMove(s, [7, 7], [4, 7]); E.applyMove(s, [1, 2], [4, 2]);
  E.applyMove(s, [7, 9], [6, 7]);
  const mv = searchBestMove(s, { level: 3, deadline: Date.now() + 2000 });
  const legal = E.legalMoves(s).some(m => m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
  ok(legal, `中局 AI 着法合法 (${mv.from}->${mv.to})`);
}

// ---------- 2b. 搜索不得修改输入局面(空着裁剪 make/unmake/turn 平衡) ----------
{
  const s = E.createState();
  E.applyMove(s, [4, 6], [4, 5]); // 兵五进一, 轮到黑方
  const fenBefore = E.toFEN(s), turnBefore = s.turn;
  const mv = searchBestMove(s, { level: 5, deadline: Date.now() + 8000 }); // depth>=4 触发 null-move
  ok(E.toFEN(s) === fenBefore, '大师搜索后局面 FEN 不变');
  ok(s.turn === turnBefore, `大师搜索后行棋方不变(仍为 b), got ${s.turn}`);
  const mover = s.board[mv.from[1]][mv.from[0]];
  ok(mover && mover.c === 'b', `返回着法属于行棋方(黑), got ${mover && mover.c + mover.t}`);
  const legal = E.legalMoves(s).some(m => m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
  ok(legal, `大师应招合法 (${mv.from}->${mv.to})`);
}

// ---------- 3. AI 所有着法合法 + 自对弈完整终局 ----------
function selfPlay(levelR, levelB, jieqi, seed, maxNodes = 300) {
  const s = E.createState(jieqi ? { jieqi: true, seed } : {});
  let illegal = 0;
  while (s.status === 'playing' && s.moves.length < maxNodes) {
    const lvl = s.turn === 'r' ? levelR : levelB;
    const mv = searchBestMove(s, { level: lvl, deadline: Date.now() + 4000 });
    if (!mv) break;
    const legal = E.legalMoves(s).some(m => m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
    if (!legal) { illegal++; break; }
    E.applyMove(s, mv.from, mv.to);
  }
  return { status: s.status, reason: s.reason, n: s.moves.length, illegal };
}
{
  const g1 = selfPlay(3, 3, false, 1);
  console.log('经典 AI 自对弈(lv3):', g1);
  ok(g1.illegal === 0, '经典自对弈无非法着法');
  ok(g1.status !== 'playing' || g1.n >= 100, '经典自对弈终局或足够长');
  const g2 = selfPlay(2, 3, true, 7);
  console.log('揭棋 AI 自对弈(lv2/3):', g2);
  ok(g2.illegal === 0, '揭棋自对弈无非法着法');
  const g3 = selfPlay(1, 1, false, 3, 200);
  console.log('入门 AI 自对弈:', g3);
  ok(g3.illegal === 0, '入门自对弈无非法着法');
}

// ---------- 4. AI 水平梯度: 大师应击败入门(3 局两胜) ----------
{
  let masterWins = 0;
  for (const seed of [11, 22, 33]) {
    const s = E.createState();
    while (s.status === 'playing' && s.moves.length < 260) {
      const lvl = s.turn === 'r' ? 5 : 1; // 红=大师
      const mv = searchBestMove(s, { level: lvl, deadline: Date.now() + 5000 });
      if (!mv) break;
      E.applyMove(s, mv.from, mv.to);
    }
    console.log(`梯度测试 seed=${seed}:`, s.status, s.reason, s.moves.length, '手');
    if (s.status === 'redwin') masterWins++;
  }
  ok(masterWins >= 2, `大师对入门至少胜 2 局(实际 ${masterWins}/3)`);
}

// ---------- 5. 性能基准(node) ----------
{
  const s = E.createState();
  for (const d of [2, 3, 4]) {
    const t0 = Date.now();
    const mv = searchBestMove(s, { level: d === 2 ? 2 : d === 3 ? 3 : 4, deadline: Date.now() + 20000 });
    console.log(`开局 depth=${mv.depth} 耗时 ${Date.now() - t0}ms 着法=${mv.notation || E.moveNotation(s, mv.from, mv.to)}`);
  }
  ok(true, '性能基准输出完成');
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ HAS FAILURES'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
