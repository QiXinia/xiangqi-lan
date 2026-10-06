// 实用残局定式分片生成器 (扩展自 test/gen-endgames.mjs)
// 用法:
//   node generated/gen-endgame.mjs screen   粗筛候选 (2 seed, 1000ms, 120手)
//   node generated/gen-endgame.mjs verify   严格复核入选局 (3 seed, 1800ms, 130手)
//   node generated/gen-endgame.mjs report  打印池内统计
//   node generated/gen-endgame.mjs write   落盘 shard-endgame.json 并读回自验
import * as E from './engine-fixed.mjs';
import { searchBestMove } from './ai-fixed.mjs';
import { PUZZLES } from '../js/puzzles.js';
import fs from 'node:fs';

const POOL = '/tmp/endgame-pool-fixed.json';

// ---------------- 候选池 (胜和以残局理论为引导, 一律经多 seed 实测, 不过即弃) ----------------
const CANDIDATES = [
  // ============ 例胜 (红攻) ============
  { name: '马炮仕胜单缺象', type: 'win', fen: '3aka3/9/2b6/9/9/9/4C4/7N1/9/3AKA2 r',
    hint: '马炮借仕为架牵制士象，先迫孤象归边，再破象擒王。' },
  { name: '车兵胜马单士', type: 'win', fen: '3ak4/9/2n6/9/4P4/9/9/9/R8/3K5 r',
    hint: '车占肋道捉马，兵逼九宫换士，孤马失援即擒。' },
  { name: '马兵胜单象', type: 'win', fen: '4k4/9/2b6/9/4P4/9/9/7N1/9/4K4 r',
    hint: '兵换象或马控将位，孤象难挡马兵联攻。' },
  { name: '炮兵仕胜双士', type: 'win', fen: '3aka3/9/9/9/4P4/9/1C7/4A4/9/4K4 r',
    hint: '炮借仕架镇中，兵入九宫换士，双士联防也必破。' },
  { name: '双兵胜单士', type: 'win', fen: '3ak4/9/9/9/4P4/3P5/9/9/9/4K4 r',
    hint: '一高一低双兵携手，低兵换士、高兵贴将即胜。' },
  { name: '马炮胜单马', type: 'win', fen: '4k4/9/2n6/9/9/9/4C4/7N1/9/4K4 r',
    hint: '炮镇中路牵制，马跃卧槽，孤马兑炮后光将难守。' },
  { name: '车仕胜马单士', type: 'win', fen: '3ak4/9/2n6/9/9/9/9/4A4/R8/4K4 r',
    hint: '车借仕力逐马于边线，回头破士即胜。' },
  { name: '炮双兵胜单缺象', type: 'win', fen: '3aka3/9/2b6/9/4P4/5P3/1C7/9/9/4K4 r',
    hint: '炮镇中路牵制，双兵渡河东进，先破孤象再破士。' },
  { name: '马炮仕胜单缺士', type: 'win', fen: '2b1k1b2/9/5a3/9/9/9/4C4/4A4/7N1/4K4 r',
    hint: '炮镇中路牵制单士，马换象或破士，两翼皆失。' },
  { name: '炮仕胜双士', type: 'win', fen: '3aka3/9/9/9/9/9/4C4/4A4/9/4K4 r',
    hint: '炮借仕架打双士，士一破则将位露、全局崩。' },
  { name: '马双兵胜单士', type: 'win', fen: '3ak4/9/9/9/4P4/3P5/9/7N1/9/4K4 r',
    hint: '马控将门，双兵逼宫换士，孤士难以两全。' },
  { name: '炮兵仕胜单象', type: 'win', fen: '4k4/9/2b6/9/4P4/9/1C7/4A4/9/4K4 r',
    hint: '兵逼将位，炮借仕架打象，孤象必失。' },
  { name: '车兵胜炮单士', type: 'win', fen: '3ak4/9/2c6/9/4P4/9/9/9/R8/3K5 r',
    hint: '车占肋道捉炮，兵入九宫换士，炮无藏身即败。' },
  { name: '马兵胜双士', type: 'win', fen: '3aka3/9/9/9/4P4/9/9/7N1/9/4K4 r',
    hint: '马控将门、兵换士，双士联防也被各个击破。' },
  { name: '炮双仕胜单士', type: 'win', fen: '3ak4/9/9/9/9/9/4C4/4A4/3A5/4K4 r',
    hint: '双仕连环为炮架，孤士动弹不得，炮镇中路即成杀。' },
  { name: '车炮仕胜单车', type: 'win', fen: '3k5/9/9/3r5/9/9/9/4R4/2C6/4K4 r',
    hint: '车占中路，炮沉将后打车，黑车被逼离肋即成杀。' },
  { name: '马炮仕胜光将', type: 'win', fen: '4k4/9/9/9/9/9/4C4/4A4/7N1/4K4 r',
    hint: '马炮联攻借仕架成马后炮，光将无处可躲。' },
  { name: '高兵仕胜单士', type: 'win', fen: '3ak4/9/9/9/4P4/9/9/4A4/9/4K4 r',
    hint: '帅占中路、仕为兵架，兵入花心换士即胜。' },

  { name: '车兵胜双象', type: 'win', fen: '2b1k1b2/9/9/9/4P4/9/9/9/R8/3K5 r',
    hint: '车占中路，兵入九宫换象，孤象必失。' },
  { name: '马炮仕胜双士', type: 'win', fen: '3aka3/9/9/9/9/9/4C4/4A4/7N1/4K4 r',
    hint: '炮借仕架镇中，马绕肋道挂角，双士顾此失彼。' },

  // ============ 例和 (黑守) ============
  { name: '马双士和单车', type: 'draw', fen: '3aka3/9/2n6/9/9/9/9/9/R8/3K5 r',
    hint: '你执黑：马藏士角、双士在将前联防，车无从下手。' },
  { name: '炮士象全和单车', type: 'draw', fen: '2bakab2/9/1c7/9/9/9/9/9/R8/3K5 r',
    hint: '你执黑：炮归家中路，士象正位联防，单车难破。' },
  { name: '士象全和车低兵', type: 'draw', fen: '2bakab2/9/4P4/9/9/9/9/9/R8/3K5 r',
    hint: '你执黑：低兵已难换士，士象固守中路即和。' },
  { name: '单马和单炮', type: 'draw', fen: '4k4/9/2n6/9/9/9/4C4/9/9/4K4 r',
    hint: '你执黑：马走闲牵制，炮无仕相为架不能成杀。' },
  { name: '双炮和单车', type: 'draw', fen: '2c1k1c2/9/9/9/9/9/9/9/R8/3K5 r',
    hint: '你执黑：双炮叠于将前互为炮架，车难破连环。' },
  { name: '炮双士和单车', type: 'draw', fen: '3aka3/9/4c4/9/9/9/9/9/R8/4K4 r',
    hint: '你执黑：炮镇中路、双士联防，车无法破炮架。' },
  { name: '单兵和单士', type: 'draw', fen: '3ak4/9/9/9/4P4/9/9/9/9/4K4 r',
    hint: '你执黑：士在将前走闲，单兵无仕相助难破单士。' },
  { name: '车马和炮士象全', type: 'draw', fen: '2bakab2/9/1c7/9/9/9/2N6/9/R8/3K5 r',
    hint: '你执黑：炮守中路、士象联防，车马无仕相难破。' },
  { name: '马兵和士象全', type: 'draw', fen: '2bakab2/9/9/9/4P4/9/9/7N1/9/4K4 r',
    hint: '你执黑：士象正位固守，兵入中心也难换士。' },
  { name: '炮兵和士象全', type: 'draw', fen: '2bakab2/9/9/9/4P4/9/1C7/9/9/3K5 r',
    hint: '你执黑：士象联防，炮无仕相为架，炮兵难胜。' },
  { name: '车和马单缺士', type: 'draw', fen: '2b1ka3/9/2n6/9/9/9/9/9/R8/3K5 r',
    hint: '你执黑：马守士角、士象联防，单车难胜马单缺士。' },
  { name: '马炮和士象全', type: 'draw', fen: '2bakab2/9/9/9/9/9/4C4/7N1/9/4K4 r',
    hint: '你执黑：士象全正位，马炮无仕相辅助难破。' },
  { name: '单炮和双士', type: 'draw', fen: '3aka3/9/9/9/9/9/4C4/9/9/4K4 r',
    hint: '你执黑：双士联防走闲，炮无架不能成杀。' },
  { name: '单马和双士', type: 'draw', fen: '3aka3/9/9/9/9/9/9/7N1/9/3K5 r',
    hint: '你执黑：双士在将前联防，单马无炮架难困毙。' },
  { name: '双兵和士象全', type: 'draw', fen: '2bakab2/9/9/9/4P4/5P3/9/9/9/4K4 r',
    hint: '你执黑：士象全守中路，双兵难破联防。' },
  { name: '马和炮双士', type: 'draw', fen: '3aka3/9/4c4/9/9/9/9/7N1/9/3K5 r',
    hint: '你执黑：炮镇中路、双士联防，马无炮架难破。' },
  { name: '车和炮双象', type: 'draw', fen: '2b1k1b2/9/4c4/9/9/9/9/9/R8/3K5 r',
    hint: '你执黑：炮守中路、双象联防，单车难破。' },
  { name: '双马和士象全', type: 'draw', fen: '2bakab2/9/9/9/9/9/2N6/7N1/9/3K5 r',
    hint: '你执黑：士象全正位固守，双马无炮架难破。' },
  { name: '单炮和士象全', type: 'draw', fen: '2bakab2/9/9/9/9/9/4C4/9/9/3K5 r',
    hint: '你执黑：士象全联防，炮无架不能成杀。' },
  { name: '单马和士象全', type: 'draw', fen: '2bakab2/9/9/9/9/9/9/7N1/9/3K5 r',
    hint: '你执黑：士象全正位，单马难困毙。' },
  { name: '双炮和士象全', type: 'draw', fen: '2bakab2/9/9/9/9/9/4C4/1C7/9/3K5 r',
    hint: '你执黑：士象全联防，双炮无架难破。' },
  { name: '兵仕和双士', type: 'draw', fen: '3aka3/9/9/9/4P4/9/9/4A4/9/4K4 r',
    hint: '你执黑：双士联防将前，单兵借仕也难破。' },
  { name: '士象全和车低兵·低兵靠边', type: 'draw', fen: '2bakab2/5P3/9/9/9/9/9/9/R8/3K5 r',
    hint: '你执黑：低兵已贴边无力换士，士象固守中路即和。' },
  { name: '炮和马双士', type: 'draw', fen: '3aka3/9/2n6/9/9/9/4C4/9/9/3K5 r',
    hint: '你执黑：马护士角、双士联防，炮无架难破。' },
  { name: '兵和炮双士', type: 'draw', fen: '3aka3/9/4c4/9/4P4/9/9/9/9/3K5 r',
    hint: '你执黑：炮镇中路、双士联防，孤兵难破。' },
  { name: '马和炮单士', type: 'draw', fen: '3ak4/9/2c6/9/9/9/9/7N1/9/3K5 r',
    hint: '你执黑：炮护士角、将走闲，单马难擒炮士。' },
  { name: '双兵和炮士象全', type: 'draw', fen: '2bakab2/9/1c7/9/4P4/5P3/9/9/9/3K5 r',
    hint: '你执黑：炮守中路、士象联防，双兵难破。' },
  { name: '炮兵和士象全·偏架', type: 'draw', fen: '2bakab2/9/9/9/4P4/9/1C7/9/9/3K5 r',
    hint: '你执黑：士象联防，炮无仕相为架，炮兵难胜。' },
  { name: '车和炮双士·正位', type: 'draw', fen: '3aka3/9/2c6/9/9/9/9/9/R8/3K5 r',
    hint: '你执黑：炮在士角护架，双士联防，车难破。' },
  { name: '车炮和士象全', type: 'draw', fen: '2bakab2/9/9/9/9/9/4C4/9/R8/3K5 r',
    hint: '你执黑：士象全联防正位，车炮无仕相架难破。' },
  { name: '双马和炮士象全', type: 'draw', fen: '2bakab2/9/1c7/9/9/9/2N6/7N1/9/3K5 r',
    hint: '你执黑：炮守中路、士象联防，双马难破。' },
  { name: '炮双兵和士象全', type: 'draw', fen: '2bakab2/9/9/9/4P4/5P3/1C7/9/9/3K5 r',
    hint: '你执黑：士象全固守，炮双兵无仕相为架难破。' },
  { name: '单兵和单马', type: 'draw', fen: '4k4/9/2n6/9/4P4/9/9/9/9/3K5 r',
    hint: '你执黑：马走闲牵制，孤兵无后援难胜马。' },
  { name: '双兵和单马', type: 'draw', fen: '4k4/9/2n6/9/4P4/3P5/9/9/9/3K5 r',
    hint: '你执黑：马在边路盘旋走闲，双兵无帅助难擒马。' },
  { name: '低兵和双士', type: 'draw', fen: '3aka3/5P3/9/9/9/9/9/9/9/3K5 r',
    hint: '你执黑：低兵已到底线无力，双士联防走闲即和。' },
  { name: '单炮和双象', type: 'draw', fen: '2b1k1b2/9/9/9/9/9/4C4/9/9/3K5 r',
    hint: '你执黑：双象连环守中路，炮无仕相为架难破。' },
  { name: '单马和双象', type: 'draw', fen: '2b1k1b2/9/9/9/9/9/9/7N1/9/3K5 r',
    hint: '你执黑：双象连环走闲，单马无炮架难困毙。' },

  // ===== fixed 复核后补位候选 =====
  { name: '马炮胜单象', type: 'win', fen: '4k4/9/2b6/9/9/9/4C4/7N1/9/4K4 r',
    hint: '炮镇中路牵制，马卧槽赶象，孤象必失。' },
  { name: '马双兵胜双士', type: 'win', fen: '3aka3/9/9/9/4P4/3P5/9/7N1/9/4K4 r',
    hint: '马控将门、双兵逼宫，换士后成杀。' },
  { name: '车仕胜双士', type: 'win', fen: '3aka3/9/9/9/9/9/9/4A4/R8/4K4 r',
    hint: '车借仕力占肋沉底，双士联防亦破。' },
  { name: '双马和双士', type: 'draw', fen: '3aka3/9/9/9/9/9/2N6/7N1/9/3K5 r',
    hint: '你执黑：双士在将前联防，双马无炮架难困毙。' },
  { name: '低兵和单缺象', type: 'draw', fen: '2b1ka3/5P3/9/9/9/9/9/9/9/3K5 r',
    hint: '你执黑：低兵已无力换士，士象联防固守即和。' },
  { name: '炮双士和马兵', type: 'draw', fen: '3aka3/9/4c4/9/4P4/9/9/7N1/9/3K5 r',
    hint: '你执黑：炮镇中路、双士联防，马兵无炮架难破。' },
  { name: '底兵和单士', type: 'draw', fen: '3ak4/5P3/9/9/9/9/9/9/9/3K5 r',
    hint: '你执黑：兵已沉底力尽，士在将前走闲即和。' },
  { name: '单兵和双象', type: 'draw', fen: '2b1k1b2/9/9/9/4P4/9/9/9/9/3K5 r',
    hint: '你执黑：双象连环守中，孤兵无后援难破。' },
  { name: '低兵和炮双士', type: 'draw', fen: '3aka3/9/4c4/5P3/9/9/9/9/9/3K5 r',
    hint: '你执黑：炮镇中路、双士联防，低兵无力换士。' },
];

