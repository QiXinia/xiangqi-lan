// ============================================================
// SVG 中国象棋棋盘视图(手机竖屏, 矢量棋子, 新魏体)
// 逻辑坐标 1000 x 1110; 棋子按「格子+特征」diff 复用节点
// 外层 g.piece 负责位置(CSS transform, transition 滑动);
// 内层 g.fx-inner 负责起落/吃子飞离/回场淡入(独立 transform/opacity, 不与定位冲突)
// ============================================================
import { NAMES, legalTargetsFrom } from './engine.js';

const W = 1000, M = 62, CELL = (W - 2 * M) / 8, H = 2 * M + 9 * CELL, R = 47;
const px = (x) => M + x * CELL;
const py = (y) => M + y * CELL;
const SVGNS = 'http://www.w3.org/2000/svg';

export class BoardView {
  constructor(container, opts = {}) {
    this.container = container;
    this.viewSide = opts.viewSide || 'r';
    // 同台对坐模式: 棋盘固定不翻转, 黑方棋子/河界文字旋转 180° 朝黑方(手机上侧)
    this.dualView = !!opts.dualView;
    this.jieqi = !!opts.jieqi;
    this.onMove = opts.onMove || (() => { });
    this.interactive = opts.interactive !== false;
    this.sel = null;
    this.lastMove = null;
    this.checkSide = null;
    // 近期被吃棋子登记: "x,y|特征键" -> {born} ; 悔棋回场时据此反向淡入
    this._graveyard = new Map();
    this._primed = false; // 首次铺盘后才启用过渡/回场动画
    this._crossRafs = new Set(); // 跨格回场在途的 rAF 句柄, 供销毁/接管时取消
    this._fxT = [];       // 本帧的移动记录 {fx,fy,tx,ty}
    this._endTimer = null;
    this._build();
  }
  _reduced() {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    // 旧版经典皮肤: 关闭走子/将军/绝杀动效, 棋子即时归位、终局直接弹窗(朴素反馈)
    try { return document.documentElement.dataset.theme === 'classic'; } catch (e) { return false; }
  }
  el(tag, attrs = {}, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  _build() {
    const root = document.createElement('div');
    root.className = 'board-root';
    root.innerHTML = `
    <svg class="board-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="pieceFace" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stop-color="#fbf1d8"/><stop offset="70%" stop-color="#f3e0b8"/><stop offset="100%" stop-color="#e6c98f"/>
        </radialGradient>
        <radialGradient id="pieceDark" cx="38%" cy="30%" r="80%">
          <stop offset="0%" stop-color="#a85a40"/><stop offset="70%" stop-color="#7d3d29"/><stop offset="100%" stop-color="#55261a"/>
        </radialGradient>
        <filter id="pieceShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#3a2208" flood-opacity="0.45"/>
        </filter>
      </defs>
      <g class="board-rotate">
        <rect x="6" y="6" rx="26" width="${W - 12}" height="${H - 12}" class="board-bg" fill="#f0d3a0"/>
        <g class="lines"></g>
        <g class="river"></g>
        <g class="palaces"></g>
        <g class="markers"></g>
        <g class="hints"></g>
        <g class="pieces"></g>
      </g>
    </svg>`;
    this.root = root;
    this.container.appendChild(root);
    const svg = root.querySelector('svg');
    this.svg = svg;
    this.gLines = root.querySelector('.lines');
    this.gRiver = root.querySelector('.river');
    this.gPalaces = root.querySelector('.palaces');
    this.gMarkers = root.querySelector('.markers');
    this.gHints = root.querySelector('.hints');
    this.gPieces = root.querySelector('.pieces');
    this._drawLines();
    svg.addEventListener('click', (e) => this._tap(e));
  }
  _line(x1, y1, x2, y2, cls = '') { this.el('line', { x1, y1, x2, y2, class: 'grid-line ' + cls }, this.gLines); }
  _drawLines() {
    // 横线 10 条
    for (let y = 0; y <= 9; y++) this._line(px(0), py(y), px(8), py(y));
    // 竖线 9 条(河界中断, 边线贯通)
    for (let x = 0; x <= 8; x++) {
      if (x === 0 || x === 8) this._line(px(x), py(0), px(x), py(9));
      else { this._line(px(x), py(0), px(x), py(4)); this._line(px(x), py(5), px(x), py(9)); }
    }
    // 九宫斜线
    const pal = (y1, y2) => {
      this.el('line', { x1: px(3), y1: py(y1), x2: px(5), y2: py(y2), class: 'grid-line thin' }, this.gPalaces);
      this.el('line', { x1: px(5), y1: py(y1), x2: px(3), y2: py(y2), class: 'grid-line thin' }, this.gPalaces);
    };
    pal(0, 2); pal(7, 9);
    // 楚河汉界(对坐模式: 楚河朝黑方旋转180°, 汉界朝红方, 两人各见正立文字)
    const ry = (py(4) + py(5)) / 2;
    // 用嵌套 g + attribute transform 旋转(避开 CSS transform-box 对 SVG text 的怪异处理)
    const g1 = this.el('g', this.dualView ? { transform: `rotate(180 ${px(2)} ${ry})` } : {}, this.gRiver);
    const t1 = this.el('text', { x: px(2), y: ry, class: 'river-text' }, g1);
    t1.textContent = '楚 河';
    const t2 = this.el('text', { x: px(6), y: ry, class: 'river-text' }, this.gRiver);
    t2.textContent = '汉 界';
    // 炮位/兵位角标(四象限 L 形)
    const mark = (x, y) => {
      const o = R + 7, l = 17, s = 8;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const bx = x + dx, by = y + dy;
        if (bx < 0 || bx > 8 || by < 0 || by > 9) continue;
        if (((y === 4 && by === 5) || (y === 5 && by === 4)) && x > 0 && x < 8) continue;
        const cx = px(x) + dx * o, cy = py(y) + dy * o;
        this.el('line', { x1: cx, y1: cy + dy * s, x2: cx + dx * l, y2: cy + dy * s, class: 'grid-line thin' }, this.gMarkers);
        this.el('line', { x1: cx + dx * s, y1: cy, x2: cx + dx * s, y2: cy + dy * l }, this.gMarkers);
      }
    };
    for (const [x, y] of [[1, 2], [7, 2], [1, 7], [7, 7],
      [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]]) mark(x, y);
  }
  setViewSide(side) {
    this.viewSide = side;
    if (this.dualView) {
      // 对坐模式棋盘永不整体翻转
      this.root.querySelector('.board-rotate').setAttribute('transform', '');
      this.root.classList.remove('flipped');
      return;
    }
    this.root.querySelector('.board-rotate').setAttribute('transform', side === 'b' ? `rotate(180 ${W / 2} ${H / 2})` : '');
    this.root.classList.toggle('flipped', side === 'b');
  }
  setState(state) { this.state = state; this.render(); }
  setInteractive(v) { this.interactive = v; }
  // 交接到新行棋方/对方应招结束时, 清除上一步遗留的落子动画锁
  clearMoveLock() { this._moveLockUntil = 0; }
  setLastMove(m) { this.lastMove = m; this._drawHints(); }
  setCheck(side) {
    const was = this.checkSide;
    this.checkSide = side;
    if (side && side !== was) this._checkFxEdge(side);      // 无将军 -> 有将军: 边沿触发一次
    else if (!side && was) this._clearCheckFx();           // 将军解除
    // 仅重绘提示层增删 check-ring, 不重建棋子(避免二次 render 重置吃子飞离方向/定时器)
    this._drawHints();
  }

