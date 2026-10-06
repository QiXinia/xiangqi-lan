// ============================================================
// 对局统一控制器: 人机 / 局域网对战&观战 / 残局闯关 / 自由练习
// ============================================================
import { createState, applyMove, undoMoves, serialize, isInCheck } from './engine.js';
import { BoardView } from './board-view.js';
import { sfx, vibrate, soundEnabled } from './audio.js';
import { modal, toast, sheet, confirmBox, closeModal, h } from './ui.js';
import { store } from './storage.js';
import { TIME_RULES } from './room.js';

// ---------- AI Worker 单例 ----------
let _w = null, _req = 0;
// 工厂(单文件打包时此字面量被替换为 Blob 内联 worker); 复盘分析页据此另建独立 worker
export function createAiWorker() {
  return new Worker('js/ai.worker.js', { type: 'module' });
}
function worker() {
  if (!_w) _w = createAiWorker();
  return _w;
}
function aiCall(snapshot, level, hint = false, deadlineMs = 4000, style = 'balance', extra = {}) {
  return new Promise(resolve => {
    const w = worker(), id = ++_req, token = ++aiCall.tok;
    let settled = false;
    // 超时兜底: worker 内部按 deadlineMs 限时计算并回包; 此处再留一段往返余量。
    // 一旦 worker 异常(卡死/未回包)也绝不永久 pending —— 否则 _schedulePuzzleAi 会把
    // aiBusy 永远锁死, 后续所有「提示」在守卫处静默 return, 表现为"点了没反应/卡死"。
    const timer = setTimeout(() => done(null), deadlineMs + 2500);
    function done(val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.removeEventListener('message', on);
      resolve(val);
    }
    const on = (e) => {
      if (e.data.reqId !== id) return;
      if (token !== aiCall.tok) { done(null); return; } // 已被更新的请求取代, 丢弃过期着法
      done(e.data.ok ? e.data.mv : null);
    };
    w.addEventListener('message', on);
    w.postMessage({ reqId: id, snapshot, level, hint, deadlineMs, style, ...extra });
  });
}
aiCall.tok = 0;

const REASON_TEXT = {
  checkmate: '将死', stalemate: '困毙(无棋可走, 困毙判负)', perpetual: '长将判负',
  repetition: '三次重复局面, 和棋', nocapture: '连续40回合无吃子, 和棋',
  timeout: '超时判负', resign: '认输', offline: '断线超时判负', agreement: '双方和棋'
};
const fmtTime = (ms) => {
  if (ms == null) return '--:--';
  ms = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(ms / 60), s = ms % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
};

export class GameSession {
  // opts: mode, cfg{jieqi,time,aiLevel,humanSide,puzzle}, onExit
  constructor(opts) {
    this.opts = opts;
    this.mode = opts.mode;
    this.cfg = opts.cfg || {};
    this.mySide = this.cfg.humanSide || 'r';
    this.room = null;
    this.ended = false;
    this.aiBusy = false;
    this.aiToken = 0;
    this.chatList = [];
    this.oppPerm = null;
    this.timers = [];
  }

  mount(container) {
    this.container = container;
    if (this.mode === 'lan') {
      this.state = this.room.state;
    } else if (this.cfg.puzzle) {
      this.state = createState({ fen: this.cfg.puzzle.fen });
    } else {
      this.state = createState({ jieqi: !!this.cfg.jieqi });
    }
    this._buildDom();
    this.dualLocal = this.mode === 'local';
    this.board = new BoardView(this.bhost, {
      viewSide: this.dualLocal ? 'r' : (this.mySide === 'spec' ? 'r' : this.mySide),
      dualView: this.dualLocal,
      jieqi: !!this.cfg.jieqi,
      interactive: this.mySide !== 'spec' && !(this.dualLocal && this.cfg.passConfirm),
      onMove: (f, t) => this.onBoardMove(f, t)
    });
    this.board.setState(this.state);
    this._startClock();
    if (this.mode === 'ai' && this.state.turn !== this.mySide) this._scheduleAi();
    if (this.mode === 'puzzle' && this.state.turn !== this.mySide) this._schedulePuzzleAi();
    this._render();
    // 同台对坐: 开局先显示红方全屏交接提示
    if (this.dualLocal && this.cfg.passConfirm) this._passHandset();
  }

  _name(side) {
    if (this.mode === 'ai') return side === this.mySide ? (this.cfg.myName || '我') : (this.cfg.aiEngine === 'pro' ? '增强AI · ' : '象棋AI · ') + ['', '入门', '业余', '进阶', '强软', '大师'][this.cfg.aiLevel || 3];
    if (this.mode === 'puzzle') {
      const pz = this.cfg.puzzle;
      if (side === this.mySide) return '我(' + (side === 'r' ? '红' : '黑') + ')';
      if (pz.type === 'draw') return '定式 · 红方(攻)';
      return '残局 · 黑方';
    }
    if (this.mode === 'free' || this.mode === 'local') return side === 'r' ? '红方' : '黑方';
    if (side === this.mySide) return this.cfg.myName || '我';
    if (this.opts.oppName) return this.opts.oppName;
    return side === 'r' ? (this.room.hostName || '红方') : this._guestName();
  }
  _guestName() {
    const p = this.room && this.room.peers ? [...this.room.peers.values()].find(p => p.role === 'b') : null;
    return p ? p.name : '黑方';
  }

