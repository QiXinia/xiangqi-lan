// 单文件打包: 递归内联 ESM -> 单个 <script type=module>; Worker -> Blob; 字体/vendor 内联
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

const ROOT = resolve('.');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

function stripModule(code) {
  const deps = [];
  // import ... from '...' (含多行)
  code = code.replace(/^import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]\s*;?/gm, (m, names, src) => {
    if (src.startsWith('.')) deps.push(src);
    // 把 "realName as Alias" 绑定为局部 const Alias=realName(供 ai-pro 的 PRO_ 别名在拼接作用域内解析);
    // 无别名的 { x } 直接引用 realName, 无需绑定。
    const binds = [];
    names.split(',').forEach(part => {
      const t = part.trim();
      if (!t) return;
      const mm = t.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (mm) binds.push(`${mm[2]}=${mm[1]}`);
    });
    return binds.length ? `;const ${binds.join(',')};` : '';
  });
  // side-effect import
  code = code.replace(/import\s*['"][^'"]+['"]\s*;?/g, '');
  // export { a, b }
  code = code.replace(/export\s*\{[\s\S]*?\}\s*;?/g, '');
  // export default
  code = code.replace(/export\s+default\s+/g, '');
  // export class/function/const/let/var
  code = code.replace(/^export\s+(?=(?:default\s+)?(?:class|function|const|let|var|async))/gm, '');
  return { code, deps };
}

const cache = new Map();
function bundle(entry) {
  const order = [];
  const seen = new Set();
  function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const raw = read(file);
    const { code, deps } = stripModule(raw);
    const dir = dirname(resolve(ROOT, file));
    for (const d of deps) {
      const dep = resolve(dir, d).replace(ROOT + '/', '');
      walk(dep);
    }
    order.push(`/* ===== ${file} ===== */\n${code}`);
  }
  walk(entry);
  return { code: order.join('\n'), files: [...seen] };
}

// 顶层标识符冲突检测
function topLevelNames(code) {
  const names = new Set();
  const re = /^(?:export\s+)?(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(code))) names.add(m[1]);
  return names;
}

// ---- 主 bundle ----
let mainBundle = bundle('js/app.js');
let main = mainBundle.code;
// 单文件无独立 sw.js, 移除 SW 注册(精确整段)
main = main.replace(
  `if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
}`,
  '/* service worker 已在单文件版中移除 */');
// Worker -> Blob
let workerBundle = bundle('js/ai.worker.js');
let worker = workerBundle.code.replace(/^\/\*.*?\*\//gs, ''); // 不需要文件头注释
const workerLit = JSON.stringify(worker);
main = main.replace(
  /new Worker\(['"][^'"]+ai\.worker\.js['"],\s*\{\s*type:\s*'module'\s*\}\)/,
  `new Worker(URL.createObjectURL(new Blob([${workerLit}], { type: 'text/javascript' })))`
);
if (/new Worker\(['"][^'"]*ai\.worker\.js/.test(main)) throw new Error('worker 引用未替换');

// ---- CSS + 字体 ----
let css = read('css/style.css');
const fontB64 = readFileSync(resolve(ROOT, 'fonts/chess.woff2')).toString('base64');
css = css.replace(/url\(['"]?\.\.\/fonts\/chess\.woff2['"]?\)/, `url(data:font/woff2;base64,${fontB64})`);

// ---- 重复声名校验(对每个 bundle 实际收录的文件) ----
function checkDup(bundleFiles, label) {
  const perFile = new Map();
  for (const f of bundleFiles) {
    const { code } = stripModule(read(f));
    perFile.set(f, topLevelNames(code));
  }
  const all = new Map();
  for (const [f, ns] of perFile) for (const n of ns) {
    if (!all.has(n)) all.set(n, []);
    all.get(n).push(f);
  }
  const dup = [...all].filter(([, fs]) => new Set(fs).size > 1);
  if (dup.length) {
    console.log(`DUP TOP-LEVEL (${label}):`, JSON.stringify(dup, null, 1));
    throw new Error('顶层标识符冲突: ' + label);
  }
}
checkDup(mainBundle.files, 'main');
checkDup(workerBundle.files, 'worker');

// ---- HTML ----
let html = read('index.html');
const fav = readFileSync(resolve(ROOT, 'icons/icon.svg')).toString('base64');
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const headInject = [
  `<link rel="icon" href="data:image/svg+xml;base64,${fav}">`,
  `<style>\n${css}\n</style>`,
  `<script>\n${esc(read('vendor/pako.min.js'))}\n</script>`,
  `<script>\n${esc(read('vendor/qrcode.js'))}\n</script>`,
  `<script>\n${esc(read('vendor/jsqr.js'))}\n</script>`,
].join('\n');
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
html = html.replace(/<link rel="icon"[^>]*>\n?/, '');
html = html.replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '');
html = html.replace(/<link rel="stylesheet"[^>]*>\n?/, '');
html = html.replace(/<script src="vendor\/[^"]*"><\/script>\n?/g, '');
html = html.replace('<title>', () => headInject + '\n<title>'); // 函数形式: 避免替换串中的 $& $` 被特殊解释
html = html.replace(/<script type="module" src="js\/app\.js(?:\?[^"]*)?"><\/script>/,
  () => `<script type="module">\n${esc(main)}\n</script>`);

writeFileSync('xiangqi-lan-standalone.html', html);
writeFileSync('/tmp/check-main.mjs', main);
writeFileSync('/tmp/check-worker.js', worker);
console.log('OK bytes=', html.length, 'main=', main.length, 'worker=', worker.length);
