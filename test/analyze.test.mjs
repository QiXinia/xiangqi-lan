// AI 复盘分析测试: node test/analyze.test.mjs
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { analyzeGame, gradeMove, MATE } from '../js/analyze-core.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ FAIL:', msg); } }

// 造一局 lv5(红) 对 lv1(黑) 的前若干手, 返回 moves 记录(含 notation/captured)
function buildGame(plies, redLv = 5, blackLv = 1, seed = 5) {
  const s = E.createState();
  const moves = [];
  for (let i = 0; i < plies; i++) {
    if (s.status !== 'playing') break;
    const lv = s.turn === 'r' ? redLv : blackLv;
    const mv = searchBestMove(s, { level: lv, deadline: Date.now() + 1500, rng: (() => { let x = seed + i; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })() });
    if (!mv) break;
    const rec = E.applyMove(s, mv.from, mv.to);
    moves.push({ from: mv.from, to: mv.to, notation: rec.notation, captured: rec.captured });
  }
  return { state: s, moves };
}

// ---------- 1. 评级分档边界(深搜 depth>=7 阈值) ----------
{
  ok(gradeMove(100, 100, true, null, 8) === 'best', '等值着法评正着');
  ok(gradeMove(100, 70, false, null, 8) === 'inaccuracy', '差30评缓手');
  ok(gradeMove(200, 100, false, null, 8) === 'mistake', '差100评错着');
  ok(gradeMove(300, 100, false, null, 8) === 'blunder', '差200评败着');
  ok(gradeMove(MATE - 5, 100, false, null, 5) === 'blunder', '漏杀评败着(不受深度影响)');
  ok(gradeMove(150, 100, false, null, 8) === 'mistake', '深搜差50评错着');
  ok(gradeMove(150, 100, false, null, 5) === 'inaccuracy', '浅深度差50放宽为缓手');
  const sac = { captured: { t: 'R' } };
  ok(gradeMove(200, 200, true, sac, 8) === 'brilliant', '弃车占优评妙手');
  ok(gradeMove(MATE - 5, MATE - 5, true, null, 8) === 'brilliant', '成杀着评妙手');
  ok(gradeMove(-200, -200, true, null, 8) === 'good', '劣势最顽强评好着');
}

// ---------- 2. 正常对局分析结构完整 ----------
{
  const { moves } = buildGame(14);
  ok(moves.length >= 10, `生成对局 ${moves.length} 手(>=10)`);
  const report = analyzeGame({}, moves, { deadlineMs: 1500 });
  ok(report.analyzed === moves.length, `分析手数=${report.analyzed} 等于棋谱 ${moves.length}`);
  ok(report.grades.every(g => ['brilliant', 'good', 'best', 'inaccuracy', 'mistake', 'blunder'].includes(g.grade)), '每手评级合法');
  ok(report.grades.every(g => g.bestNotation && Number.isFinite(g.redView)), '每手有最佳着与有限红视角分');
  ok(report.curve.length === report.analyzed, '评分曲线点数匹配');
  ok(report.blunders.length <= report.analyzed, '失误列表长度合理');
  console.log('  正常对局评级分布:', JSON.stringify(report.counts), '均深', report.avgDepth);
  // 大师对入门, 红方(大师)前 14 手不应出现败着/错着
  const redBad = report.grades.filter(g => g.color === 'r' && (g.grade === 'blunder' || g.grade === 'mistake')).length;
  ok(redBad === 0, `大师方前14手无错/败着(实际 ${redBad})`);
}

// ---------- 3. 短局分析结构可用 ----------
{
  const { moves } = buildGame(2);
  const report = analyzeGame({}, moves, { deadlineMs: 1000 });
  ok(report.analyzed === moves.length, '短局分析手数匹配');
}

// ---------- 4. 分析过程不污染初始局面 ----------
{
  const { moves } = buildGame(8);
  const before = E.toFEN(E.createState());
  analyzeGame({}, moves, { deadlineMs: 1000 });
  ok(E.toFEN(E.createState()) === before, '分析过程不污染初始局面');
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ HAS FAILURES'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