// ---------------- 工具 ----------------
function sigOfState(s) {
  const arr = [];
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x];
    if (p) arr.push(`${p.c}${p.t}@${x},${y}`);
  }
  arr.sort();
  return arr.join(';');
}

function validate(fen) {
  let s;
  try { s = E.createState({ fen }); } catch { return 'parse-error'; }
  if (E.isInCheck(s, 'r') || E.isInCheck(s, 'b')) return 'init-check/将帅照面';
  for (const c of ['r', 'b']) {
    const kp = E.findKing(s, c);
    if (!kp) return '缺将';
    const [x, y] = kp;
    if (x < 3 || x > 5) return '将出九宫';
    if (c === 'r' ? !(y >= 7 && y <= 9) : !(y >= 0 && y <= 2)) return '将出九宫';
  }
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x];
    if (!p) continue;
    if (p.t === 'A') {
      if (x < 3 || x > 5) return '士位非法';
      if (p.c === 'r' ? !(y >= 7 && y <= 9) : !(y >= 0 && y <= 2)) return '士出九宫';
    }
    if (p.t === 'B' && (p.c === 'r' ? y < 5 : y > 4)) return '象过河';
    if (p.t === 'P' && (p.c === 'r' ? y > 6 : y < 3)) return '兵位置非法';
  }
  return null;
}

