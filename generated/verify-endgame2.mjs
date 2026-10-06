// 实用残局定式 v2 复核/新增验证器(基于最新 js/engine.js + js/ai.js)
//   node generated/verify-endgame2.mjs screen   粗筛: 旧55关复核 + 新候选 (红L6/黑L5, 2 seed, 130手, 1100ms)
//   node generated/verify-endgame2.mjs verify   精核: 粗筛存疑/新通过局 (红L6/黑L6, 4 seed, 160手, 1900ms)
//   node generated/verify-endgame2.mjs write    落盘通过的新候选 -> shard-endgame2.json
import * as E from '../js/engine.js';
import { searchBestMove } from '../js/ai.js';
import { PUZZLES } from '../js/puzzles.js';
import fs from 'node:fs';

const POOL = '/tmp/endgame-pool2.json';

// ---------------- 新增经典定式候选(胜和以残局理论引导, 一律经最强AI多seed实测) ----------------
const CAND = [
  // ===== 例胜(红攻, 必须全部 seed 红胜) =====
  { name: '单车胜单缺象', type: 'win', fen: '3akab2/9/9/9/9/9/9/9/R8/3K5 r',
    hint: '车借帅力各个击破，先捉孤象、再破双士，单缺象难守单车。' },
  { name: '单车胜单缺士', type: 'win', fen: '2b1k1b2/4a4/9/9/9/9/9/9/R8/4K4 r',
    hint: '车先破单士、再逐双象，帅占中路，单缺士必失。' },
  { name: '单车胜马双士', type: 'win', fen: '3aka3/9/2n6/9/9/9/9/9/R8/3K5 r',
    hint: '车赶马归边、逼马与双士自壅，再各个击破，马双士难守单车。' },
  { name: '双车胜士象全', type: 'win', fen: '2bakab2/9/9/9/9/9/9/R8/9/R2K5 r',
    hint: '双车胁士、硬砍花心，士象全也挡不住双车联攻。' },
  { name: '双车胜双士', type: 'win', fen: '3aka3/9/9/9/9/9/9/R8/9/R2K5 r',
    hint: '双车沉底胁士，一车换双士即成光将。' },
  { name: '车炮仕胜双士', type: 'win', fen: '3aka3/9/9/9/9/9/9/2C6/4A4/R3K4 r',
    hint: '炮借仕架镇中，车占肋道，双士顾此失彼。' },
  { name: '车马胜双士', type: 'win', fen: '3aka3/9/9/9/9/9/9/7N1/9/R2K5 r',
    hint: '马挂角、车沉底，双士联防亦被破。' },
  { name: '马炮胜双士', type: 'win', fen: '3aka3/9/9/9/9/9/9/4C4/7N1/4K4 r',
    hint: '炮镇中路、马控将门，双士难以两全。' },
  { name: '双马胜士象全', type: 'win', fen: '2bakab2/9/9/9/9/9/9/2N3N2/9/3K5 r',
    hint: '双马饮泉，一马换双士或挂角成杀，士象全难守双马。' },
  { name: '车兵胜单缺象', type: 'win', fen: '3akab2/9/9/9/9/4P4/9/9/9/R3K4 r',
    hint: '车占中路、兵入九宫换象，孤象一失防线即崩。' },
  { name: '马兵胜单缺士', type: 'win', fen: '2b1k1b2/4a4/9/9/9/4P4/9/9/7N1/4K4 r',
    hint: '高兵压境、马控将门，先换单士再破双象。' },
  { name: '车炮仕胜单缺象', type: 'win', fen: '3akab2/9/9/9/9/9/9/2C6/4A4/R3K4 r',
    hint: '炮借仕架牵制，车捉孤象破士，单缺象难守。' },
  { name: '车兵胜单象', type: 'win', fen: '4k1b2/9/9/9/9/4P4/9/9/9/R3K4 r',
    hint: '车兵联攻逼孤象归边，兵换象或车破象即胜。' },
  { name: '炮兵仕胜单缺象', type: 'win', fen: '3akab2/9/9/9/9/4P4/9/1C7/4A4/4K4 r',
    hint: '炮借仕架镇中，兵入九宫换象，孤象难支。' },

  // ===== 例和(黑守, 最强红亦不能胜; 全部 seed 红不胜) =====
  { name: '炮低兵难胜单象', type: 'draw', fen: '2b1k4/6P2/9/9/9/9/9/4C4/9/4K4 r',
    hint: '你执黑：孤象游走将之另一侧、勿塞炮架，炮低兵无仕难胜，正和。' },
  { name: '炮低兵和双象', type: 'draw', fen: '2b1k1b2/6P2/9/9/9/9/9/4C4/9/4K4 r',
    hint: '你执黑：双象连环、象走将侧，炮低兵无仕难破，正和。' },
  { name: '车低兵难胜单车', type: 'draw', fen: '4k4/3P5/4r4/9/9/9/9/9/9/2RK5 r',
    hint: '你执黑：车占中路、将前照应，红低兵无仕难破车防，正和。' },
  { name: '车马难胜士象全', type: 'draw', fen: '2bakab2/9/9/9/9/9/2N6/9/R8/3K5 r',
    hint: '你执黑：士象正位联防，红车马无仕相助攻难破，正和。' },
  { name: '马炮难胜士象全', type: 'draw', fen: '2bakab2/9/9/9/9/9/4C4/7N1/9/4K4 r',
    hint: '你执黑：士象正位联防，红马炮无仕相为架难破，正和。' },
  { name: '马低兵难胜单士', type: 'draw', fen: '4k4/4a1P2/9/9/9/9/9/9/7N1/4K4 r',
    hint: '你执黑：士随将转、将走高位，红低兵无力换士，可守和。' },
  { name: '车炮无仕难胜单车', type: 'draw', fen: '4k4/9/9/4r4/9/9/9/3R5/2C6/3K5 r',
    hint: '你执黑：黑车抢占中路，红车炮无仕难成海底捞月，正和。' }
];

