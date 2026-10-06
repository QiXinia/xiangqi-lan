import * as E from '../js/engine.js';
// 评估对称性: 把局面颜色反转(红黑互换+转置180度)后, 评估分应取负。
// 我们不直接导出 evaluate, 改用 scoreMove 间接验证零和: 构造对称局面双方局面评估一致反号。
// 这里用一个黑方视角镜像 FEN: 手动构造几个局面, 比较 engine 层面的对称性搜索结论。
// 更直接: 测试 evaluate 对称性通过 searchBestMove 在镜像局面给出相反优劣。
import { searchBestMove } from '../js/ai.js';
// 局面A: 红多一车 (红车在黑半场), 黑无对应 → 红大优
const A = '3k5/9/9/9/9/9/9/9/9/4K1R2 r';
// 镜像(颜色反转+上下翻转): 黑多一车 → 黑大优(=红劣)
const B = '4k1r2/9/9/9/9/9/9/9/9/3K5 b';
for (const fen of [A,B]) {
  const s = E.createState({fen});
  const mv = searchBestMove(s, {level:5, deadline:Date.now()+800, noBook:true, deterministic:true});
  console.log(fen, '->', mv.from, mv.to, 'score', mv.score, 'depth', mv.depth);
}
