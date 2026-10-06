// ============================================================
// 中国象棋规则引擎（经典模式 + 揭棋模式）—— 修正版副本（generated，供主线程合并前把关）
// 相对 js/engine.js 仅两处经典规则修正（见 // FIX(main-thread) 标注）：
//   (a) fastIsAttacked 马腿反向表方向修正（与正向 pieceTargets 同源）
//   (b) 长将(perpetual)胜负方向修正：长将方判负
// 揭棋增量 Zobrist 分叉(ai.js zApply)经典残局用不到，本副本不改，仅在 ai-fixed.mjs 注释注明。
// 坐标: x=0..8 (列, 红方视角从左到右), y=0..9 (行, y=0 黑方底线, y=9 红方底线)
// 棋子: { id, c:'r'|'b', t:'K|A|B|N|R|C|P', hidden?:bool, orig?:type }
//   K=帅/将 A=仕/士 B=相/象 N=马 R=车 C=炮 P=兵/卒
//   hidden=true 为揭棋暗子, orig=初始位置对应的"表观类型"(决定第一步走法), t=真身
// ESM, 同时可被浏览器与 Node 引用
// ============================================================

export const NAMES = {
  r: { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' },
  b: { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' }
};
// FEN 字母(UCCI 约定: 红大写 黑小写, b/n=象/马)
const FEN_T = { K: 'K', A: 'A', B: 'B', N: 'N', R: 'R', C: 'C', P: 'P' };
const FROM_FEN = { K: 'K', A: 'A', B: 'B', N: 'N', R: 'R', C: 'C', P: 'P' };

let PID = 1;
const newPiece = (c, t, extra = {}) => ({ id: PID++, c, t, ...extra });

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const inBoard = (x, y) => x >= 0 && x <= 8 && y >= 0 && y <= 9;
const inPalace = (x, y, c) => x >= 3 && x <= 5 && (c === 'r' ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
const ownSide = (y, c) => (c === 'r' ? y >= 5 : y <= 4);

// ------------------------------------------------------------
// 局面创建
// ------------------------------------------------------------
export function createState(opts = {}) {
  const state = {
    jieqi: !!opts.jieqi,
    seed: opts.seed != null ? opts.seed : (Math.random() * 4294967296) >>> 0,
    board: Array.from({ length: 10 }, () => Array(9).fill(null)),
    turn: 'r',
    moves: [],            // {from,to,c,t,captured({t,hidden}|null),notation,flip,check}
    captured: { r: [], b: [] }, // r: 红方吃掉的子; 元素 {t,hidden}
    status: 'playing',    // playing | redwin | blackwin | draw
    reason: '',
    posCount: new Map(),
    halfNoCapture: 0,
    perms: { r: {}, b: {} }, // 揭棋: "x,y" -> 真身类型 (联机时未知方为 '?')
    checkLog: [],
    initialFen: opts.fen || null,
    initialPerms: opts.perms || null
  };
  if (opts.fen) parseFEN(state, opts.fen);
  else if (state.jieqi) setupJieqi(state, opts.perms);
  else setupClassic(state);
  recordPosition(state);
  return state;
}

function setupClassic(state) {
  const put = (x, y, c, t) => { state.board[y][x] = newPiece(c, t); };
  const back = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'];
  for (let x = 0; x < 9; x++) {
    put(x, 0, 'b', back[x]);
    put(x, 9, 'r', back[x]);
  }
  put(1, 2, 'b', 'C'); put(7, 2, 'b', 'C');
  put(1, 7, 'r', 'C'); put(7, 7, 'r', 'C');
  for (const x of [0, 2, 4, 6, 8]) { put(x, 3, 'b', 'P'); put(x, 6, 'r', 'P'); }
}

// 揭棋初始布局: 将帅明置, 其余 15 子随机暗布于原位
// injectPerms: 联机注入 {r:{"x,y":t|'?'}, b:{...}}; 缺省由 seed 随机生成(单机全知)
export function setupJieqi(state, injectPerms = null) {
  const rng = mulberry32(state.seed);
  const put = (x, y, c, t, hidden, orig) => {
    state.board[y][x] = newPiece(c, t, hidden ? { hidden: true, orig } : {});
  };
  const backOrig = ['R', 'N', 'B', 'A', null, 'A', 'B', 'N', 'R'];
  for (const c of ['r', 'b']) {
    const yBack = c === 'r' ? 9 : 0;
    const yCannon = c === 'r' ? 7 : 2;
    const yPawn = c === 'r' ? 6 : 3;
    put(4, yBack, c, 'K'); // 将帅明置
    // 15 个位置及其表观类型
    const slots = [];
    for (let x = 0; x < 9; x++) if (x !== 4) slots.push([x, yBack, backOrig[x]]);
    slots.push([1, yCannon, 'C'], [7, yCannon, 'C']);
    for (const x of [0, 2, 4, 6, 8]) slots.push([x, yPawn, 'P']);
    let bag;
    if (injectPerms && injectPerms[c]) {
      bag = slots.map(([x, y]) => injectPerms[c][`${x},${y}`] || '?');
    } else {
      // 真身袋: 仕2 相2 马2 车2 炮2 兵5
      bag = shuffle(['A', 'A', 'B', 'B', 'N', 'N', 'R', 'R', 'C', 'C', 'P', 'P', 'P', 'P', 'P'], rng);
    }
    slots.forEach(([x, y, orig], i) => {
      const t = bag[i];
      put(x, y, c, t, true, orig);
      state.perms[c][`${x},${y}`] = t;
    });
  }
}

// 生成某一方的随机真身排列(联机协商用): 返回 {"x,y":t}
export function genPerm(color, rng) {
  const yBack = color === 'r' ? 9 : 0, yCannon = color === 'r' ? 7 : 2, yPawn = color === 'r' ? 6 : 3;
  const backOrig = ['R', 'N', 'B', 'A', null, 'A', 'B', 'N', 'R'];
  const slots = [];
  for (let x = 0; x < 9; x++) if (x !== 4) slots.push(`${x},${yBack}`);
  slots.push(`1,${yCannon}`, `7,${yCannon}`);
  for (const x of [0, 2, 4, 6, 8]) slots.push(`${x},${yPawn}`);
  const bag = shuffle(['A', 'A', 'B', 'B', 'N', 'N', 'R', 'R', 'C', 'C', 'P', 'P', 'P', 'P', 'P'], rng || Math.random);
  const perm = {};
  slots.forEach((k, i) => { perm[k] = bag[i]; });
  return perm;
}

// ------------------------------------------------------------
// FEN (经典局面; 暗子以 x/o 扩展并忽略真身, 仅供调试)
// 行序 y=0..9; 红方大写 RNBAKCP, 黑小写; turn: r/b
// ------------------------------------------------------------
export function toFEN(state) {
  const rows = [];
  for (let y = 0; y <= 9; y++) {
    let row = '', empty = 0;
    for (let x = 0; x <= 8; x++) {
      const p = state.board[y][x];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      if (p.hidden) { row += p.c === 'r' ? 'x' : 'o'; continue; }
      const ch = FEN_T[p.t];
      row += p.c === 'r' ? ch : ch.toLowerCase();
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${state.turn} - - 0 1`;
}

export function parseFEN(state, fen) {
  state.board = Array.from({ length: 10 }, () => Array(9).fill(null));
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  for (let y = 0; y < rows.length && y <= 9; y++) {
    let x = 0;
    for (const ch of rows[y]) {
      if (/\d/.test(ch)) { x += +ch; continue; }
      if (x > 8) break;
      if (ch === 'x' || ch === 'o') {
        const c = ch === 'x' ? 'r' : 'b';
        state.board[y][x] = newPiece(c, 'P', { hidden: true, orig: 'P' });
      } else {
        const upper = ch.toUpperCase();
        const t = FROM_FEN[upper];
        if (t) {
          const c = ch === upper ? 'r' : 'b';
          state.board[y][x] = newPiece(c, t);
        }
      }
      x++;
    }
  }
  state.turn = parts[1] === 'b' ? 'b' : 'r'; // w/r -> 红
  state.posCount = new Map();
  state.moves = [];
  state.captured = { r: [], b: [] };
  return state;
}

// ------------------------------------------------------------
// 伪走法生成
// ------------------------------------------------------------
function addRay(list, board, x, y, dirs, c, slide, capture) {
  for (const [dx, dy] of dirs) {
    let nx = x + dx, ny = y + dy;
    while (inBoard(nx, ny)) {
      const q = board[ny][nx];
      if (!q) { list.push({ x: nx, y: ny }); }
      else { if (q.c !== c && capture !== false) list.push({ x: nx, y: ny }); break; }
      if (!slide) break;
      nx += dx; ny += dy;
    }
  }
}

// 单个棋子的目标格(不考虑走完己方被将)
// piece: 棋子; jieqi: 是否揭棋(明仕/明相可过河)
export function pieceTargets(state, piece, x, y) {
  const board = state.board;
  const c = piece.c;
  const list = [];
  // 暗子按表观类型走"第一步"(经典限制, 且落地即翻)
  const t = piece.hidden ? piece.orig : piece.t;
  const revealedJieqi = state.jieqi && !piece.hidden;

  switch (t) {
    case 'K':
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (inPalace(nx, ny, c)) {
          const q = board[ny][nx];
          if (!q || q.c !== c) list.push({ x: nx, y: ny });
        }
      }
      break;
    case 'A':
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        if (!revealedJieqi && !inPalace(nx, ny, c)) continue; // 揭棋明仕可过河
        const q = board[ny][nx];
        if (!q || q.c !== c) list.push({ x: nx, y: ny });
      }
      break;
    case 'B':
      for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        if (!revealedJieqi && !ownSide(ny, c)) continue;       // 揭棋明相可过河
        if (board[y + dy / 2][x + dx / 2]) continue;           // 塞象眼
        const q = board[ny][nx];
        if (!q || q.c !== c) list.push({ x: nx, y: ny });
      }
      break;
    case 'N': {
      const legs = [
        [0, -1, -1, -2], [0, -1, 1, -2],
        [0, 1, -1, 2], [0, 1, 1, 2],
        [-1, 0, -2, -1], [-1, 0, -2, 1],
        [1, 0, 2, -1], [1, 0, 2, 1]
      ];
      for (const [lx, ly, dx, dy] of legs) {
        const nx = x + dx, ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        if (board[y + ly][x + lx]) continue;                   // 蹩马腿
        const q = board[ny][nx];
        if (!q || q.c !== c) list.push({ x: nx, y: ny });
      }
      break;
    }
    case 'R':
      addRay(list, board, x, y, [[1, 0], [-1, 0], [0, 1], [0, -1]], c, true);
      break;
    case 'C':
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nx = x + dx, ny = y + dy, jumped = false;
        while (inBoard(nx, ny)) {
          const q = board[ny][nx];
          if (!jumped) {
            if (!q) list.push({ x: nx, y: ny });
            else jumped = true;
          } else if (q) {
            if (q.c !== c) list.push({ x: nx, y: ny });
            break;
          }
          nx += dx; ny += dy;
        }
      }
      break;
    case 'P': {
      const fwd = c === 'r' ? -1 : 1;
      const crossed = c === 'r' ? y <= 4 : y >= 5;
      const cand = [[0, fwd]];
      if (crossed) cand.push([1, 0], [-1, 0]);
      for (const [dx, dy] of cand) {
        const nx = x + dx, ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        const q = board[ny][nx];
        if (!q || q.c !== c) list.push({ x: nx, y: ny });
      }
      break;
    }
  }
  return list;
}

export function pseudoMoves(state, c = state.turn) {
  const out = [];
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (!p || p.c !== c) continue;
    for (const tg of pieceTargets(state, p, x, y)) {
      out.push({ from: [x, y], to: [tg.x, tg.y] });
    }
  }
  return out;
}

// ------------------------------------------------------------
// 将军判定
// ------------------------------------------------------------
export function findKing(state, c) {
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (p && p.c === c && p.t === 'K' && !p.hidden) return [x, y];
  }
  return null;
}

// 格子 (tx,ty) 是否被 byColor 攻击(暗子按表观类型)
export function isAttacked(state, tx, ty, byColor) {
  const board = state.board;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = board[y][x];
    if (!p || p.c !== byColor) continue;
    const tg = pieceTargets(state, p, x, y);
    for (const g of tg) if (g.x === tx && g.y === ty) return true;
  }
  return false;
}

// 高性能反向攻击判定: 从目标格反推各敌子能否吃到(搜索热路径)
export function fastIsAttacked(state, kx, ky, by) {
  const board = state.board;
  const jieqi = state.jieqi;
  const at = (x, y) => (inBoard(x, y) ? board[y][x] : null);
  const isEnemy = (p, t) => p && p.c === by && (p.hidden ? p.orig === t : p.t === t);
  // 1. 仕(斜邻) / 王(直邻)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const p = at(kx + dx, ky + dy);
    if (isEnemy(p, 'K')) return true;
  }
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const p = at(kx + dx, ky + dy);
    if (isEnemy(p, 'A')) {
      // 经典模式明仕限九宫(暗仕首步亦限九宫)
      const ax = kx + dx, ay = ky + dy;
      if (jieqi && !p.hidden) return true;
      if (inPalace(ax, ay, by)) return true;
    }
  }
  // 2. 象: 田字源点 + 象眼
  for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
    const p = at(kx + dx, ky + dy);
    if (isEnemy(p, 'B')) {
      const ax = kx + dx, ay = ky + dy;
      if (board[ky + dy / 2][kx + dx / 2]) continue;
      if (jieqi && !p.hidden) return true;
      if (ownSide(ay, by)) return true; // 经典明象不过河
    }
  }
  // 3. 马: 日字源点 + 马腿
  // FIX(main-thread): 旧版马腿点错用「相对目标格(kx,ky)」的 (lx,ly)，导致蹩腿方向与正向 pieceTargets
  //   不一致(既误判蹩腿马将军、又漏判合法马将军)。现改为：马源 S=(kx+dx,ky+dy)，马腿是紧靠马源 S 一侧
  //   的肘点 S+(lx,ly)，与 pieceTargets(engine.js:235-248) 正向定义同源。
  const horseLegs = [
    [1, 2, 0, -1], [-1, 2, 0, -1], [1, -2, 0, 1], [-1, -2, 0, 1],
    [2, 1, -1, 0], [2, -1, -1, 0], [-2, 1, 1, 0], [-2, -1, 1, 0]
  ];
  for (const [dx, dy, lx, ly] of horseLegs) {
    const p = at(kx + dx, ky + dy);
    if (isEnemy(p, 'N') && !at(kx + dx + lx, ky + dy + ly)) return true;
  }
  // 4. 兵/卒 (从目标格反推兵源: 红兵向 y-1 进攻, 兵源在目标 y+1; 黑卒反之)
  const back = by === 'r' ? 1 : -1;
  if (isEnemy(at(kx, ky + back), 'P')) return true; // 正面直吃
  for (const dx of [1, -1]) {
    const p = at(kx + dx, ky);
    if (isEnemy(p, 'P')) {
      // 横吃要求该兵已过河(兵与目标同排, 用 ky 即兵所在行判断)
      const crossed = by === 'r' ? ky <= 4 : ky >= 5;
      if (crossed) return true;
    }
  }
  // 5. 车/炮/王照面: 四线扫描
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let x = kx + dx, y = ky + dy, screen = null;
    while (inBoard(x, y)) {
      const q = board[y][x];
      if (q) {
        if (!screen) {
          if (q.c === by && (q.hidden ? (q.orig === 'R') : (q.t === 'R' || q.t === 'K'))) return true;
          screen = q; // 成为炮架
        } else {
          if (q.c === by && (q.hidden ? q.orig === 'C' : q.t === 'C')) return true;
          break;
        }
      }
      x += dx; y += dy;
    }
  }
  return false;
}

export function isInCheck(state, c) {
  const kp = findKing(state, c);
  if (!kp) return true;
  const enemy = c === 'r' ? 'b' : 'r';
  // 将帅照面已包含在 fastIsAttacked 的直线扫描中
  return fastIsAttacked(state, kp[0], kp[1], enemy);
}

// 轻量走子/撤销(供合法性过滤与搜索)
function doMove(state, from, to) {
  const [fx, fy] = from, [tx, ty] = to;
  const piece = state.board[fy][fx];
  const cap = state.board[ty][tx];
  state.board[ty][tx] = piece;
  state.board[fy][fx] = null;
  return { piece, cap, fx, fy, tx, ty };
}
function undo(state, u) {
  state.board[u.fy][u.fx] = u.piece;
  state.board[u.ty][u.tx] = u.cap;
}

export function legalMoves(state, c = state.turn) {
  const out = [];
  for (const m of pseudoMoves(state, c)) {
    const u = doMove(state, m.from, m.to);
    if (!isInCheck(state, c)) out.push(m);
    undo(state, u);
  }
  return out;
}

export function legalTargetsFrom(state, x, y) {
  const p = state.board[y][x];
  if (!p || p.c !== state.turn) return [];
  const out = [];
  for (const tg of pieceTargets(state, p, x, y)) {
    const u = doMove(state, [x, y], [tg.x, tg.y]);
    if (!isInCheck(state, p.c)) out.push([tg.x, tg.y]);
    undo(state, u);
  }
  return out;
}

// ------------------------------------------------------------
// 中文记谱 (红: 汉字数字, 黑: 阿拉伯数字)
// ------------------------------------------------------------
const CN = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };
function road(c, x) { return c === 'r' ? 9 - x : x + 1; } // 路数 1..9
function num(c, n) { return c === 'r' ? CN[n] : String(n); }

export function moveNotation(state, from, to) {
  const [fx, fy] = from, [tx, ty] = to;
  const p = state.board[fy][fx];
  const c = p.c;
  const t = p.hidden ? p.orig : p.t;
  const name = NAMES[c][t];
  const sameCol = [];
  for (let y = 0; y <= 9; y++) {
    const q = state.board[y][fx];
    if (q && q.c === c && (q.hidden ? q.orig : q.t) === t) sameCol.push(q);
  }
  let head;
  if (sameCol.length === 2) {
    // 前/后 (以该方前进方向排序)
    const ys = sameCol.map(q => { for (let yy = 0; yy <= 9; yy++) if (state.board[yy][fx] === q) return yy; });
    const forwardY = c === 'r' ? Math.min(...ys) : Math.max(...ys);
    head = (fy === forwardY ? '前' : '后') + name;
  } else head = name + num(c, road(c, fx));

  const fwd = c === 'r' ? -1 : 1;
  let action, tail;
  if (ty === fy) { action = '平'; tail = num(c, road(c, tx)); }
  else action = (ty - fy) * fwd > 0 ? '进' : '退';
  if (action !== '平') {
    if (t === 'R' || t === 'C' || t === 'P' || fx === tx) tail = num(c, Math.abs(ty - fy));
    else tail = num(c, road(c, tx)); // 斜走子(马/仕/相)记目标列; 将/帅竖线直走进退记步数
  }
  return head + action + tail;
}

// ------------------------------------------------------------
// 正式走子 (含揭棋翻开/终局判定/重复局面/记谱)
// ------------------------------------------------------------
function positionKey(state) {
  let k = state.turn;
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (p) k += `/${x},${y},${p.c}${p.hidden ? '~' + p.orig : p.t}`;
  }
  return k;
}
function recordPosition(state) {
  const k = positionKey(state);
  state.posCount.set(k, (state.posCount.get(k) || 0) + 1);
}

// 暗子移动落地翻开; revealT: 联机时由对方揭示的真身(己方未知时)
function revealAfterMove(u, revealT) {
  if (!u.piece.hidden) return null;
  if (revealT) u.piece.t = revealT;
  u.piece.hidden = false;
  u.piece.orig = undefined;
  return { pos: [u.tx, u.ty], t: u.piece.t };
}

// 执行走子(不校验合法性, 调用方应先用 legalTargetsFrom 校验)
// opts.silent: 不更新终局(搜索用); opts.revealT: 暗子翻开真身(联机协商)
export function applyMove(state, from, to, opts = {}) {
  const [fx, fy] = from, [tx, ty] = to;
  const piece = state.board[fy][fx];
  const notation = moveNotation(state, from, to);
  const cap = state.board[ty][tx];
  state.board[ty][tx] = piece;
  state.board[fy][fx] = null;

  const reveal = revealAfterMove({ piece, fx, fy, tx, ty }, opts.revealT);
  const move = {
    from, to, c: piece.c, t: piece.t,
    captured: cap ? { c: cap.c, t: cap.t, hidden: !!cap.hidden, pos: [tx, ty] } : null,
    reveal, notation, flip: !!reveal
  };
  if (cap) {
    state.captured[piece.c].push({ t: cap.t, hidden: !!cap.hidden });
    state.halfNoCapture = 0;
  } else state.halfNoCapture++;
  state.moves.push(move);
  state.turn = state.turn === 'r' ? 'b' : 'r';

  if (!opts.silent) {
    const check = isInCheck(state, state.turn);
    move.check = check;
    state.checkLog.push(check ? state.turn : null);
    recordPosition(state);
    evaluateEnd(state, move);
  }
  return move;
}

function evaluateEnd(state, move) {
  // 1. 无棋可走: 将死(被将军)或困毙(未被将军) -> 走子方胜(中国象棋困毙判负)
  const moves = legalMoves(state, state.turn);
  if (moves.length === 0) {
    const checked = isInCheck(state, state.turn);
    state.status = state.turn === 'r' ? 'blackwin' : 'redwin';
    state.reason = checked ? 'checkmate' : 'stalemate';
    return;
  }
  // 2. 重复局面 3 次: 同一方连续长将则长将方判负, 否则和棋
  const k = positionKey(state);
  if ((state.posCount.get(k) || 0) >= 3) {
    const recent = state.checkLog.slice(-5); // 最近两个完整回合
    const checks = recent.filter(Boolean);
    let perpetual = null;
    if (checks.length >= 3) {
      const checkedSide = checks[0];
      if (checks.every(s => s === checkedSide)) perpetual = checkedSide === 'r' ? 'b' : 'r';
    }
    if (perpetual) {
      // FIX(main-thread): 旧版把胜判给长将方本人(perpetual)。按中国象棋规则长将方判负，
      //   应判给对方: 红长将 -> 黑胜(blackwin); 黑长将 -> 红胜(redwin)。
      state.status = perpetual === 'r' ? 'blackwin' : 'redwin';
      state.reason = 'perpetual';
    }
    else { state.status = 'draw'; state.reason = 'repetition'; }
    return;
  }
  // 3. 揭棋: 40 回合(80 半回合)无吃子判和
  if (state.jieqi && state.halfNoCapture >= 80) {
    state.status = 'draw'; state.reason = 'nocapture';
  }
}

// ------------------------------------------------------------
// 悔棋: 从初始局面重建并重放(重复计数/记谱/暗子状态完全一致)
// 联机悔棋通常 n=2 (双方各一手)
// ------------------------------------------------------------
export function undoMoves(state, n = 1, fullMoves = null) {
  const all = (fullMoves || state.moves).slice();
  const remain = Math.max(0, all.length - n);
  const fresh = createState({
    jieqi: state.jieqi, seed: state.seed,
    fen: state.initialFen, perms: state.initialPerms
  });
  state.board = fresh.board; state.perms = fresh.perms;
  state.posCount = fresh.posCount; state.checkLog = fresh.checkLog;
  state.halfNoCapture = 0;
  state.captured = { r: [], b: [] };
  state.moves = [];
  state.turn = fresh.turn;
  state.status = 'playing'; state.reason = '';
  for (let i = 0; i < remain; i++) {
    const m = all[i];
    applyMove(state, m.from, m.to, { revealT: m.reveal ? m.reveal.t : null });
  }
  return all.slice(remain);
}
export function undoLastMove(state) {
  if (!state.moves.length) return null;
  return undoMoves(state, 1)[0];
}

// 克隆(从初始局面重放)
export function cloneState(state) {
  const s = createState({
    jieqi: state.jieqi, seed: state.seed,
    fen: state.initialFen, perms: state.initialPerms
  });
  for (const m of state.moves) applyMove(s, m.from, m.to, { revealT: m.reveal ? m.reveal.t : null });
  return s;
}

// 序列化/反序列化(联机权威同步与复盘)
export function serialize(state) {
  const b = [];
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (p) b.push([x, y, p.c, p.t, p.hidden ? p.orig : 0]);
  }
  return {
    jieqi: state.jieqi, seed: state.seed, turn: state.turn, status: state.status, reason: state.reason,
    half: state.halfNoCapture, pieces: b,
    moves: state.moves, captured: state.captured,
    initialFen: state.initialFen, initialPerms: state.initialPerms
  };
}
export function restore(data) {
  // 从初始局面重放, 保证计数/将军状态/暗子翻开状态一致
  const s = createState({
    jieqi: data.jieqi, seed: data.seed,
    fen: data.initialFen, perms: data.initialPerms
  });
  for (const m of (data.moves || [])) {
    applyMove(s, m.from, m.to, { revealT: m.reveal ? m.reveal.t : null });
  }
  // 以权威快照中的状态为准(含超时/认输等非引擎终局)
  s.status = data.status;
  s.reason = data.reason;
  return s;
}

// 工具: 统计棋子
export function countPieces(state) {
  const n = { r: {}, b: {} };
  for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
    const p = state.board[y][x];
    if (p && !p.hidden) { n[p.c][p.t] = (n[p.c][p.t] || 0) + 1; }
  }
  return n;
}
