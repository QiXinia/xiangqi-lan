// mate=1 一步杀分片: 用 fixed 引擎读回现有 shard + 定向补马形 -> 全量重验 -> JSON.stringify 覆盖落盘
import * as E from './engine-fixed.mjs';
import { PUZZLES } from '../js/puzzles.js';
import { playLine } from './notation-fixed.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

function lmake(s,m){const[fx,fy]=m.from,[tx,ty]=m.to;const p=s.board[fy][fx],cap=s.board[ty][tx];s.board[ty][tx]=p;s.board[fy][fx]=null;const wh=p.hidden,o=p.orig;if(wh){p.hidden=false;p.orig=undefined;}s.turn=s.turn==='r'?'b':'r';return{p,cap,fx,fy,tx,ty,wh,o};}
function lundo(s,u){s.board[u.fy][u.fx]=u.p;s.board[u.ty][u.tx]=u.cap;if(u.wh){u.p.hidden=true;u.p.orig=u.o;}s.turn=s.turn==='r'?'b':'r';}
function findMateMove(st, preferType) {
  let first=null;
  for (const m of E.legalMoves(st,'r')) {
    const u=lmake(st,m);
    const n=E.legalMoves(st,'b').length;
    lundo(st,u);
    if (n===0) {
      if (!first) first=m;
      if (preferType && st.board[m.from[1]][m.from[0]].t===preferType) return m;
    }
  }
  return first;
}
function signature(fen){const rows=fen.split(' ')[0].split('/');const cells=[];for(let y=0;y<rows.length;y++){let x=0;for(const ch of rows[y]){if(/\d/.test(ch)){x+=+ch;continue;}cells.push(`${ch}${x},${y}`);x++;}}return cells.sort().join('|');}
const existingSig=new Set(PUZZLES.map(p=>signature(p.fen)));

// 全量质量门: 返回错误串或 null
function gate(pz) {
  let st; try{ st=E.createState({fen:pz.fen}); }catch(e){ return 'FEN:'+e.message; }
  if (E.isInCheck(st,'b')) return '初始黑被将';
  if (E.isInCheck(st,'r')) return '初始红被将';
  if (st.status!=='playing') return '初始终局';
  // 黑将存活
  if (!E.findKing(st,'b')) return '黑将缺失';
  // 恰好一步杀
  const mv = findMateMove(st);
  if (!mv) return '无一步杀(最短杀!=1)';
  // 主变 playLine
  const texts = pz.line.replace(/#\s*$/,'').trim().split(/\s+/);
  const s2 = E.createState({fen:pz.fen});
  const r = playLine(s2, texts);
  if (!r.ok) return '主变非法:'+r.errorText;
  if (s2.status!=='redwin') return '未红胜:'+s2.status+'/'+s2.reason;
  return null;
}

// ---- 新补马形候选(正确马腿规则下手工构造, 待引擎验证) ----
const NEW = [
['卧槽马·一','马跳右翼卧槽叫将，车控肋道斜位，将无路可走。','5k3/5a3/4R4/8N/9/9/9/9/9/3K5 r','N'],
['卧槽马·二','马跳左翼卧槽，车占将门斜位成杀。','3k5/3a5/4R4/N8/9/9/9/9/9/3K5 r','N'],
['卧槽马·三','卧槽马定将，底车兜底，士象难救。','5k3/5a3/4R4/8N/9/2b6/9/9/9/3K5 r','N'],
['立马车·二','马控将门斜位，车沉底照将成立马车。','5k3/4a4/3N5/6R2/9/9/9/9/9/4K4 r','R'],
['立马车·三','勒马车：马困将，车甩底路成杀。','3k5/4a4/5N3/2R6/9/9/9/9/9/4K4 r','R'],
];

// ---- 读回现有局(剔除本脚本本次负责的新补局, 保证幂等) ----
const newNames = new Set(NEW.map(n=>n[0]));
const shard = JSON.parse(readFileSync(new URL('../generated/shard-mate1.json', import.meta.url)))
  .filter(p=>!newNames.has(p.name));
console.error('读回现有', shard.length, '局(已剔除本次新补局)');

// 组装最终列表: 旧 42 + 新候选
const final = shard.slice();
for (const [name,hint,fen,deliverer] of NEW) {
  const probe = E.createState({fen});
  if (E.isInCheck(probe,'b')||E.isInCheck(probe,'r')) { console.error('✗',name,'初始被将'); continue; }
  const mv = findMateMove(probe, deliverer);
  if (!mv) { console.error('✗',name,'无一步杀'); continue; }
  const gotType = probe.board[mv.from[1]][mv.from[0]].t;
  if (gotType!==deliverer) { console.error('✗',name,`无${deliverer}杀着(仅${gotType})`); continue; }
  const line = E.moveNotation(probe, mv.from, mv.to) + ' #';
  final.push({ chapter:'mate1', name, mate:1, fen, hint, line });
}

// ---- 全量重验 ----
let fail=0; const seen=new Set();
const rep={};
for (const pz of final) {
  const e = gate(pz);
  if (e) { console.error('✗', pz.name, e); fail++; continue; }
  const sig = signature(pz.fen);
  if (existingSig.has(sig)) { console.error('✗', pz.name, '撞PUZZLES54'); fail++; continue; }
  if (seen.has(sig)) { console.error('✗', pz.name, '分片内重复'); fail++; continue; }
  seen.add(sig);
  const shape=pz.name.split('·')[0]; rep[shape]=(rep[shape]||0)+1;
}
if (fail) { console.error('\n❌ 重验失败 '+fail+' 局, 不落盘'); process.exit(1); }

writeFileSync(new URL('../generated/shard-mate1.json', import.meta.url), JSON.stringify(final,null,2));
console.error('\n✅ 全量重验通过, 总', final.length, '局');
console.error('杀形覆盖:', JSON.stringify(rep));
console.error('已覆盖写 shard-mate1.json');
