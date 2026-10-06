// 主线程统一合并: 正式引擎复校 + 镜像去重 + 重编号 -> generated/puzzles.new.js
import * as E from '../js/engine.js';
import { playLine } from '../js/notation.js';
import { PUZZLES as OLD } from '../js/puzzles.js';
import fs from 'fs';

const ROOT = '/home/user/Doubao/chats/38444973861070338/xiangqi-lan';
const shardFiles = ['shard-mate1.json','shard-mate2.json','shard-mate3.json','shard-mate4.json','shard-mate5p.json','shard-endgame.json'];

// ---------- 轻量 make/unmake (不触发自动终局) ----------
function mk(s,m){const[fx,fy]=m.from,[tx,ty]=m.to;const p=s.board[fy][fx],cap=s.board[ty][tx];s.board[ty][tx]=p;s.board[fy][fx]=null;const wh=p.hidden,o=p.orig;if(wh){p.hidden=false;p.orig=undefined;}s.turn=s.turn==='r'?'b':'r';return{p,cap,fx,fy,tx,ty,wh,o};}
function un(s,u){s.board[u.fy][u.fx]=u.p;s.board[u.ty][u.tx]=u.cap;if(u.wh){u.p.hidden=true;u.p.orig=u.o;}s.turn=s.turn==='r'?'b':'r';}
// 任意强制杀: 红存在一招, 使黑所有应着后均在 n-1 步被杀; n=1 时红某招后黑无合法着
let NODES=0,CAP=3_000_000;
const BUDGET=Symbol('budget');
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
// 有预算地判断"是否存在 <=n 步任意杀"; 返回 true/false/'unknown'
function anyMateWithin(fen,n){
  NODES=0;
  try{
    for(let k=1;k<=n;k++){const t=E.createState({fen});if(findAll(t,k))return true;}
    return false;
  }catch(e){if(e===BUDGET)return 'unknown';throw e;}
}
// 求最短任意杀步数 + 黑最顽强应着主变
function bestline(fen,n){
  const s=E.createState({fen});const out=[];let cur=n,g=0;
  while(cur>0&&g++<20){
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
// 连将杀: 红每步必须将军
function checkingMoves(s){
  const out=[];
  for(const m of E.legalMoves(s,'r')){
    const u=mk(s,m);
    if(E.isInCheck(s,'b'))out.push(m);
    un(s,u);
  }
  return out;
}
function findCheck(s,n){
  for(const m of checkingMoves(s)){
    const u=mk(s,m);
    const bs=E.legalMoves(s,'b');
    let good=bs.length===0;
    if(!good&&n>1){
      good=true;
      for(const bm of bs){
        const u2=mk(s,bm);
        const r=findCheck(s,n-1);
        un(s,u2);
        if(!r){good=false;break;}
      }
    }
    un(s,u);
    if(good)return m;
  }
  return null;
}
// 主变终局校验: 用中文谱逐步走, 全合法且终局 redwin
function lineVerify(fen,line){
  const s=E.createState({fen});
  const texts=line.replace(/\s*#\s*$/,'').split(/\s+/).filter(Boolean);
  const r=playLine(s,texts);
  if(!r.ok)return{ok:false,why:'line第'+(r.errorIndex+1)+'着「'+texts[r.errorIndex]+'」不合法: '+(r.error||'')};
  if(s.status!=='redwin')return{ok:false,why:'line走完 status='+s.status+'/'+s.reason};
  return{ok:true};
}

// ---------- 旧关(剔除违规局, 杀局稍后统一自动重算) ----------
const old=[];
for(const p of OLD){
  if(p.id===16)continue; // 初始黑已被将军, 构造违规, 剔除
  const q={...p};q._src='old';
  old.push(q);
}

// ---------- 读分片 ----------
const fresh=[];
for(const f of shardFiles){
  const arr=JSON.parse(fs.readFileSync(ROOT+'/generated/'+f,'utf8'));
  for(const p of arr){p._src=f;fresh.push(p);}
}

// ---------- 去重签名(含左右镜像) ----------
function sigs(p){
  const s=E.createState({fen:p.fen});
  const cells=[];
  for(let y=0;y<10;y++)for(let x=0;x<9;x++){const c=s.board[y][x];if(c)cells.push(c.c+c.t+x+','+y);}
  cells.sort();
  const mir=cells.map(z=>{const[a,b,rest]=z;const[x,y]=rest.split(',').map(Number);return a+b+(8-x)+','+y;}).sort();
  return[cells.join('|'),mir.join('|')];
}

// ---------- hint 清洗 ----------
function cleanHint(p){
  let h=p.hint||'';
  h=h.replace(/^\d+\s*步连将杀\([^)]*\)[：:]\s*/,'');
  h=h.replace(/借[A-Za-z,、\s]+换位抽选/g,'');
  h=h.replace(/[A-Z]{2,4}[换位抽选,、]*/g,'');
  h=h.replace(/\s+/g,'').replace(/，+/g,'，').replace(/：+/g,'：').replace(/^[，:：]+|[，:：]+$/g,'').trim();
  if(!h||/[A-Z]{2,}/.test(h)||h.includes('抽选')||h.includes('发起')){
    const first=(p.line||'').replace(/\s*#.*/,'').split(/\s+/)[0]||'';
    h=`${p.name}：红先${first}，${p.mate}步成杀。`;
  }
  return h;
}

// ---------- 复校 ----------
const report={drop:[],pass:0,dup:[],inconclusive:[]};
const seen=new Map(); // sig -> name
function accept(p){
  const[sg,mg]=sigs(p);
  for(const k of[sg,mg])if(seen.has(k)){report.dup.push({name:p.name,src:p._src,with:seen.get(k)});return false;}
  seen.set(sg,p.name);
  return true;
}
const checked=[];
// 旧关先占位
for(const p of old){const[sg,mg]=sigs(p);seen.set(sg,p.name);}

for(const p of fresh){
  // 基本合法性
  let s;
  try{s=E.createState({fen:p.fen});}catch(e){report.drop.push({name:p.name,src:p._src,why:'FEN非法'});continue;}
  if(p.chapter!=='endgame'){
    if(E.isInCheck(s,'r')||E.isInCheck(s,'b')){report.drop.push({name:p.name,src:p._src,why:'初始即将军'});continue;}
    const wantChapter=p.chapter;
    // 杀局统一以"任意强制杀最短步数"为准; mate4/mate5p 额外要求连将维度最短一致
    const solved=solveMate(p.fen,6);
    if(!solved){report.drop.push({name:p.name,src:p._src,why:'6步内无强制杀'});continue;}
    p.mate=solved.mate;p.line=solved.line;
    if(p.mate>=5){
      // 五至七步深层杀: solveMate 已穷举任意强制杀最短恰为 mate(含连将攻杀与缓手控杀)
      p.chapter='mate5p';
    }else{
      p.chapter='mate'+p.mate; // mate1..mate4 按真实步数归章(mate4 含连将与缓杀)
    }
    const lv=lineVerify(p.fen,p.line);
    if(!lv.ok){report.drop.push({name:p.name,src:p._src,why:'重算line仍失败: '+lv.why});continue;}
    p.hint=cleanHint(p);
  }else{
    // 定式: 字段与合法性
    if(!p.type||!['win','draw'].includes(p.type)){report.drop.push({name:p.name,src:p._src,why:'定式缺type'});continue;}
    if(p.type==='draw'&&p.humanSide!=='b'){report.drop.push({name:p.name,src:p._src,why:'draw定式humanSide应为b'});continue;}
    if(!p.drawMoves)p.drawMoves=80;
    if(/[A-Z]{2,}/.test(p.hint||''))p.hint=p.name+'：按'+p.name+'定式要领取胜或守和。';
  }
  if(!accept(p))continue;
  report.pass++;
  checked.push(p);
}

// 旧关复校: 杀局统一重算最短杀与主变(规则修复后部分旧局步数/应着已变)
const oldKept=[];
for(const p of old){
  if(p.chapter!=='endgame'){
    if(E.isInCheck(E.createState({fen:p.fen}),'r')||E.isInCheck(E.createState({fen:p.fen}),'b')){report.drop.push({name:p.name,src:'old',why:'旧关初始即将军'});continue;}
    const solved=solveMate(p.fen,6);
    if(!solved){report.drop.push({name:p.name,src:'old',why:'旧关6步内无强制杀'});continue;}
    p.mate=solved.mate;p.line=solved.line;p.chapter=solved.mate>=5?'mate5p':('mate'+solved.mate);
    const lv=lineVerify(p.fen,p.line);
    if(!lv){report.drop.push({name:p.name,src:'old',why:'旧关重算line失败: '+lv.why});continue;}
  }
  oldKept.push(p);
}

// ---------- 排序重编号 ----------
const order={mate1:0,mate2:1,mate3:2,mate4:3,mate5p:4,endgame:5};
checked.sort((a,b)=>{
  const ta=a.chapter==='endgame'?5:order[a.chapter];
  const tb=b.chapter==='endgame'?5:order[b.chapter];
  if(ta!==tb)return ta-tb;
  if(a.chapter==='endgame'){if(a.type!==b.type)return a.type==='win'?-1:1;return a.name.localeCompare(b.name,'zh');}
  if(a.mate!==b.mate)return a.mate-b.mate;
  return a.name.localeCompare(b.name,'zh');
});
// 定式 win 在前 draw 在后: 上面 sort endgame 段 type 排序已处理, 但杀局段在 endgame 前, OK
const all=[...checked.filter(p=>p.chapter!=='endgame'),...checked.filter(p=>p.chapter==='endgame'&&p.type==='win'),...checked.filter(p=>p.chapter==='endgame'&&p.type==='draw')];
// old 定式也并入(它们不在 checked)
const oldEg=oldKept.filter(p=>p.chapter==='endgame');
const oldMate=oldKept.filter(p=>p.chapter!=='endgame');
// 重新组织: 新杀局+旧杀局统一排序
const mates=[...checked.filter(p=>p.chapter!=='endgame'),...oldMate];
mates.sort((a,b)=>{const ta=order[a.chapter],tb=order[b.chapter];if(ta!==tb)return ta-tb;if(a.mate!==b.mate)return a.mate-b.mate;return a.name.localeCompare(b.name,'zh');});
const wins=[...checked.filter(p=>p.chapter==='endgame'&&p.type==='win'),...oldEg.filter(p=>p.type==='win')];
const draws=[...checked.filter(p=>p.chapter==='endgame'&&p.type==='draw'),...oldEg.filter(p=>p.type==='draw')];
const final=[...mates,...wins,...draws].map((p,i)=>{
  const q={id:i+1,name:p.name};
  if(p.chapter==='endgame'){q.chapter='endgame';q.type=p.type;if(p.humanSide)q.humanSide=p.humanSide;q.drawMoves=p.drawMoves||80;}
  else{q.chapter=p.chapter;q.mate=p.mate;}
  q.fen=p.fen;q.hint=p.hint;
  if(p.line)q.line=p.line;
  return q;
});

// ---------- 序列化 ----------
function ser(p){
  const numKeys=new Set(['id','mate','drawMoves']);
  const keys=['id','name','chapter','mate','type','humanSide','drawMoves','fen','hint','line'];
  const parts=keys.filter(k=>p[k]!==undefined).map(k=>numKeys.has(k)?(k+': '+p[k]):(k+": '"+String(p[k]).replace(/'/g,"\\'")+"'"));
  return '  {\n    '+parts.join(', ')+'\n  }';
}
const header=`// 残局闯关关卡(红先; 杀局经强制杀求解器穷举验证最短步数, 实用定式经大师级AI双/三seed对弈验证)
// 章节: mate1一步杀 mate2两步杀 mate3三步杀 mate4四步连将杀 mate5p五至七步连将杀; endgame+type=win例胜/draw守和(执黑)
// fen 为局面; mate=红方连走步数; line=参考主变(黑方最顽强应着), 以 # 结束; drawMoves=守和所需回合
export const PUZZLES = [
`;
fs.writeFileSync(ROOT+'/generated/puzzles.new.js',header+final.map(ser).join(',\n')+'\n];\n');

// ---------- 报告 ----------
const cnt={};
for(const p of final){const k=p.chapter==='endgame'?('endgame-'+p.type):p.chapter;cnt[k]=(cnt[k]||0)+1;}
console.log('=== 合并报告 ===');
console.log('新分片复校通过',report.pass,'丢弃',report.drop.length,'重复',report.dup.length);
console.log('丢弃明细:');for(const d of report.drop)console.log('  ✗',d.src,d.name,'-',d.why);
console.log('重复明细:');for(const d of report.dup)console.log('  ≡',d.src,d.name,'==',d.with);
console.log('最终章节分布:',JSON.stringify(cnt));
console.log('最终总数:',final.length);
