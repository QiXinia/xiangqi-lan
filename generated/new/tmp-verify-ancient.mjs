// 古谱全局数据分片引擎回放校验脚本（硬性校验：引擎回放是唯一事实标准）
import * as E from '../../js/engine.js';
import { playLine } from '../../js/notation.js';
import { OPENINGS } from '../../js/openings.js';
import { NEW_OPENINGS } from './ancient-games.mjs';

// 同局面下枚举全部合法着法并生成谱名（用于纠错/消歧）
function listLegal(state) {
  return E.legalMoves(state, state.turn).map(m => E.moveNotation(state, m.from, m.to));
}

let fail = 0;
const existing = new Set(OPENINGS.map(o => o.name));
const seen = new Set();
const ALLOWED = ['红胜', '黑胜', '和棋', '红胜（谱至得子成势）'];

for (const g of NEW_OPENINGS) {
  const s = E.createState();
  const r = playLine(s, g.moves);
  const ply = g.moves.length;
  const moves = Math.ceil(ply / 2);
  let line = `【${g.name}】《${g.family}》 手数=${moves} (半回合${ply})`;
  if (!r.ok) {
    fail++;
    line += `  ❌非法着法 idx=${r.errorIndex}(${r.errorText}) 已走${r.moves.length}着`;
    console.log(line);
    console.log('   轮到', s.turn, '合法着法:', listLegal(s).join(' '));
  } else {
    line += `  ✅全合法 status=${s.status} reason=${s.reason||'-'} result=${g.result}`;
    console.log(line);
  }
  // result 合法值
  if (!ALLOWED.includes(g.result)) { fail++; console.log('   ⚠️result非法:', g.result); }
  // 去重检查
  if (existing.has(g.name)) { fail++; console.log('   ⚠️与现有OPENINGS重名:', g.name); }
  if (seen.has(g.name)) { fail++; console.log('   ⚠️分片内部重名:', g.name); }
  seen.add(g.name);
  // 字符检查
  if (/砲|漢/.test(g.moves.join('') + g.intro)) { fail++; console.log('   ⚠️出现禁用字 砲/漢:', g.name); }
}
console.log('----');
console.log(`共 ${NEW_OPENINGS.length} 局, 失败 ${fail}`);
process.exit(fail ? 1 : 0);