function play(fen, seed, maxMoves, deadlineMs) {
  const s = E.createState({ fen });
  if (E.isInCheck(s, 'r') || E.isInCheck(s, 'b')) return { status: 'illegal-init', reason: 'init-check', n: 0 };
  const rng = E.mulberry32(seed);
  while (s.status === 'playing' && s.moves.length < maxMoves) {
    const lv = s.turn === 'r' ? 5 : 4;
    const mv = searchBestMove(s, { level: lv, deadline: Date.now() + deadlineMs, rng });
    if (!mv) break;
    E.applyMove(s, mv.from, mv.to);
  }
  return { status: s.status, reason: s.reason, n: s.moves.length };
}

// PUZZLES 54 关签名
const PUZZLE_SIGS = new Set(PUZZLES.map(p => sigOfState(E.createState({ fen: p.fen }))));

function loadPool() {
  try { return JSON.parse(fs.readFileSync(POOL, 'utf8')); }
  catch { return { passed: [], rejected: [] }; }
}
function savePool(p) { fs.writeFileSync(POOL, JSON.stringify(p, null, 1)); }

// ---------------- 模式 ----------------
function passOK(type, results) {
  return type === 'win'
    ? results.every(r => r.status === 'redwin')
    : results.every(r => r.status !== 'redwin');
}

