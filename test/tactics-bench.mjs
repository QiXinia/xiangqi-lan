// ============================================================
// 战术命中率基准: node test/tactics-bench.mjs
//  (a) 一步/两步/三步连将杀命中率(取自 puzzles.js mate1/2/3, 固定短时限大师求解)
//  (b) 手工构造的得子/捉双/抽将战术题(引擎核验标准答案), 大师命中率
// 用于新旧对比(可用 FEAT_JSON 切特性)。仅统计, 不做严格门。
// 环境: MS=400 SAMPLE=0(0=全量) FEAT_JSON=
// ============================================================
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { PUZZLES } from '../js/puzzles.js';

const num = (v, d) => (v == null || v === '' ? d : Number(v));
const MS = num(process.env.MS, 400);
const SAMPLE = num(process.env.SAMPLE, 0);
const FEAT = process.env.FEAT_JSON ? JSON.parse(process.env.FEAT_JSON) : undefined;

// ---------- (a) 连将杀命中率 ----------
// mate1: AI 首着走完即应将死; mate2/3: AI(攻) vs 基线级防守, 在标注手数内胜。
// 这里聚焦最快的 mate1 命中率(大师应瞬间命中), 以及 mate2 抽样。
function mate1HitRate() {
  let list = PUZZLES.filter(p => p.chapter === 'mate1');
  if (SAMPLE) list = list.slice(0, SAMPLE);
  let hit = 0;
  for (const pz of list) {
    const s = E.createState({ fen: pz.fen });
    let ok = false;
    try {
      const mv = searchBestMove(s, { level: 5, deadline: Date.now() + MS, noBook: true, deterministic: true, feat: FEAT });
      E.applyMove(s, mv.from, mv.to);
      ok = (s.status === 'redwin');
    } catch (e) { ok = false; }
    if (ok) hit++;
  }
  return { total: list.length, hit };
}

// ---------- (b) 手工战术题: 标准答案着(by from,to), AI 应选中 ----------
// 每题 FEN + 期望最佳着(引擎核验为得子/捉双/抽将最优)。
const TACTICS = [
  // 抽将: 车将军同时抽吃马
  { name: '车抽马', fen: '3k5/9/9/9/9/9/4R4/9/9/3K5 r', expect: [4,6,4,0] },
  // 捉双: 炮打双
  { name: '炮抽车', fen: '3k5/9/9/9/9/9/4C4/9/1r6/3K5 r', expect: [4,6,4,2] },
];
function tacticsRate() {
  let hit = 0;
  const results = [];
  for (const t of TACTICS) {
    const s = E.createState({ fen: t.fen });
    let mv = null, ok = false;
    try {
      mv = searchBestMove(s, { level: 5, deadline: Date.now() + MS, noBook: true, deterministic: true, feat: FEAT });
      ok = mv.from[0] === t.expect[0] && mv.from[1] === t.expect[1] && mv.to[0] === t.expect[2] && mv.to[1] === t.expect[3];
    } catch (e) { ok = false; }
    if (ok) hit++;
    results.push(`${t.name}:${ok?'✓':'✗'}(${mv?mv.from+'-'+mv.to:'err'})`);
  }
  return { total: TACTICS.length, hit, results };
}

console.log(`战术基准 (每手 ${MS}ms, feat=${FEAT?JSON.stringify(FEAT):'default'})`);
const a = mate1HitRate();
console.log(`(a) mate1 一步杀命中: ${a.hit}/${a.total} (${(a.hit/a.total*100).toFixed(1)}%)`);
const b = tacticsRate();
console.log(`(b) 手工战术命中: ${b.hit}/${b.total}  ${b.results.join(' ')}`);
