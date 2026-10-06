// 最终装配: 统一穷举校验 drill+classic, 导出 final.json
import * as E from '../../js/engine.js';
import { playLine } from '../../js/notation.js';
import { PUZZLES as OLD } from '../../js/puzzles.js';
import fs from 'fs';
import { CANDIDATES } from './candidates.mjs';
import { CLASSIC } from './classic.mjs';

function mk(s,m){const[fx,fy]=m.from,[tx,ty]=m.to;const p=s.board[fy][fx],cap=s.board[ty][tx];s.board[ty][tx]=p;s.board[fy][fx]=null;const wh=p.hidden,o=p.orig;if(wh){p.hidden=false;p.orig=undefined;}s.turn=s.turn==='r'?'b':'r';return{p,cap,fx,fy,tx,ty,wh,o};}
function un(s,u){s.board[u.fy][u.fx]=u.p;s.board[u.ty][u.tx]=u.cap;if(u.wh){u.p.hidden=true;u.p.orig=u.o;}s.turn=s.turn==='r'?'b':'r';}
let NODES=0;const CAP=2_000_000;const BUDGET=Symbol('b');
function findAll(s,n){for(const m of E.legalMoves(s,'r')){if(++NODES>CAP)throw BUDGET;const u=mk(s,m);const bs=E.legalMoves(s,'b');let g=bs.length===0;if(!g&&n>1){g=true;for(const bm of bs){const u2=mk(s,bm);const r=findAll(s,n-1);un(s,u2);if(!r){g=false;break;}}}un(s,u);if(g)return m;}return null;}
function bestline(fen,n){const s=E.createState({fen});const out=[];let cur=n,g=0;while(cur>0&&g++<30){let r;NODES=0;try{r=findAll(s,cur);}catch(e){if(e!==BUDGET)throw e;r=null;}if(!r)return null;out.push(E.moveNotation(s,r.from,r.to));mk(s,r);const bs=E.legalMoves(s,'b');if(!bs.length){out.push('#');return out.join(' ');}let best=null,bn=-1;for(const bm of bs){const u2=mk(s,bm);let k=0;try{for(let z=1;z<=cur-1;z++){NODES=0;if(findAll(s,z)){k=z;break;}}}catch(e){if(e!==BUDGET)throw e;k=k||0;}un(s,u2);if(k===0){best=bm;break;}if(k>bn){bn=k;best=bm;}}out.push(E.moveNotation(s,best.from,best.to));mk(s,best);cur--;}return null;}
function solveMate(fen,maxN){for(let n=1;n<=maxN;n++){NODES=0;let r=null;try{r=findAll(E.createState({fen}),n);}catch(e){if(e!==BUDGET)throw e;continue;}if(r){const line=bestline(fen,n);if(line)return{mate:n,line};}}return null;}
function lineVerify(fen,line){const s=E.createState({fen});const texts=line.replace(/\s*#\s*$/,'').split(/\s+/).filter(Boolean);const r=playLine(s,texts);if(!r.ok)return{ok:false,why:'line第'+(r.errorIndex+1)+'着「'+texts[r.errorIndex]+'」不合法'};if(s.status!=='redwin')return{ok:false,why:'status='+s.status};return{ok:true};}
function sigOfFen(fen){const s=E.createState({fen});const cells=[];for(let y=0;y<10;y++)for(let x=0;x<9;x++){const c=s.board[y][x];if(c)cells.push(c.c+c.t+x+','+y);}cells.sort();const mir=cells.map(z=>{const[a,b,rest]=z;const[x,y]=rest.split(',').map(Number);return a+b+(8-x)+','+y;}).sort();return[cells.join('|'),mir.join('|')];}
// legality
const set=(...a)=>new Set(a.map(([x,y])=>x+','+y));
const K_R=set([3,9],[4,9],[5,9],[3,8],[4,8],[5,8],[3,7],[4,7],[5,7]);
const K_B=set([3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]);
const A_R=set([3,9],[5,9],[4,8],[3,7],[5,7]);const A_B=set([3,0],[5,0],[4,1],[3,2],[5,2]);
const B_R=set([2,9],[6,9],[0,7],[4,7],[8,7],[2,5],[6,5]);const B_B=set([2,0],[6,0],[0,2],[4,2],[8,2],[2,4],[6,4]);
const EVENS=new Set([0,2,4,6,8]);const CAPN={K:1,A:2,B:2,N:2,R:2,C:2,P:5};
function legality(fen){const rows=fen.trim().split(/\s+/)[0].split('/');if(rows.length!==10)return'行数';const cnt={r:{},b:{}};for(let y=0;y<10;y++){let x=0;for(const ch of rows[y]){if(/\d/.test(ch)){x+=+ch;continue;}if(ch==='x'||ch==='o'){x++;continue;}const up=ch.toUpperCase();const isR=ch===up;const c=isR?'r':'b';cnt[c][up]=(cnt[c][up]||0)+1;const key=x+','+y;if(up==='K'){if(isR?!K_R.has(key):!K_B.has(key))return'王越九宫';}else if(up==='A'){if(isR?!A_R.has(key):!A_B.has(key))return'士位非法';}else if(up==='B'){if(isR?!B_R.has(key):!B_B.has(key))return'相位非法';}else if(up==='P'){if(isR){if(y>6)return'红兵越底';}else{if(y<3)return'黑卒越底';}}x++;}if(x!==9)return'行宽';}for(const c of['r','b'])for(const t in CAPN){const n=cnt[c][t]||0;if(t==='K'&&n!==1)return'王数';if(t!=='K'&&n>CAPN[t])return'too many '+t;}return null;}

// dedup sets
const seen=new Map();
for(const p of OLD){const[sg,mg]=sigOfFen(p.fen);seen.set(sg,p.name);seen.set(mg,p.name);}
for(const f of['ancient-games.mjs','famous-endgames.mjs']){const txt=fs.readFileSync(new URL('./'+f,import.meta.url),'utf8');for(const m of txt.matchAll(/fen:\s*'([^']+)'/g)){const[sg,mg]=sigOfFen(m[1]);seen.set(sg,f);seen.set(mg,f);}}
const seenBase=new Set(OLD.map(p=>p.name.replace(/[·].*$/,'').replace(/[②③④⑤]$/,'')));
const seenName=new Set(OLD.map(p=>p.name));
const intra=new Map();

const drops=[];const final=[];
function process(p,isClassic){
  const why=[];
  const lg=legality(p.fen); if(lg)why.push(lg);
  let st=null; try{st=E.createState({fen:p.fen});}catch(e){why.push('FEN异常');}
  if(st){if(E.isInCheck(st,'r')||E.isInCheck(st,'b'))why.push('初始即将军');if(!E.legalMoves(st,'r').length)why.push('红无着');}
  if(seenName.has(p.name))why.push('重名');
  if(seenBase.has(p.name.replace(/[·].*$/,'').replace(/[②③④⑤]$/,'')))why.push('名基撞');
  let solved=null;
  if(st&&!why.length){solved=solveMate(p.fen,isClassic?5:6);if(!solved)why.push((isClassic?5:6)+'步内无强制杀');}
  if(solved){
    if(isClassic&&solved.mate>5)why.push('classic mate='+solved.mate+'>5');
    const lv=lineVerify(p.fen,solved.line);if(!lv.ok)why.push('line:'+lv.why);
  }
  if(st&&!why.length){const[sg,mg]=sigOfFen(p.fen);for(const k of[sg,mg]){if(seen.has(k)){why.push('撞现有:'+seen.get(k));break;}if(intra.has(k)){why.push('撞分片:'+intra.get(k));break;}}}
  if(why.length){drops.push({name:p.name,fen:p.fen,why:why.join(';')});return;}
  const[sg,mg]=sigOfFen(p.fen);intra.set(sg,p.name);intra.set(mg,p.name);
  const rec={name:p.name,fen:p.fen,mate:solved.mate,line:solved.line,hint:p.hint||`${p.name}：红先${solved.line.split(' ')[0]}，${solved.mate}步成杀。`};
  rec.chapter=isClassic?'classic':('mate'+solved.mate);
  if(isClassic)rec.source=p.source;
  final.push(rec);
}
for(const p of CANDIDATES)process(p,false);
for(const p of CLASSIC)process(p,false);

fs.writeFileSync(new URL('./final.json',import.meta.url),JSON.stringify(final,null,2));
console.log('PASS',final.length,'DROP',drops.length);
const cnt={};for(const r of final)cnt[r.chapter]=(cnt[r.chapter]||0)+1;
console.log('chapters',JSON.stringify(cnt));
for(const d of drops)console.log('✗',d.name,'-',d.why);