function modeScreen() {
  const pool = loadPool();
  const done = new Set([...pool.passed.map(x => x.fen), ...pool.rejected.map(x => x.fen)]);
  let n = 0;
  for (const c of CANDIDATES) {
    if (done.has(c.fen)) continue;
    n++;
    const v = validate(c.fen);
    if (v) {
      console.log(`✗[非法] ${c.name}: ${v}`);
      pool.rejected.push({ ...c, why: `illegal:${v}`, results: [] });
      savePool(pool);
      continue;
    }
    const sig = sigOfState(E.createState({ fen: c.fen }));
    if (PUZZLE_SIGS.has(sig)) {
      console.log(`✗[重] ${c.name}: 与PUZZLES重复`);
      pool.rejected.push({ ...c, why: 'dup-puzzles', results: [] });
      savePool(pool);
      continue;
    }
    const r1 = play(c.fen, 11, 120, 1000);
    const r2 = play(c.fen, 22, 120, 1000);
    const ok = passOK(c.type, [r1, r2]);
    console.log(`${ok ? '✓' : '✗'}[${c.type}] ${c.name}: [${r1.status}/${r1.reason}/${r1.n}] [${r2.status}/${r2.reason}/${r2.n}]`);
    if (ok) pool.passed.push({ ...c, screened: true, results: [r1, r2] });
    else pool.rejected.push({ ...c, why: 'screen', results: [r1, r2] });
    savePool(pool);
  }
  console.log(`screen 处理 ${n} 个; 池内 passed=${pool.passed.length} rejected=${pool.rejected.length}`);
}