function sigOfFen(fen) {
  const s = E.createState({ fen });
  const arr = [];
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x]; if (p) arr.push(`${p.c}${p.t}@${x},${y}`);
  }
  arr.sort();
  const mir = arr.map(z => { const [a, b, rest] = z; const [x, y] = rest.split('@')[0].split(',').map(Number); return `${a}${b}@${8 - x},${y}`; }).sort();
  return [arr.join(';'), mir.join(';')];
}
function staticLegal(fen) {
  let s;
  try { s = E.createState({ fen }); } catch (e) { return 'parse:' + e.message; }
  if (E.isInCheck(s, 'r') || E.isInCheck(s, 'b')) return '初始将军';
  if (!E.findKing(s, 'r') || !E.findKing(s, 'b')) return '缺王';
  if (!E.legalMoves(s, 'r').length || !E.legalMoves(s, 'b').length) return '初始无着法';
  // 士象兵位
  const EV = new Set([0, 2, 4, 6, 8]);
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x]; if (!p) continue;
    if (p.t === 'A') { if (x < 3 || x > 5) return '士出列'; if (p.c === 'r' ? (y < 7) : (y > 2)) return '士出九宫'; }
    if (p.t === 'B') {
      if (p.c === 'r' ? y < 5 : y > 4) return '象过河';
      if (p.c === 'r' ? ![2, 6, 0, 4, 8].includes(x) : ![2, 6, 0, 4, 8].includes(x)) return '象列非法';
      if ((p.c === 'r' ? [9, 7, 5] : [0, 2, 4]).includes(y) === false) return '象行非法';
    }
    if (p.t === 'P') { if (p.c === 'r' ? (y > 6 || (y > 4 && !EV.has(x))) : (y < 3 || (y < 5 && !EV.has(x)))) return '兵位非法'; }
  }
  return null;
}
function play(fen, seed, redLv, blackLv, maxMoves, ms) {
  const s = E.createState({ fen });
  if (E.isInCheck(s, 'r') || E.isInCheck(s, 'b')) return { status: 'illegal', n: 0 };
  const rng = E.mulberry32(seed);
  let guard = 0;
  while (s.status === 'playing' && s.moves.length < maxMoves) {
    const lv = s.turn === 'r' ? redLv : blackLv;
    const mv = searchBestMove(s, { level: lv, deadline: Date.now() + ms, rng, noBook: true });
    if (!mv) break;
    E.applyMove(s, mv.from, mv.to);
    guard++;
    if (guard > maxMoves + 4) break;
  }
  return { status: s.status, reason: s.reason, n: s.moves.length };
}
const okFor = (type, rs) => type === 'win'
  ? rs.every(r => r.status === 'redwin')
  : rs.every(r => r.status !== 'redwin');
const tag = rs => rs.map(r => `${r.status}/${(r.reason || '').slice(0, 4)}/${r.n}`).join('  ');

function loadPool() { try { return JSON.parse(fs.readFileSync(POOL, 'utf8')); } catch { return { cand: {}, old: {} }; } }
function savePool(p) { fs.writeFileSync(POOL, JSON.stringify(p, null, 1)); }

