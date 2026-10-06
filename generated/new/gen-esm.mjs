import fs from 'fs';
const a=JSON.parse(fs.readFileSync(new URL('./final.json',import.meta.url),'utf8'));
const order={mate1:0,mate2:1,mate3:2,mate4:3,mate5:4,classic:5};
a.sort((x,y)=>order[x.chapter]-order[y.chapter]||x.name.localeCompare(y.name,'zh'));
const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
let out="// 残局闯关 新杀局数据分片(红先; 全部经穷举求解器确定性验证为最短强制杀, 主线黑最顽强应着走到 redwin, 初始双方均不被将军)\n";
out+="// chapter: mate1..mate5=最短强制杀手数; classic=古谱连将杀. FEN 10行/红大写黑小写/末位 r=红先.\n";
out+="export const NEW_PUZZLES = [\n";
for(const p of a){
  const L=[`name: '${esc(p.name)}'`,`chapter: '${p.chapter}'`,`mate: ${p.mate}`,`fen: '${esc(p.fen)}'`,`hint: '${esc(p.hint)}'`,`line: '${esc(p.line)}'`];
  if(p.source)L.push(`source: '${esc(p.source)}'`);
  out+='  { '+L.join(', ')+' },\n';
}
out+="];\n";
fs.writeFileSync(new URL('./motif-puzzles.mjs',import.meta.url),out);
console.log('written',a.length);