function modeVerify() {
  const pool = loadPool();
  let n = 0;
  for (const item of pool.passed) {
    if (item.verified) continue;
    n++;
    const results = [11, 22, 33].map(seed => play(item.fen, seed, 130, 1800));
    const ok = passOK(item.type, results);
    const tag = results.map(r => `${r.status}/${r.reason}/${r.n}`).join('  ');
    console.log(`${ok ? '✓' : '✗'}[复核${item.type}] ${item.name}: ${tag}`);
    if (ok) { item.verified = true; item.results = results; }
    else {
      item.why = 'verify'; item.results = results;
      pool.passed = pool.passed.filter(x => x !== item);
      pool.rejected.push(item);
    }
    savePool(pool);
  }
  console.log(`verify 复核 ${n} 个; passed=${pool.passed.length}(已验${pool.passed.filter(x=>x.verified).length}) rejected=${pool.rejected.length}`);
}

function modeReport() {
  const pool = loadPool();
  const w = pool.passed.filter(x => x.type === 'win'), d = pool.passed.filter(x => x.type === 'draw');
  console.log(`\n== 通过(已验证) win=${w.length} draw=${d.length} 总计=${pool.passed.length} ==`);
  for (const x of pool.passed) console.log(`  [${x.type}] ${x.name} verified=${!!x.verified}`);
  console.log(`\n== 被弃 ${pool.rejected.length} ==`);
  for (const x of pool.rejected) {
    const tag = (x.results || []).map(r => `${r.status}/${r.reason}/${r.n}`).join('  ');
    console.log(`  [${x.type}] ${x.name} why=${x.why}  ${tag}`);
  }
}

