// ============================================================
// 残局「产品 AI 真实对弈」逐关验证: node test/puzzle-ai-check.mjs
// 与 puzzle-check.js(证明完美求解下强制杀存在)互补:
//   本脚本用【产品真实 AI】模拟残局对弈——攻击方(红, 玩家靠"提示")与
//   防守方(黑)都调用 js/ai.js 的 searchBestMove, 验证攻击方能否在产品
//   步数上限(恰好 mate 个红手内成杀, 否则产品判负)真正将死/困毙获胜。
//
// 判定:
//   PASS  = 终局 redwin(checkmate/stalemate/perpetual) 且红胜手数 <= mate
//   其余为 FAIL, 失败类型:
//     SLOW    终局红胜但红手数 > mate(产品早已判负)
//     DRAW    和棋(重复局面等)
//     LOSE    攻击方被反杀(blackwin)
//     TIMEOUT 步数上限内未终局
//     ILLEGAL AI 返回非法着法 / 抛错
//
// 环境变量:
//   CHAPTERS=mate1,mate2   只跑某些章节
//   IDS=12,13 或 10-20     只跑指定 id
//   ATK_LEVEL=5 ATK_MS=2500   攻击方等级/每手时限(默认大师, 对齐"提示")
//   DEF_LEVEL=5 DEF_MS=2500   防守方等级/每手时限(默认大师=最强防守, 比产品 lv3 更严)
//   REP=1                  每关重复次数(大师确定性, 默认 1)
//   CAP_MARGIN=12 CAP_MAX=60  ply 上限 = min(2*mate+MARGIN, CAP_MAX)
//   ATTACKER=master|hint   master=纯 searchBestMove; hint=产品残局提示 puzzleHintMove
//   JSON=路径              结果明细(置 JSON=0 不写)
//   QUIET=1                只打印失败与汇总
// ============================================================
import * as E from '../js/engine.js';
import { PUZZLES } from '../js/puzzles.js';
import { searchBestMove, hintMove, puzzleHintMove } from '../js/ai.js';
import { searchBestMovePro } from '../js/ai-pro.js';
import fs from 'fs';

// ENGINE=classic|pro: master 自由搜索时攻击/防守改用指定引擎; ATTACKER=hint 的
// 精确强制杀路径(puzzleHintMove)保持经典解面, 与引擎解耦、不随 ENGINE 切换。
const ENGINE = process.env.ENGINE || 'classic';
const masterSearch = (ENGINE === 'pro') ? searchBestMovePro : searchBestMove;

const num = (v, d) => (v == null || v === '' ? d : Number(v));
const ATK_LEVEL = num(process.env.ATK_LEVEL, 5);
const ATK_MS = num(process.env.ATK_MS, 2500);
const DEF_LEVEL = num(process.env.DEF_LEVEL, 5);
const DEF_MS = num(process.env.DEF_MS, 2500);
const REP = num(process.env.REP, 1);
const CAP_MARGIN = num(process.env.CAP_MARGIN, 12);
const CAP_MAX = num(process.env.CAP_MAX, 60);
const ATTACKER = process.env.ATTACKER || 'master';
const QUIET = !!process.env.QUIET;
const DETER = process.env.DETER === '1';   // 确定性对照: 关闭根着法随机 tie-break
const ESCALATE = process.env.ESCALATE === '1'; // 深局 SLOW(已胜但慢一手)自动加时复算, 随机照开; 不掩盖 LOSE/DRAW
const ESC_MAX = num(process.env.ESC_MAX, 12000);

function parseIdList(str) {
  const set = new Set();
  if (!str) return set;
  for (const tok of String(str).split(',').map(s => s.trim()).filter(Boolean)) {
    if (/^\d+\s*-\s*\d+$/.test(tok)) {
      let [a, b] = tok.split('-').map(Number); if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) set.add(i);
    } else set.add(Number(tok));
  }
  return set;
}
const chapterSet = new Set((process.env.CHAPTERS || '').split(',').map(s => s.trim()).filter(Boolean));
const idSet = parseIdList(process.env.IDS);

let atkMs = ATK_MS;   // 攻击方当前时限(深局 SLOW 自动加时时上调; 随机仍开启)
// 攻击方着法来源
function attackerMove(state, pz) {
  if (ATTACKER === 'hint') {
    // 产品残局"提示"真实路径: 离线解面 -> 在线精确强制杀 -> 大师兜底
    return puzzleHintMove(state, {
      puzzleId: pz.id, mateTarget: pz.mate, attacker: 'r',
      deadline: Date.now() + atkMs
    });
  }
  return masterSearch(state, { level: ATK_LEVEL, deadline: Date.now() + atkMs, noBook: true, deterministic: DETER });
}
function defenderMove(state) {
  return masterSearch(state, { level: DEF_LEVEL, deadline: Date.now() + DEF_MS, noBook: true, deterministic: DETER });
}
function isLegal(s, mv) {
  if (!mv) return false;
  return E.legalMoves(s).some(m =>
    m.from[0] === mv.from[0] && m.from[1] === mv.from[1] &&
    m.to[0] === mv.to[0] && m.to[1] === mv.to[1]);
}

