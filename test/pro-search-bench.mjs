// 搜索质量基准: 固定局面 × 固定时间, 对比 pro vs classic深度/节点/NPS/首选稳定性
// node test/search-bench.mjs  环境: MS=1000 REP=3
import * as E from '../js/engine.js';
import { playLine } from '../js/notation.js';
import { searchBestMovePro as newSearch } from '../js/ai-pro.js';
import { searchBestMove as oldSearch } from './ai-baseline.mjs';

const MS = Number(process.env.MS||1000);
const REP = Number(process.env.REP||3);
const FEAT = process.env.FEAT_JSON ? JSON.parse(process.env.FEAT_JSON) : undefined;

// 固定测试局面簇: 开局/中局/残局(用工厂函数每次重建, 避免 cloneState 兼容问题)
const positions = [];
{
  positions.push({name:'开局', make:()=>E.createState()});
}
{
  positions.push({name:'中局t', make:()=>{
    const s=E.createState(); playLine(s, ['炮二平五','马8进7','马二进三','马2进3','车一平二','车9平8','车二进六','炮8平9']); return s;}});
}
{
  positions.push({name:'中局c', make:()=>{
    const s=E.createState(); playLine(s, ['炮二平五','马8进7','马二进三','车9平8','车一平二','炮8进4','马八进七','卒3进1','车二进四','马2进3','兵七进一','卒3进1','车二平七']); return s;}});
}
{
  positions.push({name:'残局', make:()=>E.createState({ fen: '3k5/5a3/9/9/9/9/4R4/4P4/9/3K5 r' })});
}

function bench(fn, label){
  console.log(`\n--- ${label} ---`);
  let totD=0,totN=0;
  for (const {name, make} of positions){
    let d=0,n=0,bestMoves=new Set();
    for (let r=0;r<REP;r++){
      const s = make();
      const t0=Date.now();
      const mv = fn(s,{level:5,deadline:Date.now()+MS,noBook:true,deterministic:true,feat:FEAT});
      d+=mv.depth; n+=mv.nodes;
      bestMoves.add(`${mv.from}-${mv.to}`);
    }
    const ad=d/REP, an=Math.round(n/REP);
    const nps = an/ (MS/1000);
    totD+=ad; totN+=an;
    console.log(`${name.padEnd(6)} 均深${ad.toFixed(1)} 节点${an} NPS~${(nps/1000).toFixed(0)}k 首选集合${bestMoves.size} [${[...bestMoves].join(' ')}]`);
  }
  console.log(`${label} 合计: 均深${(totD/positions.length).toFixed(2)} 均节点${Math.round(totN/positions.length)}`);
}
bench(oldSearch, 'OLD基线');
bench(newSearch, 'NEW新版');
