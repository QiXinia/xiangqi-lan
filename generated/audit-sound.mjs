// ============================================================
// 复审 generated/shard-mate*.json 杀局（用修正版引擎 engine-fixed.mjs + notation-fixed.mjs）
// 只读 shard JSON，不改任何 shard。可重复运行（mate5p 可能仍在续写，审当前落盘内容）。
// 产出: generated/audit-drops.json（机器可读淘汰清单）+ 控制台汇总。
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import * as E from './engine-fixed.mjs';
import { playLine } from './notation-fixed.mjs';
import { PUZZLES } from '../js/puzzles.js';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SHARDS = ['shard-mate1.json','shard-mate2.json','shard-mate3.json','shard-mate4.json','shard-mate5p.json'];

// ---- 快速手工 make/unmake（合法性/将军一律调用 fixed 引擎）----
function lmake(s,m){const[fx,fy]=m.from,[tx,ty]=m.to;const p=s.board[fy][fx],cap=s.board[ty][tx];s.board[ty][tx]=p;s.board[fy][fx]=null;const wh=p.hidden,o=p.orig;if(wh){p.hidden=false;p.orig=undefined;}s.turn=s.turn==='r'?'b':'r';return{p,cap,fx,fy,tx,ty,wh,o};}
function lundo(s,u){s.board[u.fy][u.fx]=u.p;s.board[u.ty][u.tx]=u.cap;if(u.wh){u.p.hidden=true;u.p.orig=u.o;}s.turn=s.turn==='r'?'b':'r';}

let nodes = 0;
function find(s,n,guard){
  if (guard.stop) return null;
  if (++guard.nodes > guard.budget) { guard.bail=true; return null; }
  for(const m of E.legalMoves(s,'r')){
    const u=lmake(s,m);
    const bs=E.legalMoves(s,'b');
    let good=bs.length===0;
    if(!good && n>1){
      good=true;
      for(const bm of bs){
        const u2=lmake(s,bm);
        const r=find(s,n-1,guard);
        lundo(s,u2);
        if(guard.bail){good=false;break;}
        if(!r){good=false;break;}
      }
    }
    lundo(s,u);
    if(good) return m;
  }
  return null;
}
function shortest(fen,maxN){
  for(let n=1;n<=maxN;n++){
    const s=E.createState({fen});
    const guard={stop:false,nodes:0,budget:150000,bail:false};
    const r=find(s,n,guard);
    if(guard.bail) return {n:null,bail:true};
    if(r) return {n, m:r};
  }
  return null;
}

// 局面去重签名（棋子位置，与顺序/步数无关）
function sigOf(fen){
  const s=E.createState({fen});
  const cells=[];
  for(let y=0;y<=9;y++)for(let x=0;x<=8;x++){const p=s.board[y][x]; if(p) cells.push(x+','+y+','+p.c+p.t);}
  return cells.sort().join('|');
}

const drops=[]; const inconclusive=[];
const seenSig=new Map(); // sig -> where
let perShard={};

// PUZZLES 54 关签名
const puzzleSigs=new Set(PUZZLES.map(p=>{try{return sigOf(p.fen);}catch(e){return null;}}));

for(const sh of SHARDS){
  const fp=path.join(DIR,sh);
  if(!fs.existsSync(fp)){ console.log('(缺失)',sh); continue; }
  const arr=JSON.parse(fs.readFileSync(fp,'utf8'));
  let pass=0, fail=0;
  for(let i=0;i<arr.length;i++){
    const e=arr[i];
    const reasons=[];
    let s;
    try{ s=E.createState({fen:e.fen}); }catch(err){ reasons.push('FEN解析失败:'+err.message); }
    if(s){
      // 1. 初始双方均不被将军（fixed 正确马腿 + 飞将）
      if(E.isInCheck(s,'r')) reasons.push('初始红被将');
      if(E.isInCheck(s,'b')) reasons.push('初始黑被将');
      // 2. 最短强制杀 == 标注 mate
      const mate=e.mate|0;
      const sh=shortest(e.fen, mate+1);
      if(sh && sh.bail) reasons.push(`求解预算耗尽(不确定)`);
      else if(!sh) reasons.push(`无解:${mate}步内无强制杀`);
      else if(sh.n<mate) reasons.push(`最短杀=${sh.n}<标注${mate}`);
      else if(sh.n>mate) reasons.push(`最短杀=${sh.n}>标注${mate}`);
      // mate4/5p 额外: 连将性（主变红每步均应被将军，即红步步步带将）
      if((sh==='shard-mate4.json'||sh==='shard-mate5p.json') || mate>=4){
        const line=(e.line||'').replace(/#\s*$/,'').trim().split(/\s+/).filter(Boolean);
        const t2=E.createState({fen:e.fen});
        let perpOk=true, badStep=-1;
        for(let k=0;k<line.length;k++){
          const mv=E.legalMoves(t2,t2.turn).find(m=>E.moveNotation(t2,m.from,m.to)===line[k]);
          if(!mv){perpOk=false;badStep=k;break;}
          E.applyMove(t2,mv.from,mv.to);
          if(t2.turn==='b' && k%2===0){
            // 红刚走完，黑应被将军（连将杀要求红步步带将）
            if(!E.isInCheck(t2,'b')){perpOk=false;badStep=k;break;}
          }
        }
        if(!perpOk) reasons.push(`连将性:第${badStep+1}手后黑未被将/谱非法`);
      }
      // 3. 主变合法 + 终局 redwin + 黑将全程存活
      const t3=E.createState({fen:e.fen});
      const r=playLine(t3,(e.line||'').replace(/#\s*$/,'').trim().split(/\s+/).filter(Boolean));
      if(!r.ok) reasons.push(`主变第${r.errorIndex+1}手非法:${r.errorText}`);
      else {
        if(t3.status!=='redwin') reasons.push(`主变终局=${t3.status}/${t3.reason}(应redwin)`);
        if(!E.findKing(t3,'b')) reasons.push('主变黑将中途被吃');
      }
      // 4. 去重
      const sg=sigOf(e.fen);
      if(puzzleSigs.has(sg)) reasons.push('与PUZZLES54关之一同局');
      if(seenSig.has(sg)) reasons.push('跨分片重复:与'+seenSig.get(sg));
      else seenSig.set(sg, sh+'#'+i);
    }
    if(reasons.length){
      const inc = reasons.filter(r=>r.includes('预算耗尽'));
      const conf = reasons.filter(r=>!r.includes('预算耗尽'));
      fail++;
      const rec={shard:sh, index:i, name:e.name, mate:e.mate, fen:e.fen};
      if(conf.length){ drops.push({...rec, drop:conf.join('; ')}); }
      if(inc.length){ inconclusive.push({...rec, note:inc.join('; ')}); }
    }
    else pass++;
  }
  perShard[sh]={pass, total:arr.length};
  console.log(`${sh}: 通过 ${pass}/${arr.length}`);
}

fs.writeFileSync(path.join(DIR,'audit-drops.json'), JSON.stringify({perShard, drops, inconclusive}, null, 2));
console.log('\nTOTAL confirmed drops:', drops.length, ' inconclusive:', inconclusive.length);
console.log('perShard:', JSON.stringify(perShard));