function playOne(pz) {
  const s = E.createState({ fen: pz.fen });
  const cap = Math.min(2 * pz.mate + CAP_MARGIN, CAP_MAX);
  while (s.status === 'playing' && s.moves.length < cap) {
    const isRed = s.turn === 'r'; // 杀局默认红先、红=攻击方
    let mv;
    try { mv = isRed ? attackerMove(s, pz) : defenderMove(s); }
    catch (e) { return fin(pz, s, 'ILLEGAL', 'throw:' + e.message); }
    if (!isLegal(s, mv)) return fin(pz, s, 'ILLEGAL', 'illegal:' + (mv ? `${mv.from}->${mv.to}` : 'null'));
    E.applyMove(s, mv.from, mv.to);
  }
  const plies = s.moves.length, redMoves = Math.ceil(plies / 2);
  if (s.status === 'redwin') {
    if (redMoves <= pz.mate) return { result: 'PASS', status: s.status, reason: s.reason, plies, redMoves };
    return { result: 'SLOW', status: s.status, reason: s.reason, plies, redMoves };
  }
  if (s.status === 'blackwin') return { result: 'LOSE', status: s.status, reason: s.reason, plies, redMoves };
  if (s.status === 'draw') return { result: 'DRAW', status: s.status, reason: s.reason, plies, redMoves };
  return { result: 'TIMEOUT', status: s.status, reason: 'cap', plies, redMoves };
}
function fin(pz, s, result, reason) {
  const plies = s.moves.length;
  return { result, status: s.status, reason, plies, redMoves: Math.ceil(plies / 2) };
}

function main() {
  let list = PUZZLES.filter(p => p.type !== 'win' && p.type !== 'draw' && !p.jieqi && p.mate != null);
  if (chapterSet.size) list = list.filter(p => chapterSet.has(p.chapter));
  if (idSet.size) list = list.filter(p => idSet.has(p.id));

  const results = [];
  const t0 = Date.now();
  for (const pz of list) {
    let reps = [];
    for (let r = 0; r < REP; r++) reps.push(playOne(pz));
    const rank = { PASS: 0, SLOW: 1, DRAW: 2, TIMEOUT: 3, LOSE: 4, ILLEGAL: 5 };
    let worst = reps[0];
    for (const x of reps) if (rank[x.result] > rank[worst.result]) worst = x;
    let usedMs = ATK_MS;
    // 深局自动加时: 仅当"已获胜但慢一手(SLOW)"时, 加倍攻击时限重算(随机照开),
    // 直到在标注 mate 手数内成杀或达到 ESC_MAX; LOSE/DRAW/TIMEOUT/ILLEGAL 绝不加时掩盖。
    if (ESCALATE && worst.result === 'SLOW') {
      while (usedMs < ESC_MAX) {
        usedMs = Math.min(usedMs * 2, ESC_MAX); atkMs = usedMs;
        const rs = [];
        for (let r = 0; r < REP; r++) rs.push(playOne(pz));
        let w2 = rs[0]; for (const x of rs) if (rank[x.result] > rank[w2.result]) w2 = x;
        reps = rs; worst = w2;
        if (worst.result === 'PASS') break;
      }
      atkMs = ATK_MS;
    }
    const rec = { id: pz.id, name: pz.name, chapter: pz.chapter, mate: pz.mate, ...worst, atkMs: usedMs, reps: reps.map(x => x.result + ':' + x.redMoves) };
    results.push(rec);
    if (!QUIET || worst.result !== 'PASS') {
      const tag = `${pz.id}.${pz.name}`.padEnd(20);
      if (worst.result === 'PASS') console.log(`✓ ${tag} ${pz.chapter}/${pz.mate}步 红胜(${worst.reason}) ${worst.redMoves}手${usedMs > ATK_MS ? ' [深局加时' + usedMs + 'ms]' : ''}`);
      else console.log(`✗ ${tag} ${pz.chapter}/标${pz.mate}步 [${worst.result}] ${worst.status}/${worst.reason} ${worst.redMoves}手/${worst.plies}ply [${rec.reps.join(',')}]`);
    }
  }

  const ch = {};
  for (const r of results) {
    const k = r.chapter;
    ch[k] = ch[k] || { total: 0, pass: 0, byType: {} };
    ch[k].total++;
    if (r.result === 'PASS') ch[k].pass++;
    else ch[k].byType[r.result] = (ch[k].byType[r.result] || 0) + 1;
  }
  console.log('\n================ 逐章结果 ================');
  let T = 0, P = 0;
  for (const k of Object.keys(ch).sort()) {
    const c = ch[k]; T += c.total; P += c.pass;
    const ft = Object.entries(c.byType).map(([t, n]) => `${t}×${n}`).join(' ');
    console.log(`${k.padEnd(8)} 通过 ${String(c.pass).padStart(3)}/${String(c.total).padStart(3)}  ${ft ? '失败: ' + ft : ''}`);
  }
  const fails = results.filter(r => r.result !== 'PASS');
  console.log(`\n攻击方 lv${ATK_LEVEL}/${ATK_MS}ms  防守方 lv${DEF_LEVEL}/${DEF_MS}ms  ATTACKER=${ATTACKER} REP=${REP}`);
  console.log(`总计 ${P}/${T} 攻击方产品步数内必胜 (${((P / T) * 100).toFixed(1)}%)  失败 ${fails.length}  耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (fails.length) {
    console.log('\n失败清单(按类型):');
    for (const t of ['ILLEGAL', 'LOSE', 'TIMEOUT', 'DRAW', 'SLOW']) {
      const grp = fails.filter(f => f.result === t);
      if (grp.length) console.log(`  [${t}] (${grp.length}): ${grp.map(f => f.id).join(',')}`);
    }
  }
  if (process.env.JSON !== '0') {
    const path = process.env.JSON || 'test/ai-check-results.json';
    fs.writeFileSync(path, JSON.stringify({ atk: { level: ATK_LEVEL, ms: ATK_MS }, def: { level: DEF_LEVEL, ms: DEF_MS }, attacker: ATTACKER, rep: REP, total: T, pass: P, results }, null, 1));
    console.log('明细已写', path);
  }
  process.exit(fails.length ? 1 : 0);
}
main();
