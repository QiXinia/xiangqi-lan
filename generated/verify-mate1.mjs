// 独立断言: 读回 shard-mate1.json, 重跑质量门 1)-4)
// node generated/verify-mate1.mjs
import * as E from './engine-fixed.mjs';
import { PUZZLES } from '../js/puzzles.js';
import { playLine } from './notation-fixed.mjs';
import { readFileSync } from 'node:fs';

function lmake(s,m){const[fx,fy]=m.from,[tx,ty]=m.to;const p=s.board[fy][fx],cap=s.board[ty][tx];s.board[ty][tx]=p;s.board[fy][fx]=null;const wh=p.hidden,o=p.orig;if(wh){p.hidden=false;p.orig=undefined;}s.turn=s.turn==='r'?'b':'r';return{p,cap,fx,fy,tx,ty,wh,o};}
function lundo(s,u){s.board[u.fy][u.fx]=u.p;s.board[u.ty][u.tx]=u.cap;if(u.wh){u.p.hidden=true;u.p.orig=u.o;}s.turn=s.turn==='r'?'b':'r';}
function findMateMove(st){for(const m of E.legalMoves(st,'r')){const u=lmake(st,m);const n=E.legalMoves(st,'b').length;lundo(st,u);if(n===0)return m;}return null;}
function signature(fen){const rows=fen.split(' ')[0].split('/');const cells=[];for(let y=0;y<rows.length;y++){let x=0;for(const ch of rows[y]){if(/\d/.test(ch)){x+=+ch;continue;}cells.push(`${ch}${x},${y}`);x++;}}return cells.sort().join('|');}

const data = JSON.parse(readFileSync(new URL('../generated/shard-mate1.json', import.meta.url)));
const existingSig = new Set(PUZZLES.map(p=>signature(p.fen)));
const seen = new Set();
let fail = 0;
console.log('读回', data.length, '局');
for (const pz of data) {
  const errs = [];
  // schema
  if (pz.chapter!=='mate1'||pz.mate!==1) errs.push('schema');
  let st; try{ st=E.createState({fen:pz.fen}); }catch(e){ errs.push('FEN:'+e.message); }
  if (st) {
    // 门1: 双方均不被将军(将帅不照面)
    if (E.isInCheck(st,'b')) errs.push('初始黑被将');
    if (E.isInCheck(st,'r')) errs.push('初始红被将');
    // 门2: 初始未终局 + 恰好一步杀(穷举)
    if (st.status!=='playing') errs.push('初始终局');
    const mv = findMateMove(st);
    if (!mv) errs.push('无一步杀');
    else {
      // 确认最短杀=1: 存在立即杀且初始未终局 => 最短即1
    }
    // 门3: playLine 主变
    const texts = pz.line.replace(/#\s*$/,'').trim().split(/\s+/);
    if (texts.length!==1) errs.push('line非单着');
    const s2 = E.createState({fen:pz.fen});
    const r = playLine(s2, texts);
    if (!r.ok) errs.push('主变非法:'+r.errorText);
    else if (s2.status!=='redwin') errs.push('未红胜:'+s2.status+'/'+s2.reason);
    // 注: 局面可能有多步一步杀, 只要谱着本身合法且致红胜即可, 不要求等于首个杀着
  }
  // 门4: 去重(现有54 + 分片内)
  const sig = signature(pz.fen);
  if (existingSig.has(sig)) errs.push('撞现有题库');
  if (seen.has(sig)) errs.push('分片内重复');
  seen.add(sig);
  if (errs.length) { fail++; console.log('✗', pz.name, errs.join('；')); }
}
console.log(fail ? `\n❌ FAIL x${fail}` : `\n✅ ALL ${data.length} 局通过质量门 1)-4)`);
process.exit(fail?1:0);
