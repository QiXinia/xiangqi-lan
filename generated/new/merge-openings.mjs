// ============================================================
// 主线统一合并(棋谱库): 把 generated/new/ancient-games.mjs(古谱全局) 与
// famous-endgames.mjs(江湖排局·名局鉴赏) 注入 js/openings.js 的 OPENINGS,
// 自动编号 op33.., 统一 book:false(仅供打谱, 不进 AI 开局库; 排局另带自定义 fen);
// 并新增 ancient/famous 两个分类、令 BOOK 构建跳过这些条目。
// 运行: node generated/new/merge-openings.mjs          (dry-run)
//       APPLY=1 node generated/new/merge-openings.mjs   (写入, 自动备份)
// ============================================================
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const APPLY = process.env.APPLY === '1';
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

async function load(file) {
  const p = path.join(ROOT, 'generated/new', file);
  if (!fs.existsSync(p)) return [];
  const mod = await import(pathToFileURL(p).href + '?t=' + Date.now());
  return mod.NEW_OPENINGS || [];
}
const ancient = await load('ancient-games.mjs');
const famous = await load('famous-endgames.mjs');
const study = [...ancient, ...famous];
console.log('待注入棋谱库条目:', ancient.length, '古谱 +', famous.length, '排局 =', study.length);

function ser(op, id) {
  const lines = [];
  lines.push(`  {`);
  lines.push(`    id: ${q(id)}, cat: ${q(op.cat)}, family: ${q(op.family)}, name: ${q(op.name)}, book: false,`);
  lines.push(`    intro: ${q(op.intro)},`);
  if (op.fen) lines.push(`    fen: ${q(op.fen)},`);
  lines.push(`    moves: [${op.moves.map(q).join(', ')}]${op.result ? ',' : ''}`);
  if (op.result) lines.push(`    result: ${q(op.result)}`);
  lines.push(`  }`);
  return lines.join('\n');
}

const pp = path.join(ROOT, 'js/openings.js');
let src = fs.readFileSync(pp, 'utf8');

// 已注入过则幂等中止
if (src.includes("cat: 'ancient'") || src.includes("cat: 'famous'")) {
  console.log('openings.js 已含 ancient/famous 条目, 跳过(幂等)。');
  process.exit(0);
}

// 1) 新增分类(若缺)
if (!src.includes("id: 'ancient'")) {
  const catBlock = `,
  { id: 'ancient', name: '古谱全局', desc: '《橘中秘》《梅花谱》《自出洞来无敌手》等公版古谱全盘名局, 按谱打谱推演' },
  { id: 'famous', name: '名局鉴赏', desc: '七星聚会等经典江湖排局·四大名局, 多为变化繁复的著名和局, 供鉴赏打谱, 非限时必胜关' }
];`;
  // 在 OPENING_CATEGORIES 的结束 "];" 前插入
  const catStart = src.indexOf('export const OPENING_CATEGORIES');
  const catEnd = src.indexOf('];', catStart);
  src = src.slice(0, catEnd) + catBlock + '\n' + src.slice(catEnd + 2);
}

// 2) 注入条目到 OPENINGS 数组结束(定位 "];\n\n// ---------- 局面索引")
const anchor = '];\n\n// ---------- 局面索引';
const ai = src.indexOf(anchor);
if (ai < 0) throw new Error('未找到 OPENINGS 数组结束锚点');
// 计算起始编号: 现有最大 opN
const ids = [...src.matchAll(/id: 'op(\d+)'/g)].map(m => Number(m[1]));
let n = (ids.length ? Math.max(...ids) : 16);
const blocks = study.map(op => { n += 1; return ser(op, 'op' + n); });
const inject = ',\n' + blocks.join(',\n') + '\n';
src = src.slice(0, ai) + inject + src.slice(ai);

// 3) BOOK 构建跳过 study 条目(自定义 fen 无法从初始局面索引; 古谱仅供打谱)
const loopNeedle = 'for (const op of OPENINGS) {\n  const s = createState();';
const loopRepl = 'for (const op of OPENINGS) {\n  if (op.book === false || op.fen) continue; // 古谱全局/名局鉴赏仅供打谱, 不入 AI 开局库\n  const s = createState();';
if (!src.includes(loopNeedle)) throw new Error('未找到 BOOK 构建循环锚点');
src = src.replace(loopNeedle, loopRepl);

if (APPLY) {
  fs.writeFileSync(path.join(ROOT, 'generated/new/openings.before-study.js'), fs.readFileSync(pp));
  fs.writeFileSync(pp, src);
  console.log('已写入 js/openings.js, 共', n, '局; 备份 openings.before-study.js');
} else {
  console.log('(dry-run; 加 APPLY=1 写入) 注入后总局数 =', n);
}