// 粗筛
function modeScreen() {
  const pool = loadPool();
  const jobs = [];
  // 旧关复核(只复核 endgame)
  for (const p of PUZZLES.filter(x => x.chapter === 'endgame'))
    jobs.push({ src: 'old', name: p.name, type: p.type, fen: p.fen, hint: p.hint });
  // 新候选(跳过与题库同形/镜像)
  const oldSigs = new Set();
  for (const p of PUZZLES) { const [a, b] = sigOfFen(p.fen); oldSigs.add(a); oldSigs.add(b); }
  for (const c of CAND) {
    const il = staticLegal(c.fen);
    if (il) { console.log(`✗[非法] ${c.name}: ${il}`); pool.cand[c.name] = { ...c, pass: false, why: il }; continue; }
    const [a, b] = sigOfFen(c.fen);
    if (oldSigs.has(a) || oldSigs.has(b)) { console.log(`—[重形] ${c.name}: 与现库重复, 跳过`); continue; }
    jobs.push({ src: 'new', ...c });
  }
  for (const j of jobs) {
    const bucket = j.src === 'old' ? pool.old : pool.cand;
    if (bucket[j.name] && bucket[j.name].screened) continue;
    const rs = [11, 29].map(sd => play(j.fen, sd, 6, 5, 130, 1100));
    const pass = okFor(j.type, rs);
    console.log(`${pass ? '✓' : '✗'}[${j.src}/${j.type}] ${j.name}: ${tag(rs)}`);
    bucket[j.name] = { ...j, screened: true, pass, results: rs, why: pass ? '' : 'screen-fail' };
    savePool(pool);
  }
  const oldBad = Object.values(pool.old).filter(x => x.screened && !x.pass);
  const newPass = Object.values(pool.cand).filter(x => x.screened && x.pass);
  console.log(`\n粗筛完成: 旧关存疑 ${oldBad.length} -> ${oldBad.map(x => x.name).join('、') || '无'}`);
  console.log(`新候选通过 ${newPass.length}: ${newPass.map(x => x.name).join('、')}`);
}

// 精核: 旧关存疑局 + 新候选通过局, 红黑均 L6, 4 seed
function modeVerify() {
  const pool = loadPool();
  const targets = [
    ...Object.values(pool.old).filter(x => x.screened && !x.pass).map(x => ({ ...x, src: 'old' })),
    ...Object.values(pool.cand).filter(x => x.screened && x.pass).map(x => ({ ...x, src: 'new' }))
  ];
  for (const j of targets) {
    if (j.verified) continue;
    // win: 最强黑(L6)防守下仍须红胜; draw: 黑已更强, 缩短手数再确认红不破
    const seeds = j.type === 'win' ? [7, 23, 41, 59] : [7, 23, 41];
    const maxMoves = j.type === 'win' ? 150 : 120;
    const ms = j.type === 'win' ? 1700 : 1300;
    const rs = seeds.map(sd => play(j.fen, sd, 6, 6, maxMoves, ms));
    const pass = okFor(j.type, rs);
    console.log(`${pass ? '✓' : '✗'}[精核/${j.src}/${j.type}] ${j.name}: ${tag(rs)}`);
    const bucket = j.src === 'old' ? pool.old : pool.cand;
    if (bucket[j.name]) { bucket[j.name].verified = pass; bucket[j.name].vresults = rs; bucket[j.name].pass = pass; }
    savePool(pool);
  }
  const oldBad = Object.values(pool.old).filter(x => x.verified === false);
  const newOk = Object.values(pool.cand).filter(x => x.verified);
  console.log(`\n精核: 旧关确认为错 ${oldBad.length} -> ${oldBad.map(x => x.name).join('、') || '无'}`);
  console.log(`新候选确认可录 ${newOk.length}: ${newOk.map(x => x.name).join('、')}`);
}

function modeWrite() {
  const pool = loadPool();
  const items = Object.values(pool.cand).filter(x => x.verified && x.type);
  // 分片内去重
  const seen = new Set();
  const out = [];
  for (const x of items) {
    const [a, b] = sigOfFen(x.fen);
    if (seen.has(a) || seen.has(b)) continue;
    seen.add(a); seen.add(b);
    out.push(x.type === 'win'
      ? { chapter: 'endgame', name: x.name, type: 'win', drawMoves: 80, fen: x.fen, hint: x.hint }
      : { chapter: 'endgame', name: x.name, type: 'draw', humanSide: 'b', drawMoves: 80, fen: x.fen, hint: x.hint });
  }
  fs.writeFileSync(new URL('../generated/shard-endgame2.json', import.meta.url), JSON.stringify(out, null, 1));
  const w = out.filter(x => x.type === 'win').length, d = out.filter(x => x.type === 'draw').length;
  console.log(`写入 shard-endgame2.json: win=${w} draw=${d} 共${out.length}`);
}

function modeCheck() {
  let bad = 0;
  for (const c of CAND) {
    const il = staticLegal(c.fen);
    if (il) { bad++; console.log(`✗ ${c.name} [${c.type}]: ${il}  fen=${c.fen}`); }
    else console.log(`✓ ${c.name} [${c.type}]`);
  }
  console.log(bad ? `\n${bad} 个候选静态非法, 需修正` : '\n全部候选静态合法');
}

const mode = process.argv[2] || 'screen';
({ screen: modeScreen, verify: modeVerify, write: modeWrite, check: modeCheck }[mode] || modeScreen)();