  _buildDom() {
    this.container.innerHTML = '';
    const wrap = h('div', { class: 'game-wrap' + (this.mode === 'local' ? ' dual-local' : '') });
    const bar = (id, side) => h('div', { class: 'player-bar', id }, [
      h('div', { class: 'avatar ' + side }, side === 'r' ? '帅' : '将'),
      h('div', { class: 'p-info' }, [
        h('div', { class: 'p-name', id: id + '-name' }, this._name(side)),
        h('div', { class: 'captured-tray', id: id + '-tray' })
      ]),
      h('div', { class: 'clock', id: id + '-clock' }, '--:--')
    ]);
    const oppSide = this.mySide === 'r' ? 'b' : 'r';
    wrap.appendChild(bar('bar-top', this.mySide === 'spec' ? 'b' : oppSide));
    this.bhost = h('div', { class: 'board-host' });
    wrap.appendChild(h('div', { class: 'board-area' }, this.bhost));
    wrap.appendChild(bar('bar-bottom', this.mySide === 'spec' ? 'r' : this.mySide));
    // 操作栏
    const acts = h('div', { class: 'action-bar' });
    const addAct = (icon, text, fn, cls) => {
      const b = h('button', { class: 'act ' + (cls || ''), onclick: fn }, [h('div', { class: 'act-ic' }, icon), h('span', {}, text)]);
      acts.appendChild(b);
    };
    if (this.mode === 'lan' && this.mySide !== 'spec') {
      addAct('悔', '悔棋', () => this._reqUndo());
      addAct('和', '求和', () => this._reqDraw());
      addAct('降', '认输', () => this._resign(), 'danger');
      addAct('聊', '聊天', () => this._openChat());
      addAct('谱', '棋谱', () => this._openMoves());
    } else if (this.mySide === 'spec') {
      addAct('聊', '聊天', () => this._openChat());
      addAct('转', '翻转视角', () => this._flipView());
      addAct('谱', '棋谱', () => this._openMoves());
      addAct('退', '退出观战', () => this.opts.onExit && this.opts.onExit());
    } else if (this.mode === 'puzzle') {
      addAct('悔', '重摆', () => this._undoLocal());
      addAct('示', '提示', () => this._hint());
      addAct('谱', '棋谱', () => this._openMoves());
      addAct('退', '退出', () => this.opts.onExit && this.opts.onExit(), 'danger');
    } else if (this.mode === 'free') {
      addAct('悔', '悔棋', () => this._undoLocal());
      addAct('转', '翻转视角', () => this._flipView());
      addAct('谱', '棋谱', () => this._openMoves());
      addAct('退', '退出', () => this.opts.onExit && this.opts.onExit(), 'danger');
    } else if (this.mode === 'local') {
      // 同台对坐: 红/黑各一组工具按钮, 分列棋盘两头(红组在底部朝红、黑组在顶部旋转180°朝黑),
      // 仅当前行棋方那组可点, 避免对手隔着棋盘误触。
      acts.classList.add('side-r'); this.actR = acts;
      const actsB = h('div', { class: 'action-bar side-b' }); this.actB = actsB;
      const fillDual = (box) => {
        const da = (icon, text, fn, cls) => {
          box.appendChild(h('button', { class: 'act ' + (cls || ''), onclick: fn }, [h('div', { class: 'act-ic' }, icon), h('span', {}, text)]));
        };
        da('悔', '悔棋', () => this._undoLocal());
        da('交', '交接', () => this._passHandset());
        da('和', '和棋', () => confirmBox({
          title: '双方同意和棋？', body: '确认后本局作和。', okText: '确认和棋', cancelText: '继续对局',
          onOk: () => this.finish('draw', 'agreement')
        }));
        da('降', '认输', () => this._resign(), 'danger');
        da('谱', '棋谱', () => this._openMoves());
        da('退', '退出', () => this.opts.onExit && this.opts.onExit(), 'danger');
      };
      fillDual(acts); fillDual(actsB);
      wrap.insertBefore(actsB, wrap.querySelector('.board-area'));
    } else {
      addAct('悔', '悔棋', () => this._undoLocal());
      addAct('示', '提示', () => this._hint());
      addAct('和', '求和', () => this.finish('draw', 'agreement'));
      addAct('降', '认输', () => this._resign(), 'danger');
      addAct('谱', '棋谱', () => this._openMoves());
    }
    wrap.appendChild(acts);
    // 电脑端宽屏三栏: 常驻回合信息条 + 走子记录容器。窄屏由 CSS 强制 display:none,
    // 不参与移动端纵向栈布局(节点为新增, 不影响既有 DOM 顺序)。
    this.turnInfo = h('div', { class: 'turn-info' });
    wrap.appendChild(this.turnInfo);
    this.moveLog = h('div', { class: 'move-log' });
    wrap.appendChild(this.moveLog);
    this.container.appendChild(wrap);
    this.banner = h('div', { class: 'peek-banner', style: 'display:none' });
    wrap.insertBefore(this.banner, this.bhost.parentElement);
  }