  _tap(e) {
    if (!this.interactive || !this.state) return;
    // 注意: 落子动画锁(_moveLockUntil)不在此整体拦截, 否则新行棋方在快速应招
    // (入门AI/残局/无交接同台)后, 回合开头的"选子"点击会被上一步遗留的锁吞掉,
    // 表现为"下一步被直接跳过"。锁只在 onTap 内拦截"落子", 选子始终放行。
    const rect = this.svg.getBoundingClientRect();
    let lx = (e.clientX - rect.left) / rect.width * W;
    let ly = (e.clientY - rect.top) / rect.height * H;
    if (this.viewSide === 'b') { lx = W - lx; ly = H - ly; }
    const x = Math.round((lx - M) / CELL), y = Math.round((ly - M) / CELL);
    if (x < 0 || x > 8 || y < 0 || y > 9) return;
    // 不再用 0.45 格硬容差拒绝边缘点击: Math.round 已把触点归到最近交叉点,
    // 全盘按"最近邻"响应(每个交叉点独占半格 Voronoi 区), 点棋子边缘/两子缝隙
    // 也能稳定命中; 点到无棋子的空位由 onTap 安全地当作取消选择处理
    this.onTap(x, y);
  }
  onTap(x, y) {
    const p = this.state.board[y][x];
    if (this.sel) {
      const [fx, fy] = this.sel;
      const targets = legalTargetsFrom(this.state, fx, fy);
      if (targets.some(t => t[0] === x && t[1] === y)) {
        // 落子动画窗口内: 仅暂缓"落子", 保留选中态与落点提示。
        // 这样新行棋方任何时刻都能先选中棋子(跟手), 极端快速的连点最多让"落子"
        // 顺延一次点击(选中仍在), 绝不会把一整步无声吞掉。
        if (performance.now() < (this._moveLockUntil || 0)) return;
        const from = this.sel; this.sel = null; this._drawHints();
        this._moveLockUntil = performance.now() + 320; // 与棋子滑动 .3s + 落子顿感对齐
        this.onMove(from, [x, y]);
        return;
      }
    }
    if (p && p.c === this.state.turn) {
      this.sel = [x, y];
      this._drawHints();
    } else { this.sel = null; this._drawHints(); }
  }
  showHintsFromAI(from, to) {
    // 提示着法高亮
    this.sel = from; this._drawHints(to);
  }
  clearHint() { this.sel = null; this._drawHints(); }
  _drawHints(aiHintTo) {
    this.gHints.innerHTML = '';
    if (this.lastMove) {
      for (const [x, y] of [this.lastMove.from, this.lastMove.to]) {
        this.el('rect', { x: px(x) - R - 4, y: py(y) - R - 4, width: (R + 4) * 2, height: (R + 4) * 2, rx: 8, class: 'last-mark' }, this.gHints);
      }
    }
    if (this.checkSide) {
      const kp = this._kingPos(this.checkSide);
      if (kp) this.el('circle', { cx: px(kp[0]), cy: py(kp[1]), r: R + 6, class: 'check-ring' }, this.gHints);
    }
    if (!this.sel) return;
    const [fx, fy] = this.sel;
    this.el('circle', { cx: px(fx), cy: py(fy), r: R + 5, class: 'sel-ring' }, this.gHints);
    const targets = aiHintTo ? [aiHintTo] : legalTargetsFrom(this.state, fx, fy);
    for (const [tx, ty] of targets) {
      if (this.state.board[ty][tx]) this.el('circle', { cx: px(tx), cy: py(ty), r: R + 4, class: 'cap-ring' }, this.gHints);
      else this.el('circle', { cx: px(tx), cy: py(ty), r: 11, class: 'dot' }, this.gHints);
    }
  }
  _kingPos(c) {
    for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
      const p = this.state.board[y][x];
      if (p && p.c === c && p.t === 'K') return [x, y];
    }
    return null;
  }

  // 特征键: 用于跨 undo 重建(棋子 id 全变)后的节点匹配
  _dk(p) { return p.c + '|' + p.t + '|' + (p.hidden ? 1 : 0); }

  render() {
    if (!this.state) return;
    // 1) 快照现存棋子节点(数组, 容忍同格多节点——吃子删除窗口内被吃子仍在 DOM)
    const prev = [];
    for (const g of this.gPieces.children) {
      const x = g.dataset && g.dataset.x;
      if (x == null || x === '') continue;
      prev.push(g);
    }
    const used = new Set();
    const bind = new Map();   // cur -> g
    const cur = [];
    for (let y = 0; y <= 9; y++) for (let x = 0; x <= 8; x++) {
      const p = this.state.board[y][x];
      if (p) cur.push({ p, x, y });
    }
    const compatible = (g, p) =>
      g._dk === this._dk(p) || (g._c === p.c && !!g._hidden !== !!p.hidden);

    // ---- 阶段A: 全盘先锁定静止子(同格同特征), 含回收 300ms 窗口内的残留被吃节点 ----
    const unbound = [];
    for (const c of cur) {
      let g = null;
      for (const pg of prev) {
        if (used.has(pg)) continue;
        if (+pg.dataset.x === c.x && +pg.dataset.y === c.y && pg._dk === this._dk(c.p)) { g = pg; break; }
      }
      if (g) {
        used.add(g);
        if (g._dead || g.classList.contains('fx-captured')) {
          // 悔棋在删除窗口内复活到原格: 就地复用, 清除飞离状态与删除定时器
          g.classList.remove('fx-captured');
          g._inner.style.removeProperty('--fx-flyx');
          g._inner.style.removeProperty('--fx-flyy');
          clearTimeout(g._removeT);
          g._dead = false;
        }
        bind.set(c, g);
      } else unbound.push(c);
    }

    // ---- 阶段B: 剩余当前子 × 剩余存活节点, 全局最小距离配对(排除 _dead 节点) ----
    let free = prev.filter(g => !used.has(g) && !g._dead && !g.classList.contains('fx-captured'));
    while (unbound.length && free.length) {
      let bestD = Infinity, bi = -1, bj = -1;
      for (let i = 0; i < unbound.length; i++) {
        for (let j = 0; j < free.length; j++) {
          const g = free[j];
          if (!compatible(g, unbound[i].p)) continue;
          const d = (+g.dataset.x - unbound[i].x) ** 2 + (+g.dataset.y - unbound[i].y) ** 2;
          if (d < bestD) { bestD = d; bi = i; bj = j; }
        }
      }
      if (bi < 0) break; // 再无可配对
      used.add(free[bj]);
      bind.set(unbound[bi], free[bj]);
      unbound.splice(bi, 1);
      free.splice(bj, 1);
    }
    // 仍无节点 = 全新出现/被吃后回场
    const fresh = new Set();
    // 仅"本帧"跨格回场的节点: 其定位交给 _enterFromGraveyard 的双 rAF 落位,
    // 只在这一帧跳过直接定位; 绝不能把标记长期留在节点上, 否则该子以后每一帧都被
    // 跳过 transform 更新 -> 逻辑/dataset 已走、视觉却永久卡在原地("棋子移不动/
    // 移动与判定不一致", 悔棋、残局重摆后必现)。
    const crossReturning = new Set();
    for (const c of unbound) {
      const g = this._makePiece(c.p);
      if (this._enterFromGraveyard(g, c.p, c.x, c.y)) crossReturning.add(g);
      bind.set(c, g);
      fresh.add(g);
    }

    // ---- 统计真移动子(绑定节点来自不同格) ----
    const moves = [];
    const movers = new Set();
    const plan = [];
    for (const c of cur) {
      const g = bind.get(c);
      let moved = false;
      if (!fresh.has(g)) {
        const ox = +g.dataset.x, oy = +g.dataset.y;
        if (ox !== c.x || oy !== c.y) { moved = true; moves.push({ fx: ox, fy: oy, tx: c.x, ty: c.y }); movers.add(g); }
      }
      plan.push({ g, p: c.p, x: c.x, y: c.y, moved });
    }

    // 批量载入: 多子同时换位(联机 restore / 复盘跳多步 / 重开) -> 即时就位不播动画
    const batch = movers.size > 2;
    if (batch) {
      this.root.classList.add('fx-warm');
      requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('fx-warm')));
    }

    // ---- 应用位置与视觉 ----
    for (const { g, p, x, y, moved } of plan) {
      g.classList.remove('fx-captured', 'fx-ghost');
      clearTimeout(g._removeT);
      g.dataset.x = x; g.dataset.y = y;
      // 仅本帧跨格回场节点: transform 由 _enterFromGraveyard 双 rAF 落位(保证滑动可插值);
      // 此后每帧一律正常定位(跨格标记是当帧局部态, 不在节点上滞留)。
      if (!crossReturning.has(g)) {
        const rot = (this.dualView && p.c === 'b') ? ' rotate(180deg)' : '';
        g.style.transform = `translate(${px(x).toFixed(1)}px,${py(y).toFixed(1)}px)${rot}`;
      }
      this._syncVisual(g, p);
      if (moved && !batch && !this._reduced()) this._liftMove(g);
    }

    // ---- 未被绑定的 prev 节点 = 被吃/消失 ----
    const now = Date.now();
    for (const g of prev) {
      if (used.has(g) || g._dead) continue;
      if (batch) { g.remove(); continue; }
      const cx = +g.dataset.x, cy = +g.dataset.y;
      const mv = moves.find(m => m.tx === cx && m.ty === cy);
      let fx = 0, fy = -46;
      if (mv) {
        const dx = cx - mv.fx, dy = cy - mv.fy;
        const len = Math.hypot(dx, dy) || 1;
        fx = (dx / len) * 78; fy = (dy / len) * 78;
      }
      this._graveyard.set(cx + ',' + cy + '|' + g._dk, { born: now });
      g._inner.style.setProperty('--fx-flyx', fx.toFixed(1) + 'px');
      g._inner.style.setProperty('--fx-flyy', fy.toFixed(1) + 'px');
      g.classList.remove('fx-moving', 'fx-land');
      g.classList.add('fx-captured');
      g._dead = true;
      clearTimeout(g._landT);
      clearTimeout(g._removeT);
      g._removeT = setTimeout(() => g.remove(), 300);
    }
    for (const [key, v] of this._graveyard) if (now - v.born > 8000) this._graveyard.delete(key);

    // 首次铺盘: 先无过渡铺好, 再下一帧启用过渡
    if (!this._primed) {
      this.root.classList.add('fx-warm');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.root.classList.remove('fx-warm');
        this._primed = true;
      }));
    }
    // 回合切换/AI 替走/悔棋后, 若残留选中格已无棋子或不属于当前行棋方, 清掉选中态,
    // 否则下一次点击会先按这个失效选中判定落点而被"吞掉"(表现为点了没反应)
    if (this.sel) {
      const [sx, sy] = this.sel;
      const sp = this.state.board[sy] && this.state.board[sy][sx];
      if (!sp || sp.c !== this.state.turn) this.sel = null;
    }
    this.setViewSide(this.viewSide);
    this._drawHints();
  }

  // 新节点: 若近期有被吃登记 -> 从被吃状态反向回场
  //  ① 目标格|dk 精确命中: 原地 fx-ghost 淡入(维持原行为)
  //  ② 未命中: 取同 dk 时间窗内最近一条登记(登记格 gx,gy=真实被吃处) -> 跨格回场:
  //     先置于死亡格 + fx-ghost(极小/透明), reflow 后双 rAF 再滑到目标格并 unghost
  // 返回 true 表示发生了"跨格回场"(本帧定位由内部双 rAF 负责, 调用方本帧跳过直接定位)
  _enterFromGraveyard(g, p, x, y) {
    const dk = g._dk;
    const gk = x + ',' + y + '|' + dk;
    let gv = this._graveyard.get(gk);
    let death = null;
    if (gv) {
      this._graveyard.delete(gk);
    } else if (this._primed) {
      // 同色同类、时间窗内最近一条
      let best = null, bestKey = null, bestBorn = -1;
      for (const [key, v] of this._graveyard) {
        const bar = key.indexOf('|');
        if (key.slice(bar + 1) !== dk) continue;
        if (v.born > bestBorn) { bestBorn = v.born; best = v; bestKey = key; death = key.slice(0, bar).split(',').map(Number); }
      }
      if (best) { this._graveyard.delete(bestKey); gv = best; }
    }
    if (!this._primed || !gv || this._reduced()) return false; // 初盘/减弱: 交给应用循环直接就位
    const rot = (this.dualView && p.c === 'b') ? ' rotate(180deg)' : '';
    if (death) {
      // 跨格回场: 初始帧置于死亡格(极小/透明), 双 rAF 后滑到目标格并落定;
      // 不在节点上保留任何持久"跳过定位"标记(历史 bug: 标记滞留导致该子以后视觉卡死)。
      g.style.transform = `translate(${px(death[0]).toFixed(1)}px,${py(death[1]).toFixed(1)}px)${rot}`;
      g.classList.add('fx-ghost');
      void g.getBoundingClientRect();              // 强制首帧落定死亡格
      const r1 = requestAnimationFrame(() => {
        this._crossRafs.delete(r1);
        const r2 = requestAnimationFrame(() => {
          this._crossRafs.delete(r2);
          // 幽灵态总要解除; 但仅当这两帧内节点未被新 render 移到别处, 才按闭包坐标落位,
          // 避免晚到帧用旧坐标覆盖新局面(历史 bug: 悔棋/重摆后该子视觉错位)。
          g.classList.remove('fx-ghost');
          if (+g.dataset.x === x && +g.dataset.y === y) {
            g.style.transform = `translate(${px(x).toFixed(1)}px,${py(y).toFixed(1)}px)${rot}`;
          }
        });
        this._crossRafs.add(r2);
      });
      this._crossRafs.add(r1);
      return true;
    }
    // 原地回场: 极小/透明淡入回升, 定位仍由应用循环负责
    g.classList.add('fx-ghost');
    void g.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove('fx-ghost')));
    return false;
  }

  _liftMove(g) {
    if (this._reduced()) return;
    g.classList.add('fx-moving');
    clearTimeout(g._landT);
    g._landT = setTimeout(() => {
      g.classList.remove('fx-moving');
      g.classList.add('fx-land');
      setTimeout(() => g.classList.remove('fx-land'), 340);
    }, 280);
  }

  _syncVisual(g, p) {
    const wasHidden = !!g._hidden;
    const nowHidden = !!p.hidden;
    g._c = p.c; g._dk = this._dk(p);
    if (wasHidden && !nowHidden) {
      this._flip(g, p);
    } else {
      g.classList.toggle('dark', nowHidden);
      const txt = g.querySelector('.p-text');
      txt.textContent = nowHidden ? '棋' : (NAMES[p.c][p.t] || '');
    }
    g._hidden = nowHidden;
  }

  _flip(g, p) {
    g.classList.add('flipping');
    setTimeout(() => {
      g.classList.remove('dark');
      g.querySelector('.p-text').textContent = NAMES[p.c][p.t] || '';
      g.querySelector('.p-face').setAttribute('fill', 'url(#pieceFace)');
    }, 170);
    setTimeout(() => g.classList.remove('flipping'), 360);
  }
  _makePiece(p) {
    const g = this.el('g', { class: 'piece' + (p.hidden ? ' dark' : ''), 'data-id': p.id }, this.gPieces);
    g._c = p.c; g._dk = this._dk(p); g._hidden = !!p.hidden;
    const inner = this.el('g', { class: 'fx-inner' }, g);
    g._inner = inner;
    this.el('circle', { class: 'p-shadow', r: R, fill: 'none' }, inner);
    this.el('circle', { class: 'p-face', r: R, fill: p.hidden ? 'url(#pieceDark)' : 'url(#pieceFace)', filter: 'url(#pieceShadow)' }, inner);
    this.el('circle', { class: 'p-ring1', r: R - 1, fill: 'none' }, inner);
    this.el('circle', { class: 'p-ring2', r: R - 7, fill: 'none' }, inner);
    const txt = this.el('text', { class: 'p-text p-' + p.c, x: 0, y: 2 }, inner);
    txt.textContent = p.hidden ? '棋' : NAMES[p.c][p.t] || '';
    return g;
  }
  destroy() {
    clearTimeout(this._checkTimer);
    clearTimeout(this._endTimer);
    for (const id of this._crossRafs) cancelAnimationFrame(id);
    this._crossRafs.clear();
    for (const g of this.gPieces.children) {
      clearTimeout(g._landT);
      clearTimeout(g._removeT);
    }
    this.root.remove();
  }

  // ============================================================
  // 将军 / 绝杀分级特效
  // ============================================================
  // 普通将军边沿触发: 棋盘震动 + 「将军」浮字 + 帅位红圈增强
  _checkFxEdge(side) {
    if (this._reduced()) return;
    this._clearCheckFx();
    this.root.classList.add('fx-shake', 'fx-checkglow');
    const word = document.createElement('div');
    word.className = 'fx-word fx-word-check';
    word.textContent = '将 军';
    this.root.appendChild(word);
    this._checkTimer = setTimeout(() => this._clearCheckFx(), 1100);
  }
  _clearCheckFx() {
    clearTimeout(this._checkTimer);
    this.root.classList.remove('fx-shake', 'fx-checkglow');
    this.root.querySelector('.fx-word-check')?.remove();
  }

  // 清理胜/负方棋子高亮/暗化 与 帅位临时光环
  _clearEndPieceFx() {
    for (const g of this.gPieces.children) g.classList && g.classList.remove('fx-win', 'fx-lose');
    this.root.classList.remove('fx-checkglow');
    this._endRing?.remove(); this._endRing = null;
  }

  // 终局分级特效; 返回建议延迟(ms), 0 表示立即弹窗
  // grade: 'mate'(将死) | 'stalemate'(困毙) | 'draw'(和棋) | 'light'(认输/超时等)
  playEnd(grade) {
    this.root.querySelector('.fx-end')?.remove();
    this._clearEndPieceFx();
    clearTimeout(this._endTimer);
    if (this._reduced() || !grade || grade === 'light') return 0;
    const ov = document.createElement('div');
    ov.className = 'fx-end fx-end-' + grade;
    if (grade === 'mate') {
      const rays = document.createElement('div');
      rays.className = 'fx-rays';
      for (let i = 0; i < 12; i++) {
        const r = document.createElement('i');
        r.style.transform = `rotate(${i * 30}deg)`;
        rays.appendChild(r);
      }
      ov.appendChild(rays);
      const flash = document.createElement('div'); flash.className = 'fx-flash'; ov.appendChild(flash);
      const word = document.createElement('div'); word.className = 'fx-word fx-word-win'; word.textContent = '绝杀'; ov.appendChild(word);
      const cf = document.createElement('div'); cf.className = 'fx-confetti'; ov.appendChild(cf);
      for (let i = 0; i < 12; i++) {
        const c = document.createElement('i');
        c.style.left = (6 + Math.random() * 88) + '%';
        c.style.background = ['#e8a93a', '#c0402e', '#f5d488', '#fff3d0', '#d2281e'][i % 5];
        cf.appendChild(c);
      }
      // 胜方高亮 / 负方暗化; state.turn 为被将死(负)方
      const loser = this.state && this.state.turn;
      if (loser) {
        const winner = loser === 'r' ? 'b' : 'r';
        for (const g of this.gPieces.children) {
          if (!g._c) continue;
          g.classList.add(g._c === loser ? 'fx-lose' : 'fx-win');
        }
        // 负方帅位红色强光环(复用 check-ring + fx-checkglow)
        const kp = this._kingPos(loser);
        if (kp) {
          this._endRing = this.el('circle', { cx: px(kp[0]), cy: py(kp[1]), r: R + 6, class: 'check-ring' }, this.gHints);
          this.root.classList.add('fx-checkglow');
        }
      }
    } else if (grade === 'draw') {
      const word = document.createElement('div'); word.className = 'fx-word fx-word-neutral'; word.textContent = '和棋'; ov.appendChild(word);
    } else if (grade === 'stalemate') {
      const word = document.createElement('div'); word.className = 'fx-word fx-word-stale'; word.textContent = '困毙'; ov.appendChild(word);
    }
    this.root.appendChild(ov);
    const dur = grade === 'mate' ? 1000 : (grade === 'draw' || grade === 'stalemate') ? 750 : 300;
    this._endTimer = setTimeout(() => { ov.remove(); this._clearEndPieceFx(); }, dur + 400);
    return dur;
  }

  // ============================================================
  // 对外动画 API(供 controller 在将军/终局处一行调用; classic 主题自动静默为朴素反馈)
  // ============================================================
  // 走子/悔棋过渡: 棋子滑动与起落由 render() 自动驱动, 这里仅作显式钩子(可空播/补 lift)。
  // 返回建议等待 ms, 0 表示无需等待。
  playMoveAnim(/* from, to */) { return this._reduced() ? 0 : 320; }
  // 将军动画: 棋盘轻震 + 「将军」浮字 + 帅位红圈增强(边沿一次)
  playCheckAnim(side) { if (this._reduced()) return 0; this.setCheck(side); return 1100; }
  // 绝杀/和棋/困毙终局动画: 放射爆发+浮字+礼花(胜)/中性脉冲; 返回建议弹窗延迟 ms
  playMateAnim(grade = 'mate') { return this.playEnd(grade); }
}
