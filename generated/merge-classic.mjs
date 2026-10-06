// 合并古谱名局分片: 原 shard-classic.json + 新 shard-c3a/c4a/c4b/c5*.json
// 全局 FEN/镜像签名去重(含原始271关底表) + 跨片重名自动加后缀; 结果覆盖 shard-classic.json
import * as E from '../js/engine.js';
import { playLine } from '../js/notation.js';
import { PUZZLES as OLD } from './puzzles.orig.js';
import fs from 'node:fs';

const ROOT = '/home/user/Doubao/chats/38444973861070338/xiangqi-lan/generated';
function read(p) { try { return JSON.parse(fs.readFileSync(ROOT + '/' + p, 'utf8')); } catch { return null; } }
const base = read('shard-classic.json') || [];
if (!fs.existsSync(ROOT + '/shard-classic.orig.json')) fs.writeFileSync(ROOT + '/shard-classic.orig.json', JSON.stringify(base, null, 1));

const files = ['shard-classic.orig.json', 'shard-c3a.json', 'shard-c4a.json', 'shard-c4b.json', 'shard-c5a.json', 'shard-c5b.json'];
function sigPair(fen) {
  const s = E.createState({ fen });
  const cells = [];
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = s.board[y][x];
    if (p) cells.push((p.c === 'r' ? p.t : p.t.toLowerCase()) + '@' + x + ',' + y);
  }
  cells.sort();
  const mir = cells.map(z => { const [a, r] = z.split('@'); const [x, y] = r.split(',').map(Number); return a + '@' + (8 - x) + ',' + y; }).sort();
  return [cells.join('|'), mir.join('|')];
}
const used = new Set();
for (const p of OLD) for (const z of sigPair(p.fen)) used.add(z);

const CN2 = { '2': '二', '3': '三', '4': '四', '5': '五' };
const baseName = n => n.replace(/·[二三四五]$/, '');
const nameCount = {};
function allocName(raw) {
  const b = baseName(raw);
  // 以"去后缀的根名"计数, 跨片重名统一顺延
  nameCount[b] = (nameCount[b] || 0) + 1;
  if (nameCount[b] === 1) return b;
  return b + '·' + CN2[nameCount[b]];
}
// 先把底表(原44)名字占上
const out = [];
for (const p of base) {
  for (const z of sigPair(p.fen)) used.add(z);
  nameCount[baseName(p.name)] = (nameCount[baseName(p.name)] || 0) + 1;
  out.push(p);
}
const stats = {};
let dupSig = 0, dupLine = 0;
for (const f of files.slice(1)) {
  const arr = read(f); if (!arr) continue;
  for (const p of arr) {
    const [sg, mg] = sigPair(p.fen);
    if (used.has(sg) || used.has(mg)) { dupSig++; continue; }
    // 主变终局校验
    const texts = p.line.replace(/#\s*$/, '').trim().split(/\s+/);
    const sv = E.createState({ fen: p.fen });
    const pl = playLine(sv, texts);
    if (!pl.ok || sv.status !== 'redwin') { dupLine++; continue; }
    used.add(sg); used.add(mg);
    const nm = allocName(p.name);
    stats[p.mate] = (stats[p.mate] || 0) + 1;
    out.push({ ...p, name: nm, hint: `古谱名局「${baseName(nm)}」：红方先手，${p.mate} 步精巧连杀。` });
  }
}
// 排序: 按步数, 再按名字
out.sort((a, b) => a.mate - b.mate || a.name.localeCompare(b.name, 'zh'));
fs.writeFileSync(ROOT + '/shard-classic.json', JSON.stringify(out, null, 1));
const cnt = {};
for (const p of out) cnt[p.mate] = (cnt[p.mate] || 0) + 1;
console.log(`合并完成: 古谱共 ${out.length} 局 (3步${cnt[3] || 0}/4步${cnt[4] || 0}/5步${cnt[5] || 0})`);
console.log(`本次新增 ${out.length - base.length} 局; 签名重复剔除 ${dupSig}, 主变无效剔除 ${dupLine}`);
