// 开局库着法合法性校验: node test/openings-check.mjs
import * as E from '../js/engine.js';
import { OPENINGS } from '../js/openings.js';
import { playLine } from '../js/notation.js';

let fail = 0;
for (const op of OPENINGS) {
  // 古谱全局从初始满盘起; 江湖排局·名局鉴赏从自定义 FEN 起
  const s = E.createState(op.fen ? { fen: op.fen } : {});
  const r = playLine(s, op.moves);
  if (r.ok) {
    console.log(`✓ [${op.cat}] ${op.name}: ${op.moves.length} 手合法`);
  } else {
    fail++;
    console.log(`✗ ${op.name}: 第${r.errorIndex + 1}手「${r.errorText}」非法/无法解析`);
  }
}
console.log(fail ? `\n❌ FAIL x${fail}` : `\n✅ ALL ${OPENINGS.length} OPENINGS PASS`);
process.exit(fail ? 1 : 0);