  // ---------------- 走子 ----------------
  onBoardMove(from, to) {
    if (this.ended) return;
    if (this.passing) return;
    if (this.mode === 'lan') {
      const r = this.roomHost ? this.room.localMove(from, to) : this.room.localMove(from, to);
      if (r.illegal) toast('不符合规则的走法');
      if (r.pending) toast('暗子揭示中…', 700);
      return;
    }
    this._doLocal(from, to);
  }
  _doLocal(from, to, opts = {}) {
    const m = applyMove(this.state, from, to, opts);
    this._afterMoveSfx(m);
    this._settleLocalClock(this.state.turn === 'r' ? 'b' : 'r'); // 刚走完的一方
    this._render();
    if (this.state.status !== 'playing') { this.finish(this.state.status, this.state.reason); return; }
    this._ruleNotice();
    if (this.mode === 'puzzle' && this.cfg.puzzle.type === 'draw' &&
      this.state.moves.length >= (this.cfg.puzzle.drawMoves || 80)) {
      this.finish(null, 'puzzle-draw-ok'); return;
    }
    if (this.mode === 'ai' && this.state.turn !== this.mySide) this._scheduleAi();
    if (this.mode === 'puzzle' && this.state.turn !== this.mySide) this._schedulePuzzleAi();
    if (this.mode === 'local' && this.state.status === 'playing') this._passHandset();
  }
  // 同台对坐: 全屏交接遮罩(不透明防偷看), 内容按行棋方朝向旋转(黑方在手机上侧)
  _passHandset() {
    if (this.ended || this.state.status !== 'playing') return;
    const side = this.state.turn;
    this.passing = true;
    this.board.setInteractive(false);
    this._updateSideActions(); // 交接遮罩期间两组工具都锁定, 露出遮罩防误触
    const go = () => {
      this._hidePassMask();
      this.board.clearMoveLock && this.board.clearMoveLock(); // 交接完成, 放行新行棋方的首步
      this.board.setInteractive(true);
      this.passing = false;
      this._render();
    };
    if (!this.cfg.passConfirm) { toast('请' + (side === 'r' ? '红' : '黑') + '方行棋'); go(); return; }
    this._hidePassMask();
    const isR = side === 'r';
    const card = h('div', { class: 'pass-card' + (isR ? '' : ' pass-flip') }, [
      h('div', { class: 'pass-avatar ' + side }, isR ? '帅' : '将'),
      h('div', { class: 'pass-title' }, (isR ? '红方' : '黑方') + '行棋'),
      h('div', { class: 'pass-sub' }, '手机平放桌面中间, 无需转动'),
      h('div', { class: 'pass-tap' }, '点击屏幕开始走子')
    ]);
    const mask = h('div', { class: 'pass-mask pass-' + side, onclick: () => { sfx.tap(); go(); } }, card);
    this.passMask = mask;
    this.container.appendChild(mask);
  }
  _hidePassMask() {
    if (this.passMask) { this.passMask.remove(); this.passMask = null; }
  }
  // 循环走子规则边界: 同一局面第 2 次出现时预警。
  // 真人对战(局域网/同台)只提醒双方主动变招(长将方须变招, 否则三次重复判负; 否则三次重复判和);
  // 人机/残局也预告判和, 第 3 次由引擎统一终局(人机弹和棋、残局弹和棋可重摆)。
  _ruleNotice() {
    const w = this.state && this.state.repWarn;
    if (!w || this.state.status !== 'playing') return;
    const key = this.state.moves.length + ':' + (w.perpetualSide || 'draw');
    if (this._lastRepKey === key) return; // 同一循环到达预警只提示一次
    this._lastRepKey = key;
    const human = this.mode === 'lan' || this.mode === 'local';
    if (w.perpetualSide) {
      const name = w.perpetualSide === 'r' ? '红方' : '黑方';
      toast(`${name}连续将军(长将), 须立即变招, 否则第三次重复判${name}负`);
    } else {
      toast(human ? '局面正在重复, 请主动变招; 第三次重复将判和' : '局面重复, 若继续不变, 第三次重复将判和');
    }
  }
  _afterMoveSfx(m) {
    if (!soundEnabled()) return;
    if (m.reveal) setTimeout(() => sfx.flip(), 160);
    if (m.captured) sfx.capture(); else sfx.move();
    if (m.check) setTimeout(() => sfx.check(), 120);
    vibrate(m.captured ? 25 : 10);
  }
  async _scheduleAi() {
    if (this.aiBusy || this.ended) return;
    this.aiBusy = true;
    const token = ++this.aiToken;
    this._setSub('ai', 'AI 思考中…');
    this._syncInteractive(); // 立即锁定, 不必等 worker 返回
    const mv = await aiCall(serialize(this.state), this.cfg.aiLevel || 3, false, 4500, this.cfg.aiStyle || 'balance', {
      seed: this.state.seed, ply: this.state.moves.length, engine: this.cfg.aiEngine === 'pro' ? 'pro' : 'classic'
    });
    this.aiBusy = false;
    if (token !== this.aiToken || this.ended || !mv) { this._setSub('ai', ''); this._syncInteractive(); return; }
    this._setSub('ai', '');
    if (this.state.status === 'playing' && this.state.turn !== this.mySide) this._doLocal(mv.from, mv.to);
    else this._syncInteractive();
  }
  async _schedulePuzzleAi() {
    const pz = this.cfg.puzzle;
    this.aiBusy = true;
    const token = ++this.aiToken;
    this._setSub('ai', 'AI 思考中…');
    this._syncInteractive();
    // 守和演练中 AI 为攻方, 用更强等级; 杀局/例胜用 3 级
    const lv = pz.type === 'draw' ? 5 : 3;
    const mv = await aiCall(serialize(this.state), lv, false, lv === 5 ? 4500 : 3000, 'balance', {
      seed: this.state.seed, ply: this.state.moves.length
    });
    this.aiBusy = false;
    this._setSub('ai', '');
    if (token !== this.aiToken || this.ended || !mv) { this._syncInteractive(); return; }
    if (this.state.status === 'playing' && this.state.turn !== this.mySide) {
      this._doLocal(mv.from, mv.to);
      if (this.state.status !== 'playing') return;
      if (!pz.type) {
        // 杀局: 红方用手数超限判定(红方固定为人类)
        const redMoves = Math.ceil(this.state.moves.length / 2);
        if (redMoves >= pz.mate) this._puzzleFail();
      }
    }
    this._syncInteractive();
  }
  async _hint() {
    if (this.ended || this.aiBusy) return;
    if (this.mode === 'lan') { toast('联机对局不提供提示'); return; }
    if (this.mode === 'puzzle' && this.state.turn !== this.mySide) return;
    if (this.mode === 'ai' && this.state.turn !== this.mySide) return;
    toast('计算中…', 800);
    const startMoves = this.state.moves.length;
    const startTurn = this.state.turn;
    // 杀局残局(无 type 字段、带 mate): 提示走"精确强制杀"路径(离线解面/强制杀求解),
    // 保证逐手照提示能在 mate 手内成杀; 其余(人机/定式)沿用大师启发式提示。
    const pz0 = this.mode === 'puzzle' ? this.cfg.puzzle : null;
    const useExact = !!(pz0 && !pz0.type && pz0.mate);
    let mv;
    if (useExact) {
      mv = await aiCall(serialize(this.state), 5, true, 6000, 'balance', {
        puzzleHint: true, puzzleId: pz0.id, mateTarget: pz0.mate, attacker: this.mySide || 'r'
      });
    } else {
      mv = await aiCall(serialize(this.state), 5, true, 3000);
    }
    // 计算期间玩家可能已手动走子/局面已推进: 丢弃这份"过期局面"的着法,
    // 否则会用旧起点/落点强行设置选中态, 干扰随后的选子与落子(点不动/走错)。
    if (this.ended || this.state.moves.length !== startMoves ||
      this.state.turn !== startTurn || this.state.turn !== this.mySide) return;
    // 局面未变但 worker 未给出着法(无解/超时): 明确提示, 不再静默"点了没反应"。
    if (!mv) { toast('暂未算出提示，请自行思考'); return; }
    this.board.showHintsFromAI(mv.from, mv.to); sfx.tap();
  }

