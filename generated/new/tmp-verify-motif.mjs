// 穷举校验: 最短强制杀 + 主变 redwin + 初始不被将军 + FEN合法 + 占位/镜像去重 + 名基去重
// 确定性节点预算; 不依赖 js/ai.js 启发式
import * as E from '../../js/engine.js';
import { playLine } from '../../js/notation.js';
import { PUZZLES as OLD } from '../../js/puzzles.js';
import fs from 'fs';

// ---------- 轻量 make/unmake ----------
function mk(s,m){const[fx,fy]=m.from,[tx,ty]=m.to;const p=s.board[fy][fx],cap=s.board[ty][tx];s.board[ty][tx]=p;s.board[fy][fx]=null;const wh=p.hidden,o=p.orig;if(wh){p.hidden=false;p.orig=undefined;}s.turn=s.turn==='r'?'b':'r';return{p,cap,fx,fy,tx,ty,wh,o};}
function un(s,u){s.board[u.fy][u.fx]=u.p;s.board[u.ty][u.tx]=u.cap;if(u.wh){u.p.hidden=true;u.p.orig=u.o;}s.turn=s.turn==='r'?'b':'r';}

let NODES=0,CAP=Number(process.env.CAP||2_000_000);
const BUDGET=Symbol('budget');
// 任意强制杀: 红存在一招使黑所有应着后均在 n-1 步被杀; n=1 时红某招后黑无合法着
function findAll(s,n){
  for(const m of E.legalMoves(s,'r')){
    if(++NODES>CAP)throw BUDGET;
    const u=mk(s,m);
    const bs=E.legalMoves(s,'b');
    let good=bs.length===0;
    if(!good&&n>1){
      good=true;
      for(const bm of bs){
        const u2=mk(s,bm);
        const r=findAll(s,n-1);
        un(s,u2);
        if(!r){good=false;break;}
      }
    }
    un(s,u);
    if(good)return m;
  }
  return null;
}
function bestline(fen,n){
  const s=E.createState({fen});const out=[];let cur=n,g=0;
  while(cur>0&&g++<30){
    let r;NODES=0;try{r=findAll(s,cur);}catch(e){if(e!==BUDGET)throw e;r=null;}
    if(!r)return null;
    out.push(E.moveNotation(s,r.from,r.to));mk(s,r);
    const bs=E.legalMoves(s,'b');
    if(!bs.length){out.push('#');return out.join(' ');}
    let best=null,bn=-1;
    for(const bm of bs){
      const u2=mk(s,bm);let k=0;
      try{for(let z=1;z<=cur-1;z++){NODES=0;if(findAll(s,z)){k=z;break;}}}catch(e){if(e!==BUDGET)throw e;k=k||0;}
      un(s,u2);
      if(k===0){best=bm;break;}
      if(k>bn){bn=k;best=bm;}
    }
    out.push(E.moveNotation(s,best.from,best.to));mk(s,best);cur--;
  }
  return null;
}
function solveMate(fen,maxN){
  for(let n=1;n<=maxN;n++){
    NODES=0;let r=null;
    try{r=findAll(E.createState({fen}),n);}catch(e){if(e!==BUDGET)throw e;continue;}
    if(r){const line=bestline(fen,n);if(line)return{mate:n,line};}
  }
  return null;
}
function lineVerify(fen,line){
  const s=E.createState({fen});
  const texts=line.replace(/\s*#\s*$/,'').split(/\s+/).filter(Boolean);
  const r=playLine(s,texts);
  if(!r.ok)return{ok:false,why:'line第'+(r.errorIndex+1)+'着「'+texts[r.errorIndex]+'」不合法: '+(r.error||'')};
  if(s.status!=='redwin')return{ok:false,why:'line走完 status='+s.status+'/'+s.reason};
  return{ok:true};
}
// 占位签名 + 左右镜像
function sigOfFen(fen){
  const s=E.createState({fen});
  const cells=[];
  for(let y=0;y<10;y++)for(let x=0;x<9;x++){const c=s.board[y][x];if(c)cells.push(c.c+c.t+x+','+y);}
  cells.sort();
  const mir=cells.map(z=>{const[a,b,rest]=z;const[x,y]=rest.split(',').map(Number);return a+b+(8-x)+','+y;}).sort();
  return[cells.join('|'),mir.join('|')];
}
// ---------- FEN 合法性(位/数/初始将军) ----------
const set=(...a)=>new Set(a.map(([x,y])=>x+','+y));
const K_R=set([3,9],[4,9],[5,9],[3,8],[4,8],[5,8],[3,7],[4,7],[5,7]);
const K_B=set([3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]);
const A_R=set([3,9],[5,9],[4,8],[3,7],[5,7]);
const A_B=set([3,0],[5,0],[4,1],[3,2],[5,2]);
const B_R=set([2,9],[6,9],[0,7],[4,7],[8,7],[2,5],[6,5]);
const B_B=set([2,0],[6,0],[0,2],[4,2],[8,2],[2,4],[6,4]);
const EVENS=new Set([0,2,4,6,8]);
const CAPN={K:1,A:2,B:2,N:2,R:2,C:2,P:5};
function legality(fen){
  const rows=fen.trim().split(/\s+/)[0].split('/');
  if(rows.length!==10)return'行数='+rows.length;
  const cnt={r:{},b:{}};
  for(let y=0;y<10;y++){
    let x=0;
    for(const ch of rows[y]){
      if(/\d/.test(ch)){x+=+ch;continue;}
      if(ch==='x'||ch==='o'){x++;continue;}
      const up=ch.toUpperCase();const isR=ch===up;const c=isR?'r':'b';
      cnt[c][up]=(cnt[c][up]||0)+1;
      const key=x+','+y;
      if(up==='K'){if(isR?!K_R.has(key):!K_B.has(key))return'王越九宫@'+key;}
      else if(up==='A'){if(isR?!A_R.has(key):!A_B.has(key))return'士位非法@'+key;}
      else if(up==='B'){if(isR?!B_R.has(key):!B_B.has(key))return'相位非法@'+key;}
      else if(up==='P'){
        if(isR){if(y>6)return'红兵越底@'+key;else if(y>=5&&!EVENS.has(x))return'红兵未过河离列@'+key;}
        else{if(y<3)return'黑卒越底@'+key;else if(y<=4&&!EVENS.has(x))return'黑卒未过河离列@'+key;}
      }
      x++;
    }
    if(x!==9)return'y'+y+'行宽='+x;
  }
  for(const c of['r','b'])for(const t in CAPN){
    const n=cnt[c][t]||0;
    if(t==='K'&&n!==1)return(c==='r'?'红':'黑')+'王数='+n;
    if(t!=='K'&&n>CAPN[t])return(c==='r'?'红':'黑')+t+'数='+n;
  }
  return null;
}

// ---------- 去重集: 现有399关 + 前序 new/ 分片 ----------
const seen=new Map(); // sig -> name
function addSeen(fen,name){
  let sg;try{sg=sigOfFen(fen);}catch(e){return;}
  seen.set(sg[0],name);seen.set(sg[1],name);
}
for(const p of OLD)addSeen(p.fen,p.name);
// 前序 new/ 分片(ancient/famous) 抽 fen
for(const f of['ancient-games.mjs','famous-endgames.mjs']){
  const txt=fs.readFileSync(new URL('./'+f,import.meta.url),'utf8');
  for(const m of txt.matchAll(/fen:\s*'([^']+)'/g))addSeen(m[1],f);
}
// 名基集合
const nameBase=new Set(OLD.map(p=>p.name));
function baseOf(n){return n.replace(/[·].*$/,'').replace(/[②③④⑤]$/,'');}
const seenBase=new Set(OLD.map(p=>baseOf(p.name)));

// ---------- 候选(内联, 迭代用) ----------
import { CANDIDATES } from './candidates.mjs';

const rep={drop:[],pass:[],dup:[]};
const intraSeen=new Map();
const MAX=Number(process.env.MAXN||6);
for(const c of CANDIDATES){
  const why=[];
  // 1 合法性
  const lg=legality(c.fen);
  if(lg){why.push('合法:'+lg);}
  let st;try{st=E.createState({fen:c.fen});}catch(e){why.push('FEN异常:'+e.message);}
  if(st){
    if(E.isInCheck(st,'r')||E.isInCheck(st,'b'))why.push('初始即将军');
    if(!E.legalMoves(st,'r').length)why.push('红无合法着');
  }
  // 2 名重
  if(nameBase.has(c.name))why.push('重名:'+c.name);
  if(seenBase.has(baseOf(c.name)))why.push('名基撞:'+baseOf(c.name));
  // 3 最短杀
  let solved=null;
  if(st&&!why.length){
    solved=solveMate(c.fen,MAX);
    if(!solved)why.push(MAX+'步内无可证最短强制杀');
  }
  if(solved){
    const lv=lineVerify(c.fen,solved.line);
    if(!lv.ok)why.push('lineVerify:'+lv.why);
  }
  // 4 去重
  if(st&&!why.length){
    const[sg,mg]=sigOfFen(c.fen);
    for(const[k,lab]of[[sg,'自'],[mg,'镜像']]){
      if(seen.has(k)){why.push('撞现有('+lab+'):'+seen.get(k));break;}
      if(intraSeen.has(k)){why.push('撞分片('+lab+'):'+intraSeen.get(k));break;}
    }
  }
  if(why.length){rep.drop.push({name:c.name,fen:c.fen,why:why.join('; ')});continue;}
  // 通过
  const[s,mg]=sigOfFen(c.fen);
  intraSeen.set(s,c.name);intraSeen.set(mg,c.name);
  rep.pass.push({...c,mate:solved.mate,line:solved.line});
}

console.log('=== 通过',rep.pass.length,'===');
for(const p of rep.pass)console.log(`  [mate${p.mate}] ${p.name} :: ${p.line}`);
console.log('\n=== 丢弃',rep.drop.length,'===');
for(const d of rep.drop)console.log(`  ✗ ${d.name} :: ${d.why}\n     ${d.fen}`);