function modeWrite() {
  const pool = loadPool();
  let items = pool.passed.filter(x => x.verified);
  // 分片内签名去重
  const seen = new Set();
  items = items.filter(x => {
    const sig = sigOfState(E.createState({ fen: x.fen }));
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
  const w = items.filter(x => x.type === 'win'), d = items.filter(x => x.type === 'draw');
  if (items.length < 30) { console.log(`未达标: 仅 ${items.length} 局 (win ${w.length}/draw ${d.length})`); return; }
  if (Math.abs(w.length - d.length) > 3) { console.log(`胜和不均: win ${w.length} / draw ${d.length}`); return; }
  const out = items.map(x => x.type === 'win'
    ? { chapter: 'endgame', name: x.name, type: 'win', drawMoves: 80, fen: x.fen, hint: x.hint }
    : { chapter: 'endgame', name: x.name, type: 'draw', humanSide: 'b', drawMoves: 80, fen: x.fen, hint: x.hint });
  fs.writeFileSync(new URL('../generated/shard-endgame.json', import.meta.url), JSON.stringify(out, null, 1));
  console.log(`已写入 shard-endgame.json: win=${w.length} draw=${d.length}`);

  // ---- 读回自验 ----
  console.log('\n== 读回 JSON 逐条重跑 3 seed 自验 ==');
  const back = JSON.parse(fs.readFileSync(new URL('../generated/shard-endgame.json', import.meta.url), 'utf8'));
  let bad = 0;
  for (const p of back) {
    const rs = [77, 88, 99].map(seed => play(p.fen, seed, 130, 1800));
    const ok = passOK(p.type, rs);
    if (!ok) bad++;
    const tag = rs.map(r => `${r.status}/${r.reason}/${r.n}`).join('  ');
    console.log(`${ok ? '✓' : '✗'} [${p.type}] ${p.name}: ${tag}`);
  }
  console.log(bad === 0 ? '\n全部自验通过' : `\n有 ${bad} 局自验失败!`);
}

// fixed 复核: 读回现有 shard, 逐局 3 seed 重跑; 通过者入池, 失败者打印并丢弃
function modeReeval() {
  const back = JSON.parse(fs.readFileSync(new URL('../generated/shard-endgame.json', import.meta.url), 'utf8'));
  const pool = { passed: [], rejected: [] };
  for (const p of back) {
    const rs = [11, 22, 33].map(seed => play(p.fen, seed, 130, 1800));
    const ok = passOK(p.type, rs);
    const tag = rs.map(r => `${r.status}/${r.reason}/${r.n}`).join('  ');
    console.log(`${ok ? '✓' : '✗'}[fixed ${p.type}] ${p.name}: ${tag}`);
    const item = { name: p.name, type: p.type, fen: p.fen, hint: p.hint, results: rs, verified: ok };
    if (ok) pool.passed.push(item);
    else pool.rejected.push({ ...item, why: 'fixed-reeval' });
    savePool(pool);
  }
  const w = pool.passed.filter(x => x.type === 'win').length, d = pool.passed.filter(x => x.type === 'draw').length;
  console.log(`\nfixed 复核通过 win=${w} draw=${d} 共=${pool.passed.length}; 淘汰=${pool.rejected.length}`);
}

const mode = process.argv[2] || 'screen';
({ screen: modeScreen, verify: modeVerify, report: modeReport, write: modeWrite, reeval: modeReeval }[mode] || modeScreen)();