  // ---------------- 悔棋/求和/认输 ----------------
  _undoLocal() {
    // 悔棋会把局面恢复为行棋中, 任何待发的终局结算弹窗都应撤销(将死后立即悔棋不再误弹"你输了")
    clearTimeout(this._fxT); this._fxT = null;
    this._lastRepKey = null;
    if (this.aiBusy) { this.aiToken++; this.aiBusy = false; }
    if (this.mode === 'local') {
      const n = Math.min(1, this.state.moves.length);
      if (!n) return;
      undoMoves(this.state, n);
      this.ended = false; this.state.status = 'playing'; this.state.reason = '';
      this.passing = false;
      closeModal();
      this._hidePassMask();
      this._render();
      sfx.tap();
      // 对坐模式悔棋后重新交接给该方
      if (this.cfg.passConfirm) this._passHandset();
      else this.board.setInteractive(true);
      return;
    }
    let n = 1;
    if (this.mode === 'puzzle') n = this.state.turn === this.mySide ? Math.min(2, this.state.moves.length) : 1;
    else if (this.mode === 'ai') n = this.state.turn === this.mySide ? 2 : 1;
    n = Math.min(n, this.state.moves.length);
    if (!n) return;
    undoMoves(this.state, n);
    this.ended = false; this.state.status = 'playing'; this.state.reason = '';
    closeModal();
    this._render();
    sfx.tap();
  }
  _reqUndo() {
    if (this.roomHost) this.room.localUndoReq(); else this.room.undoReq();
    toast('已发送悔棋请求');
  }
  _reqDraw() {
    if (this.roomHost) this.room.localDrawReq(); else this.room.drawReq();
    toast('已发送和棋请求');
  }
  _resign() {
    if (this.mode === 'local') {
      modal({
        title: '认输', body: '请选择认输方：',
        buttons: [
          { text: '红方认输（黑方胜）', cls: 'btn-ghost', onClick: () => this.finish('blackwin', 'resign') },
          { text: '黑方认输（红方胜）', cls: 'btn-ghost', onClick: () => this.finish('redwin', 'resign') },
          { text: '取消', cls: 'btn-primary' }
        ]
      });
      return;
    }
    confirmBox({
      title: '确认认输？', body: '认输后本局判负。', okText: '认输', okCls: 'btn-primary',
      onOk: () => { if (this.mode === 'lan') { if (this.roomHost) this.room.localResign(); else this.room.resign(); } else this.finish(this.mySide === 'r' ? 'blackwin' : 'redwin', 'resign'); }
    });
  }
  _puzzleFail() {
    this.finish(null, 'puzzle-fail');
  }
  _flipView() {
    this.board.setViewSide(this.board.viewSide === 'r' ? 'b' : 'r');
  }

