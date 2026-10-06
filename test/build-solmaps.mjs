// 将 test/logs/solmaps.json 转换为产品模块 js/sol-maps.js
// 用法: node test/build-solmaps.mjs
import fs from 'fs';
const data = JSON.parse(fs.readFileSync('test/logs/solmaps.json', 'utf8'));
const ids = Object.keys(data).map(Number).sort((a, b) => a - b);
let out = `// ============================================================
// 残局缓手控杀深局的【离线强制杀解面】(由 test/gen-solmaps.mjs 自动生成, 请勿手改)
//   少数深层杀局含不将军的控杀妙手, 在线精确求解在低端设备上可能超过提示时限;
//   这里预置其最优攻着树中每个【攻击方(红)行棋局面】的一着必胜着, 覆盖防守方
//   全部合法应着, 玩家逐手照提示走即可在 mate 手内必成杀。
//   键=engine.toFEN 局面串; 值="fx fy-tx ty"(坐标均为 0..8 单个数字)。
// ============================================================
export const SOL_MAPS = {
`;
let total = 0;
for (const id of ids) {
  const e = data[id];
  const n = Object.keys(e.map).length; total += n;
  out += `  // ${id} ${e.name} (${e.mate}步, ${n} 条)\n`;
  out += `  ${id}: { n: ${e.mate}, m: ${JSON.stringify(e.map)} },\n\n`;
}
out += `};\n`;
fs.writeFileSync('js/sol-maps.js', out);
console.log(`写入 js/sol-maps.js: 关卡 ${ids.length}, 解面总条数 ${total}, 字节 ${out.length}`);