  // ---------------- 棋谱 / 聊天 ----------------
  _openMoves() {
    const body = h('div', { class: 'moves-grid' });
    const mv = this.state.moves;
    if (!mv.length) body.appendChild(h('div', { class: 'muted' }, '尚无着法'));
    for (let i = 0; i < mv.length; i += 2) {
      body.appendChild(h('div', { class: 'move-chip' + (i >= mv.length - 2 ? ' last' : '') }, [
        h('b', {}, String(i / 2 + 1) + '.'), mv[i].notation,
        mv[i + 1] ? ' ' + mv[i + 1].notation : ''
      ]));
    }
    sheet({ title: '棋谱' + (this.state.reason ? '（' + (REASON_TEXT[this.state.reason] || this.state.reason) + '）' : ''), bodyEl: body });
  }
  _openChat() {
    const body = h('div', {}, [h('div', { class: 'chat-body', id: 'chat-list' })]);
    const render = () => {
      const list = body.querySelector('#chat-list');
      list.innerHTML = '';
      if (!this.chatList.length) list.appendChild(h('div', { class: 'muted', style: 'text-align:center;padding:18px' }, '暂无消息，观战时也可以聊天'));
      for (const c of this.chatList) {
        const me = c.role === this.mySide || c.name === this.cfg.myName;
        list.appendChild(h('div', { class: 'bubble ' + (me ? 'me' : 'them') }, [
          me ? null : h('div', { class: 'b-name' }, c.name + (c.role === 'spec' ? ' · 观战' : '')),
          h('div', {}, c.text)
        ]));
      }
      list.scrollTop = list.scrollHeight;
    };
    this._renderChat = render; render();
    const input = h('input', { class: 'input', placeholder: '说点什么…', maxlength: 80 });
    const send = () => {
      const t = input.value.trim(); if (!t) return;
      this.room.sendChat(t);
      this._pushChat({ name: this.cfg.myName || '我', role: this.mySide, text: t, ts: Date.now() });
      input.value = '';
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    body.appendChild(h('div', { class: 'chat-input' }, [input, h('button', { class: 'btn btn-primary', onclick: send }, '发送')]));
    sheet({ title: '对局聊天', bodyEl: body });
  }
  _pushChat(c) {
    this.chatList.push(c);
    if (this._renderChat) this._renderChat();
  }

  // ---------------- 联机房间绑定 ----------------
  attachLan(room, isHost, oppName) {
    this.room = room; this.roomHost = isHost; this.opts.oppName = oppName;
    if (isHost) this.mySide = 'r';
    else if (room.seat) this.mySide = room.seat;
    room.onEvent(ev => this._onRoomEvent(ev));
    // 联机时钟: host 权威 tick; guest 本地平滑倒计时
    this._lanTimer = setInterval(() => {
      if (this.ended || !this.state) return;
      if (isHost && room.tick) room.tick(Date.now());
      this._syncLanClock();
      if (this._renderClock) this._renderClock();
      document.getElementById('bar-bottom')?.classList.toggle('active', this.state.status === 'playing' && this.state.turn === this.mySide);
      document.getElementById('bar-top')?.classList.toggle('active', this.state.status === 'playing' && this.state.turn !== this.mySide);
    }, 300);
    this.timers.push(this._lanTimer);
  }
  _onRoomEvent(ev) {
    switch (ev.type) {
      case 'startGame':
        this.state = this.room.state; this.board.setState(this.state); this._render(); break;
      case 'snapshot':
        this.state = this.room.state; this.board.setState(this.state); this._syncLanClock(); this._render();
        this._ruleNotice(); break;
      case 'move': {
        this.state = this.room.state;
        const m = ev.move;
        this._afterMoveSfx(m);
        this.board.setLastMove(m);
        this.board.setState(this.state);
        this._syncLanClock();
        this._render();
        this._ruleNotice();
        break;
      }
      case 'undo':
        this.state = this.room.state; this.board.setState(this.state); this._render(); toast('已悔棋'); break;
      case 'undoPending':
        confirmBox({
          title: '悔棋请求', body: (ev.name || '对手') + ' 请求悔棋, 是否同意？',
          okText: '同意', cancelText: '拒绝',
          onOk: () => { if (this.roomHost) this.room.replyUndo(true); else this.room.replyUndo(true); },
          onCancel: () => { if (this.roomHost) this.room.replyUndo(false); else this.room.replyUndo(false); }
        });
        break;
      case 'undoReply': toast(ev.agree ? '对方同意悔棋' : '对方拒绝了悔棋'); break;
      case 'undoDeclined': toast('对方拒绝了悔棋'); break;
      case 'drawPending':
        confirmBox({
          title: '和棋请求', body: (ev.name || '对手') + ' 请求和棋, 是否同意？',
          okText: '同意和棋', cancelText: '拒绝',
          onOk: () => { if (this.roomHost) this.room.replyDraw(true); else this.room.replyDraw(true); },
          onCancel: () => { if (this.roomHost) this.room.replyDraw(false); else this.room.replyDraw(false); }
        });
        break;
      case 'drawReply': toast(ev.agree ? '对方同意和棋' : '对方拒绝了和棋'); break;
      case 'drawDeclined': toast('对方拒绝和棋'); break;
      case 'end':
        this._lanFinalReveal(ev);
        this.finish(ev.status, ev.reason, ev);
        break;
      case 'revealAll':
        // host 收到 guest 公开的红方排列
        this.oppPerm = ev; break;
      case 'chat': this._pushChat(ev); break;
      case 'peerOffline':
        this.banner.style.display = '';
        this.banner.textContent = ev.name + ' 断线, 90 秒内重扫房间二维码可回到对局';
        toast(ev.name + ' 断线'); break;
      case 'peerBack':
        this.banner.style.display = 'none'; toast(ev.name + ' 已重新连接'); break;
      case 'specIn': toast(ev.name + ' 进入观战'); break;
      case 'closed':
        modal({ title: '房间已解散', body: '房主离开了对局。', buttons: [{ text: '返回大厅', cls: 'btn-primary', onClick: () => this.opts.onExit && this.opts.onExit() }] });
        break;
      case 'illegalMove': toast('走法被房主拒绝'); break;
    }
  }
  _lanFinalReveal(ev) {
    // 终局揭示全部暗子(结算展示)
    if (!this.cfg.jieqi) return;
    try {
      if (!this.roomHost && ev.revealHost && ev.hostValid && this.room.permOpp) {
        const perms = { r: this.room.mySide === 'b' ? this.room.permOpp : ev.revealHost.perm, b: ev.revealHost.perm };
        const all = createState({ jieqi: true, perms });
        for (const m of this.state.moves) applyMove(all, m.from, m.to, { revealT: m.reveal ? m.reveal.t : null });
        all.status = this.state.status; all.reason = this.state.reason;
        this.state = all; this.board.setState(all);
      } else if (this.roomHost && this.room.permB) {
        // host 稍等 guest 的 revealAll 消息(事件异步), 0.6s 后尽力重建; 存句柄以便退出时取消
        clearTimeout(this._revealT);
        this._revealT = setTimeout(() => {
          this._revealT = null;
          if (this._destroyed || !this.room) return;
          const permR = this.oppPerm && this.oppPerm.perm;
          const perms = { r: permR || this.room.state.initialPerms.r, b: this.room.permB };
          try {
            const all = createState({ jieqi: true, perms });
            for (const m of this.state.moves) applyMove(all, m.from, m.to, { revealT: m.reveal ? m.reveal.t : null });
            this.board.setState(all);
          } catch (e) { }
        }, 700);
      }
    } catch (e) { }
  }

  // ---------------- 时钟 ----------------
  _startClock() {
    const rule = TIME_RULES[this.cfg.time];
    if (!rule || !rule.base) { this._clk = null; return; }
    this._clk = { r: { remain: rule.base * 1000, phase: 'base' }, b: { remain: rule.base * 1000, phase: 'base' }, rule, lastTs: Date.now() };
    this._clockTimer = setInterval(() => {
      if (this.ended || this.mode === 'lan') return;
      const now = Date.now(), side = this.state.turn, c = this._clk[side];
      if (c.phase === 'byo') {
        const left = c.remain - (now - this._clk.lastTs);
        if (left <= 0) { this.finish(side === 'r' ? 'blackwin' : 'redwin', 'timeout'); return; }
        c.remain = left; this._clk.lastTs = now;
      } else {
        const left = c.remain - (now - this._clk.lastTs);
        this._clk.lastTs = now;
        if (left <= 0) {
          if (rule.byo) { c.phase = 'byo'; c.remain = rule.byo * 1000; }
          else { c.remain = 0; this.finish(side === 'r' ? 'blackwin' : 'redwin', 'timeout'); return; }
        } else c.remain = left;
      }
      this._renderClock();
    }, 300);
    this.timers.push(this._clockTimer);
  }
  _settleLocalClock(side) {
    if (!this._clk) return;
    const now = Date.now(), c = this._clk[side], rule = this._clk.rule;
    const elapsed = now - this._clk.lastTs; this._clk.lastTs = now;
    if (c.phase === 'byo') { c.remain = rule.byo * 1000; return; }
    c.remain -= elapsed;
    if (rule.inc) c.remain += rule.inc * 1000;
    if (c.remain <= 0 && rule.byo) { c.phase = 'byo'; c.remain = rule.byo * 1000; }
  }
  _syncLanClock() { this._clockSync = Date.now(); }
  _currentClockView() {
    if (this.mode === 'lan') {
      if (!this.room.clock) return null;
      if (this.roomHost) return this.room.clockView();
      const view = JSON.parse(JSON.stringify(this.room.clock));
      if (this._clockSync && this.state.status === 'playing') {
        view[this.state.turn].remain -= (Date.now() - this._clockSync);
      }
      return view;
    }
    return this._clk;
  }

  // ---------------- 渲染 ----------------
  _setSub(who, text) {
    const el = document.getElementById(who === 'ai' ? 'bar-top-name' : 'bar-bottom-name');
    if (el) { if (!el.dataset.base) el.dataset.base = el.textContent; el.textContent = text || el.dataset.base; }
  }
  _render() {
    if (!this.board) return;
    this.board.setState(this.state);
    if (this.state.status === 'playing') this.board.setCheck(isInCheck(this.state, this.state.turn) ? this.state.turn : null);
    // 同台双人: 底部条始终为当前视角方(随交接翻转交换); 其他模式底部为己方
    const viewSide = this.mode === 'local' ? this.board.viewSide : (this.mySide === 'spec' ? 'r' : this.mySide);
    const topSide = viewSide === 'r' ? 'b' : 'r';
    this._applyBar('bar-bottom', viewSide, this.state.turn === viewSide && !this.ended);
    this._applyBar('bar-top', topSide, this.state.turn === topSide && !this.ended);
    this._renderClock();
    // 常驻走子记录(窄屏容器 display:none, 调用本身无副作用)
    this._renderMoveList && this._renderMoveList();
    this._syncInteractive();
    this._updateSideActions();
  }
  // 同台对坐: 仅当前行棋方一侧的工具组可用, 另一侧锁定(防对手误触); 交接/终局时两组都锁
  _updateSideActions() {
    if (!this.actR || !this.actB) return;
    const turn = (this.state && this.state.status === 'playing' && !this.passing && !this.ended) ? this.state.turn : null;
    this.actR.classList.toggle('is-locked', turn !== 'r');
    this.actB.classList.toggle('is-locked', turn !== 'b');
  }
  // 统一棋盘可交互状态: 仅当轮到本地下棋方、且不在结束/交接/AI 思考时才接受点击。
  // 修复人机/残局里 AI 思考回合仍可点选甚至替 AI 走子、以及思考期误触造成的"点不动"。
  _syncInteractive() {
    if (!this.board) return;
    let on;
    if (this.ended || this.passing) on = false;
    else if (this.mySide === 'spec') on = false;
    else if (this.mode === 'local' || this.mode === 'free') on = true; // 同台双人, 交接遮罩(passing)另管
    else if (this.aiBusy) on = false;
    else on = this.state.status === 'playing' && this.state.turn === this.mySide;
    // 交互"锁定 -> 可操作"的上升沿(AI/对方走完、悔棋回到己方、交接完成):
    // 清掉上一行棋方遗留的 320ms 落子动画锁, 否则快速应招后本回合开头点击会被吞
    if (on && this._lastInteractive === false) this.board.clearMoveLock && this.board.clearMoveLock();
    this._lastInteractive = on;
    this.board.setInteractive(on);
  }
  // 常驻走子记录 + 回合/行棋方信息条(仅桌面端可见; 窄屏由 CSS 隐藏)
  _renderMoveList() {
    if (!this.moveLog) return;
    const mv = this.state.moves || [];
    if (this.turnInfo) {
      const round = Math.floor(mv.length / 2) + 1;
      const sideTxt = this.state.status === 'playing'
        ? (this.state.turn === 'r' ? '红方行棋' : '黑方行棋')
        : '对局结束';
      this.turnInfo.textContent = '第 ' + round + ' 回合 · ' + sideTxt;
    }
    this.moveLog.innerHTML = '';
    if (!mv.length) {
      this.moveLog.appendChild(h('div', { class: 'move-log-empty' }, '尚未走子'));
      return;
    }
    for (let i = 0; i < mv.length; i += 2) {
      const isLast = i + 1 >= mv.length;
      this.moveLog.appendChild(h('div', { class: 'ml-row' + (isLast ? ' last' : '') }, [
        h('span', { class: 'ml-no' }, String(i / 2 + 1)),
        h('span', { class: 'ml-mv ml-r' }, mv[i].notation || ''),
        h('span', { class: 'ml-mv' }, mv[i + 1] ? (mv[i + 1].notation || '') : '')
      ]));
    }
    // 新增着法后自动滚动到底部(最新一手可见)
    this.moveLog.scrollTop = this.moveLog.scrollHeight;
  }
  _applyBar(barId, side, active) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    const av = bar.querySelector('.avatar');
    av.className = 'avatar ' + side;
    av.textContent = side === 'r' ? '帅' : '将';
    const nm = document.getElementById(barId + '-name');
    if (nm) nm.textContent = this._name(side);
    this._fillTray(barId, this.state.captured[side] || []);
    bar.classList.toggle('active', !!active);
  }
  _fillTray(barId, list) {
    const tray = document.getElementById(barId + '-tray');
    if (!tray) return;
    tray.innerHTML = '';
    const N = { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' };
    for (const c of list) {
      const span = document.createElement('span');
      span.className = 'cp' + (c.hidden ? ' unk' : '');
      span.textContent = c.hidden ? '棋' : (N[c.t] || c.t);
      tray.appendChild(span);
    }
  }
  _renderClock() {
    const view = this._currentClockView();
    const set = (barId, side) => {
      const el = document.getElementById(barId + '-clock');
      if (!el) return;
      if (!view) { el.style.display = 'none'; return; }
      el.style.display = '';
      const c = view[side];
      el.textContent = (c.phase === 'byo' ? '读秒 ' : '') + fmtTime(c.remain);
      el.classList.toggle('low', c.remain <= 30000 && view.rule.base);
    };
    const viewSide = this.mode === 'local' ? this.board.viewSide : (this.mySide === 'spec' ? 'r' : this.mySide);
    set('bar-bottom', viewSide); set('bar-top', viewSide === 'r' ? 'b' : 'r');
  }

  // ---------------- 终局 ----------------
  finish(status, reason, ev) {
    if (this.ended && reason !== 'puzzle-fail') return;
    this.ended = true;
    this.aiToken++;
    this.passing = false;
    this._hidePassMask();
    this.board && this.board.setInteractive(false);
    // 残局/定式判定
    if (this.mode === 'puzzle') {
      const pz = this.cfg.puzzle;
      if (!pz.type) {
        // 连将杀局: 限步将死
        if (reason === 'puzzle-fail' || status === 'blackwin') return this._puzzleModal(false);
        if (status === 'redwin') {
          const redMoves = Math.ceil(this.state.moves.length / 2);
          const ok = redMoves <= pz.mate;
          if (ok) { store.setPuzzleResult(pz.id, redMoves); sfx.win(); return this._puzzleModal(true, redMoves); }
          return this._puzzleModal(false, redMoves);
        }
        // 杀局中循环反复/无吃子作和: 不算过关, 弹和棋框引导主动进攻并重摆(原为静默 return 导致卡死)
        if (status === 'draw') return this._puzzleModal('mate-draw');
        return;
      }
      if (pz.type === 'win') {
        // 例胜定式: 用户执红, 将死/困毙黑方即过关
        if (status === 'redwin') {
          const redMoves = Math.ceil(this.state.moves.length / 2);
          store.setPuzzleResult(pz.id, redMoves); sfx.win(); return this._puzzleModal(true, redMoves);
        }
        if (status === 'blackwin') return this._puzzleModal(false);
        // 重复作和等: 未分胜负, 提示继续演练
        return this._puzzleModal('undecided');
      }
      // 例和定式: 用户执黑守, 红胜=失败; 黑胜/和棋/守满手数=守和成功
      if (reason === 'puzzle-draw-ok' || status === 'blackwin' || status === 'draw') {
        store.setPuzzleResult(pz.id, Math.ceil(this.state.moves.length / 2)); sfx.win();
        return this._puzzleModal(true, Math.ceil(this.state.moves.length / 2));
      }
      if (status === 'redwin') return this._puzzleModal(false);
      return;
    }
    // 同台双人: 无"我方"概念, 按红/黑方结算并存战绩
    if (this.mode === 'local') return this._localFinish(status, reason);
    const draw = status === 'draw';
    const iWin = !draw && ((status === 'redwin' && this.mySide === 'r') || (status === 'blackwin' && this.mySide === 'b'));
    if (this.mySide !== 'spec') {
      if (draw) sfx.draw(); else iWin ? sfx.win() : sfx.lose();
    }
    // 存战绩(未走任何棋即认输/结束时不入库, 避免污染战绩列表)
    if (this.mode !== 'free' && this.mySide !== 'spec' && this.state.moves.length > 0) {
      store.saveRecord({
        mode: this.mode === 'ai' ? '人机对弈' : '局域网对战',
        result: draw ? '和棋' : (iWin ? '胜' : '负'),
        reason, jieqi: !!this.cfg.jieqi, time: this.cfg.time || 'none',
        aiLevel: this.cfg.aiLevel || null,
        moves: this.state.moves.map(m => ({ from: m.from, to: m.to, notation: m.notation, reveal: m.reveal })),
        fen: this.state.initialFen, seed: this.state.seed
      });
    }
    const seal = draw ? { cls: 'seal-draw', text: '和' } : { cls: iWin ? 'seal-win' : 'seal-lose', text: draw ? '和' : (iWin ? '胜' : '负') };
    const isLan = this.mode === 'lan';
    // 先播放棋盘终局特效, 再延迟弹出结果层; 战绩/音效已同步执行不受影响
    this._fxThen(this._endGrade(status, reason), () => modal({
      seal,
      title: draw ? '和棋' : (iWin ? '你赢了' : (this.mySide === 'spec' ? '对局结束' : '你输了')),
      body: REASON_TEXT[reason] || reason || '',
      buttons: [
        this.mode === 'ai' ? { text: '再来一局', cls: 'btn-primary', onClick: () => this.opts.onRestart && this.opts.onRestart() } : null,
        isLan ? { text: '棋谱复盘', cls: 'btn-ghost', onClick: () => this._openMoves() } : { text: '查看棋谱', cls: 'btn-ghost', onClick: () => this._openMoves() },
        isLan ? { text: '返回大厅(重新建房)', cls: 'btn-ghost', onClick: () => this.opts.onExit && this.opts.onExit() }
          : { text: '返回大厅', cls: 'btn-ghost', onClick: () => this.opts.onExit && this.opts.onExit() }
      ].filter(Boolean)
    }));
  }
  _localFinish(status, reason) {
    this.ended = true;
    this.aiToken++;
    this.passing = false;
    const draw = status === 'draw';
    if (draw) sfx.draw(); else sfx.win();
    // 未走任何棋即结束时不存战绩(终局特效/弹窗仍照常)
    if (this.state.moves.length > 0) {
      store.saveRecord({
        mode: '同台对弈',
        result: draw ? '和棋' : (status === 'redwin' ? '红胜' : '黑胜'),
        reason, jieqi: !!this.cfg.jieqi, time: this.cfg.time || 'none',
        aiLevel: null,
        moves: this.state.moves.map(m => ({ from: m.from, to: m.to, notation: m.notation, reveal: m.reveal })),
        fen: this.state.initialFen, seed: this.state.seed
      });
    }
    const seal = draw ? { cls: 'seal-draw', text: '和' }
      : (status === 'redwin' ? { cls: 'seal-win', text: '红' } : { cls: 'seal-lose', text: '黑' });
    this._fxThen(this._endGrade(status, reason), () => modal({
      seal,
      title: draw ? '和棋' : (status === 'redwin' ? '红方获胜' : '黑方获胜'),
      body: REASON_TEXT[reason] || reason || '',
      buttons: [
        { text: '再来一局', cls: 'btn-primary', onClick: () => this.opts.onRestart && this.opts.onRestart() },
        { text: '查看棋谱', cls: 'btn-ghost', onClick: () => this._openMoves() },
        { text: '返回大厅', cls: 'btn-ghost', onClick: () => this.opts.onExit && this.opts.onExit() }
      ]
    }));
  }
  _puzzleModal(win, redMoves) {
    const pz = this.cfg.puzzle;
    if (win === 'undecided' || win === 'mate-draw') {
      const isMate = win === 'mate-draw';
      this._fxThen('draw', () => modal({
        seal: { cls: 'seal-draw', text: '和' },
        title: isMate ? '循环作和, 尚未成杀' : '尚未分出胜负',
        body: isMate
          ? '双方来回重复走子被判和棋，杀局需要你主动运子、连续进攻成杀。可重摆再试，或参考「提示」走精确杀着。'
          : '双方重复走子作和，例胜定式需要你主动运子破防。可重摆继续演练。',
        buttons: [
          { text: '重摆演练', cls: 'btn-primary', onClick: () => this.opts.onRestart && this.opts.onRestart() },
          { text: '返回列表', cls: 'btn-ghost', onClick: () => this.opts.onExit && this.opts.onExit() }
        ]
      }));
      return;
    }
    let title, body;
    if (!pz.type) {
      title = win ? '恭喜过关' : '未在 ' + pz.mate + ' 步内将死';
      body = win ? `用 ${redMoves} 步完成「${pz.name}」(目标 ${pz.mate} 步)` : '黑方已能化解, 再想想关键的第一手。';
    } else if (pz.type === 'win') {
      title = win ? '定式演练成功' : '进攻失败';
      body = win ? `以 ${redMoves} 个回合完成「${pz.name}」，例胜定式已掌握。` : '黑方化解了攻势，参考提示再试一次。';
    } else {
      title = win ? '守和成功' : '防线被突破';
      body = win ? `坚守 ${redMoves} 个回合未负，「${pz.name}」守和要领已掌握。` : '红方找到了突破口，按提示保持联防正位再守一次。';
    }
    this._fxThen(win ? 'mate' : 'light', () => modal({
      seal: win ? { cls: 'seal-win', text: '过' } : { cls: 'seal-lose', text: '憾' },
      title, body,
      buttons: [
        win ? { text: '下一关', cls: 'btn-primary', onClick: () => this.opts.onNextPuzzle && this.opts.onNextPuzzle() } : null,
        { text: win ? '重玩本关' : '重新尝试', cls: win ? 'btn-ghost' : 'btn-primary', onClick: () => this.opts.onRestart && this.opts.onRestart() },
        { text: '返回列表', cls: 'btn-ghost', onClick: () => this.opts.onExit && this.opts.onExit() }
      ].filter(Boolean)
    }));
  }

  // 终局特效分级: 将死=庆祝爆发, 困毙/和棋=中性, 认输/超时/长将=克制收尾
  _endGrade(status, reason) {
    if (status === 'draw') return 'draw';
    if (!status) return 'light';
    if (reason === 'checkmate') return 'mate';
    if (reason === 'stalemate') return 'stalemate';
    return 'light';
  }
  // 先触发棋盘特效, 特效时长后再执行原弹窗; 不支持/减弱动效时立即执行
  _fxThen(grade, fn) {
    let d = 0;
    try { if (this.board && this.board.playEnd) d = this.board.playEnd(grade) || 0; } catch (e) { d = 0; }
    if (!d) { fn(); return; }
    // 保存句柄: 特效窗口期内若悔棋(ended 复位)或退出会话(_destroyed), 到点不再弹无关结算框
    clearTimeout(this._fxT);
    this._fxT = setTimeout(() => {
      this._fxT = null;
      if (this._destroyed || !this.ended) return;
      fn();
    }, d);
  }

  destroy() {
    this._destroyed = true;
    clearInterval(this._clockTimer);
    clearInterval(this._lanTimer);
    clearTimeout(this._fxT);
    clearTimeout(this._revealT);
    // 兜底: 清空所有登记过的 interval/timeout, 防止重启/退出路径漏清导致空转累积
    (this.timers || []).forEach(t => { clearInterval(t); clearTimeout(t); });
    this.timers = [];
    this.aiToken++;
    // 联机房间: 摘除事件回调并置 dead, 使本端主动 close 后的异步 onClose 不再弹"房间已解散"
    if (this.room && typeof this.room.destroy === 'function') { try { this.room.destroy(); } catch (e) { } }
    this._hidePassMask();
    if (this.board) this.board.destroy();
    if (this.container) this.container.innerHTML = '';
  }
}
