// ============================================================
// 局域网象棋 —— 单页应用入口(栈导航路由/大厅/对局/残局/复盘/设置)
// ============================================================
import { createState, applyMove } from './engine.js';
import { PUZZLES } from './puzzles.js';
import { OPENINGS, OPENING_CATEGORIES } from './openings.js';
import { playLine } from './notation.js';
import { BoardView } from './board-view.js';
import { GameSession } from './game-controller.js';
import { hostPairFlow, guestPairFlow } from './pair.js';
import { modal, toast, h, closeModal, closeSheet, navBar } from './ui.js';
import { store } from './storage.js';
import { setSoundEnabled, soundEnabled, sfx } from './audio.js';
import { analyzeRecord, GRADE_META, scoreText } from './analyze.js';
import { XQExportText, XQCopyText, XQShareText } from './xq-exporter.js';

const $ = (id) => document.getElementById(id);
let currentSession = null;

// 界面版本(表现层): 在 <html> 上设 data-theme=new|classic, CSS 变量即时切换。
// 与棋盘配色(body[data-theme=wood/jade/ink])作用于不同元素, 互不干扰; 默认 new。
function applyUiTheme(ui) {
  document.documentElement.dataset.theme = ui === 'classic' ? 'classic' : 'new';
}
function currentUiTheme() {
  return store.settings().uiTheme === 'classic' ? 'classic' : 'new';
}

// 打谱/复盘(screen-review)自动播放定时器与 AI 分析任务的模块级句柄, 供切页/重进统一清理,
// 避免旧页面的 setInterval / Worker 在后台空转或在已脱离的 DOM 上写结果。
let reviewPlayTimer = null;
function clearReviewPlayTimer() {
  if (reviewPlayTimer !== null) { clearInterval(reviewPlayTimer); reviewPlayTimer = null; }
}
function setReviewPlayTimer(fn, ms) { clearReviewPlayTimer(); reviewPlayTimer = setInterval(fn, ms); }
let currentAnalysisJob = null;
function clearCurrentAnalysisJob() {
  if (currentAnalysisJob) { try { currentAnalysisJob.cancel && currentAnalysisJob.cancel(); } catch (e) { } currentAnalysisJob = null; }
}
// 复盘页代际令牌: 每次进入复盘页自增, 异步分析回调仅在代际匹配时写 UI/toast
let reviewSeq = 0;
// 新开/重开/下一关/切换模式前, 显式销毁上一局会话(重启路径不走 route, 否则旧棋钟区间会空转累积)
function disposeCurrentSession() {
  if (currentSession) { try { currentSession.destroy(); } catch (e) { } currentSession = null; }
}

// ---------------- 栈导航(push/pop 滑栈) ----------------
let navStack = [];
const NAV_MS = 330;
function show(id) {
  const all = document.querySelectorAll('.screen');
  const cur = navStack[navStack.length - 1];
  const toEl = document.getElementById(id);
  if (cur === id) { // 同一屏复用(如 人机/建房/加入 共用 setup), 做淡入
    toEl.classList.remove('nav-fade'); void toEl.offsetWidth;
    toEl.classList.add('nav-fade');
    setTimeout(() => toEl.classList.remove('nav-fade'), 240);
    toEl.scrollTop = 0;
    return;
  }
  const fromEl = cur && document.getElementById(cur);
  const backAt = navStack.lastIndexOf(id);
  const dir = backAt >= 0 ? 'back' : 'fwd';
  if (backAt >= 0) navStack.length = backAt + 1; else navStack.push(id);

  all.forEach(s => s.classList.remove('active', 'nav-fade', 'nav-enter-fwd', 'nav-enter-back', 'nav-leave-fwd', 'nav-leave-back'));
  toEl.classList.add('active');
  toEl.scrollTop = 0;
  if (fromEl) {
    toEl.classList.add(dir === 'fwd' ? 'nav-enter-fwd' : 'nav-enter-back');
    fromEl.classList.add('active', dir === 'fwd' ? 'nav-leave-fwd' : 'nav-leave-back');
    setTimeout(() => {
      fromEl.classList.remove('active', 'nav-leave-fwd', 'nav-leave-back');
      toEl.classList.remove('nav-enter-fwd', 'nav-enter-back');
    }, NAV_MS);
  }
}
function go(hash) {
  // 残局列表与对局共用 hash(#/puzzles): 对局内退出时 hash 未变, 需手动重路由
  if (location.hash === hash) { route(); } else { location.hash = hash; }
}

// 旧会话在转场动画结束后再销毁(避免滑出中的棋盘被提前清空)
function route() {
  document.body.dataset.theme = store.settings().theme || 'wood';
  applyUiTheme(currentUiTheme());
  const hash = location.hash || '#/home';
  const oldSession = currentSession; currentSession = null;
  const oldPairCleanup = window._xqPairCleanup; window._xqPairCleanup = null;
  closeModal(); closeSheet();
  // 离开任意页面: 停止打谱/复盘自动播放与后台 AI 分析, 使旧复盘异步回调失效
  clearReviewPlayTimer(); clearCurrentAnalysisJob(); reviewSeq++;
  if (oldSession) setTimeout(() => { try { oldSession.destroy(); } catch (e) { } }, NAV_MS + 20);
  if (oldPairCleanup) setTimeout(() => { try { oldPairCleanup(); } catch (e) { } }, NAV_MS + 20);

  if (hash === '#/home') return renderHome();
  if (hash === '#/ai') return renderSetupAI();
  if (hash === '#/local') return renderSetupLocal();
  if (hash === '#/host') return renderSetupHost();
  if (hash === '#/join') return renderSetupJoin();
  if (hash === '#/puzzles') return renderPuzzles();
  if (hash === '#/library') return renderLibrary();
  if (hash.startsWith('#/opening')) return renderOpening(hash.split('/')[2]);
  if (hash === '#/records') return renderRecords();
  if (hash.startsWith('#/review')) return renderReview(hash.split('/')[2]);
  if (hash === '#/settings') return renderSettings();
  if (hash === '#/pair-host' || hash === '#/pair-guest' || hash === '#/game') {
    if (hash !== '#/game') show('screen-pair');
    return; // 由流程函数填充
  }
  return renderHome();
}
window.addEventListener('hashchange', route);

function topbar(title, back = '#/home', extra, backLabel = '大厅') {
  return navBar({ title, extra, onBack: back ? () => go(back) : null, backLabel: back ? backLabel : '' });
}

// ---------------- 大厅 ----------------
function renderHome() {
  show('screen-home');
  const root = $('screen-home');
  root.innerHTML = '';
  root.append(
    h('div', { class: 'home-hero' }, [
      h('div', { class: 'home-badge' }, '帥'),
      h('h1', {}, '局域网象棋'),
      h('p', {}, '好友近场对战 · 观战 · 揭棋 · 残局闯关'),
      h('div', { class: 'home-status' }, [
        h('span', { class: 'dot-live' }),
        h('span', {}, '纯 P2P 局域网直连 · 数据不经互联网')
      ])
    ]),
    h('div', { class: 'menu' }, [
      menuItem('mi-red', '战', '局域网对战', '建房邀请好友, 或扫码加入 / 观战', () => go('#/host')),
      menuItem('mi-teal', '对', '同台双人', '手机平放中间, 棋子各朝己方, 全屏交接', () => go('#/local')),
      menuItem('mi-brown', '机', '人机对弈', '五级棋力 · 经典/揭棋 · 可计时', () => go('#/ai')),
      menuItem('mi-green', '局', '残局定式', PUZZLES.length + ' 关 · 连将杀与例胜/守和定式', () => go('#/puzzles')),
      menuItem('mi-purple', '谱', '棋谱库', OPENINGS.length + ' 套主流开局定式, 分类打谱推演', () => go('#/library')),
      menuItem('mi-blue', '复', '复盘战绩', '本地保存的对局棋谱, 逐步复盘', () => go('#/records')),
      menuItem('mi-gray', '设', '设置', '音效 · 棋盘主题 · 昵称 · 关于', () => go('#/settings'))
    ]),
    h('div', { class: 'home-foot' },
      '联机方式: WebRTC 局域网直连(无 STUN/TURN), 数据不经过互联网。受浏览器能力限制, 近场发现以「两轮扫码配对」实现; 打开过一次后可离线使用。')
  );
}
function menuItem(iconCls, icon, t, d, fn) {
  return h('button', { class: 'menu-item', onclick: () => { sfx.tap(); fn(); } }, [
    h('div', { class: 'mi-icon ' + iconCls }, icon),
    h('div', { class: 'mi-body' }, [h('div', { class: 'mi-t' }, t), h('div', { class: 'mi-d' }, d)]),
    h('div', { class: 'mi-go' }, '›')
  ]);
}

// ---------------- 通用设置段 ----------------
function segControl(options, initial, onPick, extraCls = '') {
  const seg = h('div', { class: 'seg ' + extraCls });
  options.forEach(o => {
    const b = h('button', { class: o.value === initial ? 'on' : '', onclick: () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); onPick(o.value);
    } }, o.label);
    seg.appendChild(b);
  });
  return seg;
}
// 表单页骨架: 固定导航 + 可滚动表单 + 底部固定主按钮
function setupSkeleton(title, onBack, scrollContent, ctaText, onCta) {
  show('screen-setup');
  const root = $('screen-setup'); root.innerHTML = '';
  const cta = h('button', { class: 'btn btn-primary btn-block', onclick: onCta }, ctaText);
  const scroll = h('div', { class: 'page-body', style: 'flex:1;min-height:0;overflow-y:auto' }, scrollContent);
  root.append(topbar(title, onBack), scroll, h('div', { class: 'cta-bar', style: 'background:linear-gradient(180deg,rgba(246,239,226,0),var(--paper) 30%)' }, cta));
  return { root, cta };
}
function fieldLabel(no, text) {
  return h('div', { class: 'field-label' }, [no ? h('span', { class: 'fl-no' }, String(no)) : null, text]);
}

// ---------------- 人机设置 ----------------
function renderSetupAI() {
  const s = store.settings();
  const cfg = { aiLevel: s.aiLevel || 3, humanSide: 'r', jieqi: false, time: s.time || '10', aiStyle: s.aiStyle || 'balance', aiEngine: s.aiEngine === 'pro' ? 'pro' : 'classic' };
  const body = [
    h('div', { class: 'card' }, [
      h('h3', {}, [h('span', { class: 'h3-ic' }, '难'), '棋力与规则']),
      fieldLabel(1, '难度'),
      segControl([
        { label: '入门', value: 1 }, { label: '业余', value: 2 }, { label: '进阶', value: 3 }, { label: '强软', value: 4 }, { label: '大师', value: 5 }
      ], cfg.aiLevel, v => cfg.aiLevel = v),
      fieldLabel(2, '我执'),
      segControl([{ label: '红方(先手)', value: 'r' }, { label: '黑方(后手)', value: 'b' }], 'r', v => cfg.humanSide = v),
      fieldLabel(3, '玩法'),
      segControl([{ label: '经典象棋', value: false }, { label: '揭棋', value: true }], false, v => cfg.jieqi = v),
      fieldLabel(4, '计时'),
      timeSeg(cfg),
      fieldLabel(5, '棋风'),
      segControl([
        { label: '均衡', value: 'balance' }, { label: '进攻', value: 'attack' }, { label: '稳健', value: 'solid' }
      ], cfg.aiStyle, v => cfg.aiStyle = v),
      fieldLabel(6, '引擎'),
      segControl([
        { label: '经典引擎', value: 'classic' }, { label: '激进引擎', value: 'pro' }
      ], cfg.aiEngine, v => cfg.aiEngine = v)
    ]),
    h('div', { class: 'card' }, [
      h('h3', {}, [h('span', { class: 'h3-ic' }, '说'), '玩法说明']),
      h('div', { class: 'muted' }, '进攻棋风积极压境、敢于弃子搏杀; 稳健棋风偏重防守与子力联防; 均衡兼顾攻守。引擎: 经典引擎稳健全面, 为成熟稳定的 alpha-beta 搜索; 激进引擎对攻积极、攻杀锐利, 残局攻杀强, 中局偶有漏防, 适合喜好搏杀的棋手(融入策略先验、多维分阶段局面评估与选择性加深等思想, 棋风更主动, 但不代表综合更强); 两者均离线运行、可随时切换。揭棋: 暗子按原位棋子走法走第一步, 落地翻开; 翻开后的士/象可过河。')
    ])
  ];
  setupSkeleton('人机对弈', '#/home', body, '开始对弈', () => {
    store.saveSettings({ aiLevel: cfg.aiLevel, aiStyle: cfg.aiStyle, aiEngine: cfg.aiEngine });
    startAi(cfg);
  });
}
function timeSeg(cfg) {
  return segControl([
    { label: '不限时', value: 'none' }, { label: '10分钟', value: '10' }, { label: '5分钟', value: '5' },
    { label: '20分钟', value: '20' }, { label: '10+3秒', value: '10+3' }, { label: '10+30读秒', value: '10+30s' }
  ], cfg.time, v => cfg.time = v, 'cols3');
}
function startAi(cfg) {
  disposeCurrentSession();
  show('screen-game');
  const root = $('screen-game');
  currentSession = new GameSession({
    mode: 'ai', cfg: { ...cfg, myName: store.settings().name || '我' },
    onExit: () => go('#/home'),
    onRestart: () => startAi(cfg)
  });
  currentSession.mount(root);
}

// ---------------- 同台双人设置 ----------------
function renderSetupLocal() {
  const cfg = { jieqi: false, time: '10+3', passConfirm: true };
  const pass = h('input', { type: 'checkbox', checked: true, onchange: e => cfg.passConfirm = e.target.checked });
  const body = [
    h('div', { class: 'card' }, [
      h('h3', {}, [h('span', { class: 'h3-ic' }, '对'), '对局规则']),
      fieldLabel(1, '玩法'),
      segControl([{ label: '经典象棋', value: false }, { label: '揭棋', value: true }], false, v => cfg.jieqi = v),
      fieldLabel(2, '计时'),
      timeSeg(cfg)
    ]),
    h('div', { class: 'section-title' }, '交接方式'),
    h('div', { class: 'group' }, [
      h('div', { class: 'set-row' }, [
        h('div', {}, [h('div', {}, '每步全屏交接'), h('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' }, '走完一步全屏提示交给对方, 朝向自动对准行棋方, 并防止偷看思路')]),
        h('label', { class: 'switch' }, [pass, h('span', { class: 'sl' })])
      ])
    ]),
    h('div', { class: 'card' }, [
      h('h3', {}, [h('span', { class: 'h3-ic' }, '说'), '对坐玩法']),
      h('div', { class: 'muted' }, '将手机平放在两人之间的桌面上, 无需转动手机或调整位置: 红方坐下方、黑方坐上方, 双方棋子与河界文字各自朝向自己, 如同真实棋盘。每步后出现朝向自己的全屏交接提示, 点击即可走子。支持悔棋、协商和棋、认输与对局计时。')
    ])
  ];
  setupSkeleton('同台双人', '#/home', body, '开始对局', () => startLocal(cfg));
}
function startLocal(cfg) {
  disposeCurrentSession();
  show('screen-game');
  const root = $('screen-game');
  currentSession = new GameSession({
    mode: 'local', cfg: { ...cfg },
    onExit: () => go('#/home'),
    onRestart: () => startLocal(cfg)
  });
  currentSession.mount(root);
}

// ---------------- 建房 / 加入 ----------------
function renderSetupHost() {
  const s = store.settings();
  const cfg = { jieqi: false, time: '10+3' };
  const body = [
    h('div', { class: 'card' }, [
      h('h3', {}, [h('span', { class: 'h3-ic' }, '房'), '房间设置(房主执红)']),
      fieldLabel(1, '玩法'),
      segControl([{ label: '经典象棋', value: false }, { label: '揭棋', value: true }], false, v => cfg.jieqi = v),
      fieldLabel(2, '计时'),
      timeSeg(cfg),
      fieldLabel(3, '你的昵称'),
      h('input', { class: 'input', id: 'host-name', value: s.name || '棋友', maxlength: 12 })
    ]),
    h('div', { class: 'group' }, [
      h('button', { class: 'list-row', onclick: () => go('#/join') }, [
        h('div', { style: 'flex:1' }, [
          h('div', { style: 'font-weight:700;font-size:14.5px' }, '加入已有房间'),
          h('div', { class: 'muted', style: 'margin-top:2px' }, '扫描好友屏幕上的房间二维码')
        ]),
        h('span', { class: 'lr-chevron' }, '›')
      ])
    ]),
    h('div', { class: 'hint-box' }, '双方须连接同一局域网(同一 WiFi / 热点)。连接为浏览器之间直连, 不经过任何对局服务器。')
  ];
  setupSkeleton('创建对局房间', '#/home', body, '生成邀请二维码', () => {
    const name = $('host-name').value.trim() || '房主';
    store.saveSettings({ name });
    go('#/pair-host');
    setTimeout(() => hostPairFlow($('screen-pair'), {
      name, cfg,
      onEnter: (room, info) => enterLan(room, true, cfg, info.oppName),
      onBack: () => go('#/home')
    }), 60);
  });
}
function renderSetupJoin() {
  const s = store.settings();
  let want = 'play';
  const body = [
    h('div', { class: 'card' }, [
      h('h3', {}, [h('span', { class: 'h3-ic' }, '入'), '加入方式']),
      fieldLabel(1, '身份'),
      segControl([{ label: '加入对战(执黑)', value: 'play' }, { label: '旁观棋局', value: 'watch' }], 'play', v => want = v),
      fieldLabel(2, '你的昵称'),
      h('input', { class: 'input', id: 'join-name', value: s.name || '棋友', maxlength: 12 })
    ]),
    h('div', { class: 'hint-box' }, '摄像头权限仅用于扫码, 画面不会被录制或上传。')
  ];
  setupSkeleton('加入对局', '#/home', body, '扫描房主二维码', () => {
    const name = $('join-name').value.trim() || '棋友';
    store.saveSettings({ name });
    go('#/pair-guest');
    setTimeout(() => guestPairFlow($('screen-pair'), {
      name, want,
      onEnter: (room, info) => enterLan(room, false, info.cfg, info.hostName, info.seat),
      onBack: () => go('#/home')
    }), 60);
  });
}
function enterLan(room, isHost, cfg, oppName, seat) {
  disposeCurrentSession();
  show('screen-game');
  const root = $('screen-game');
  const session = new GameSession({
    mode: 'lan', cfg: { ...cfg, myName: store.settings().name || '棋友' },
    onExit: () => go('#/home')
  });
  if (!isHost && seat) session.mySide = seat;
  session.attachLan(room, isHost, oppName);
  session.mount(root);
  currentSession = session;
}

// ---------------- 残局 ----------------
const PUZZLE_CHAPTERS = [
  { id: 'mate1', title: '一步杀', desc: '红先, 一招制胜 · 覆盖马后炮、闷宫、铁门栓、大胆穿心、白脸将等常用杀形', test: p => p.chapter === 'mate1' },
  { id: 'mate2', title: '两步杀', desc: '红先, 两到功成 · 先弃后取、抽将选位, 体会强制杀的次序', test: p => p.chapter === 'mate2' },
  { id: 'mate3', title: '三步杀', desc: '红先, 三步逼宫 · 招招先手, 考验三回合算度', test: p => p.chapter === 'mate3' },
  { id: 'mate4', title: '四步杀', desc: '红先四步成杀, 多为招招不离将的连将杀, 黑方最顽强应着下仍无解', test: p => p.chapter === 'mate4' },
  { id: 'mate5p', title: '五至七步深层杀', desc: '长线强制杀, 含连将攻杀与弃子控位的缓手 · 大师级算度考验', test: p => p.chapter === 'mate5p' },
  { id: 'classic', title: '古谱名局', desc: '《适情雅趣》《橘中秘》《韬略元机》《梅花谱》名局精选 · 百余局三至五步精巧连杀', test: p => p.chapter === 'classic' },
  { id: 'endgame-win', title: '实用残局 · 例胜', desc: '你执胜方(红), 不限步数, 按定式要领取胜', test: p => p.chapter === 'endgame' && p.type === 'win' },
  { id: 'endgame-draw', title: '实用残局 · 守和', desc: '你执弱方(黑)防守, 坚守 40 回合不败即和', test: p => p.chapter === 'endgame' && p.type === 'draw' }
];
function pzTag(pz, done) {
  if (done) return '已通关 · ' + done.bestMoves + '回合';
  if (pz.type === 'win') return '例胜 · 红先';
  if (pz.type === 'draw') return '守和 · 执黑';
  return pz.mate + '步杀';
}
function renderPuzzles() {
  show('screen-puzzles');
  const root = $('screen-puzzles'); root.innerHTML = '';
  const prog = store.puzzleProgress();
  const doneCount = PUZZLES.filter(p => prog[p.id]).length;
  const pct = Math.round(doneCount / PUZZLES.length * 100);

  const summary = h('div', { class: 'pz-summary' }, [
    h('div', { class: 'ps-row' }, [
      h('span', { class: 'ps-num' }, String(doneCount)),
      h('span', { class: 'ps-total' }, '/ ' + PUZZLES.length + ' 关已破解'),
      h('span', { class: 'ps-pct' }, pct + '%')
    ]),
    h('div', { class: 'ps-bar' }, h('div', { class: 'ps-fill', style: 'width:' + pct + '%' })),
    h('div', { class: 'ps-sub' }, '杀局由引擎穷举验证为强制将死; 例胜/守和定式经大师级 AI 对弈核验')
  ]);

  const chapters = PUZZLE_CHAPTERS.map(ch => ({ ch, list: PUZZLES.filter(ch.test) })).filter(x => x.list.length);
  const chips = h('div', { class: 'chapter-chips' },
    chapters.map(({ ch, list }) => {
      const d = list.filter(p => prog[p.id]).length;
      return h('button', { class: 'chapter-chip', onclick: () => $('ch-' + ch.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
        [ch.title, h('span', { class: 'cc-done' }, d + '/' + list.length)]);
    }));

  const body = h('div', { class: 'page-body' });
  chapters.forEach(({ ch, list }) => {
    const d = list.filter(p => prog[p.id]).length;
    const grid = h('div', { class: 'puzzle-grid' });
    list.forEach(pz => {
      const i = PUZZLES.indexOf(pz);
      const done = prog[pz.id];
      grid.appendChild(h('button', { class: 'puzzle-cell' + (done ? ' done' : ''), onclick: () => startPuzzle(i) }, [
        h('span', { class: 'pz-check' }, '✓'),
        h('div', { class: 'pz-no' }, String(pz.id).padStart(2, '0')),
        h('div', { class: 'pz-name' }, pz.name),
        h('div', { class: 'pz-stars' }, pzTag(pz, done))
      ]));
    });
    body.appendChild(h('div', { class: 'chapter-head', id: 'ch-' + ch.id }, [
      h('div', { style: 'flex:1;min-width:0' }, [
        h('div', { style: 'display:flex;align-items:baseline;gap:8px' }, [
          h('span', { class: 'chapter-title' }, ch.title),
          h('span', { class: 'chapter-count' }, list.length + ' 局 · 已破 ' + d)
        ]),
        h('div', { class: 'chapter-desc' }, ch.desc)
      ])
    ]));
    body.appendChild(grid);
  });
  root.append(topbar('残局定式', '#/home'), summary, chips, body);
}
function startPuzzle(index) {
  const pz = PUZZLES[index];
  if (!pz) return go('#/puzzles');
  disposeCurrentSession();
  show('screen-game');
  const root = $('screen-game');
  const humanSide = pz.humanSide || 'r';
  const session = new GameSession({
    mode: 'puzzle',
    cfg: { puzzle: pz, humanSide, time: 'none', myName: store.settings().name || '我' },
    onExit: () => go('#/puzzles'),
    onRestart: () => startPuzzle(index),
    onNextPuzzle: () => startPuzzle(index + 1)
  });
  currentSession = session;
  session.mount(root);
  // 关卡信息条
  const goal = !pz.type ? `红先 · ${pz.mate} 步杀` : (pz.type === 'win' ? '例胜定式 · 你执红, 将死黑方' : '守和定式 · 你执黑, 坚守 40 回合');
  const bar = h('div', { class: 'hint-box', style: 'margin:8px 10px 2px' },
    `第 ${pz.id} 关「${pz.name}」 · ${goal}　|　${pz.hint}`);
  root.querySelector('.game-wrap').insertBefore(bar, root.querySelector('.board-area'));
}

// ---------------- 棋谱库 ----------------
function renderLibrary() {
  show('screen-library');
  const root = $('screen-library'); root.innerHTML = '';
  const body = h('div', { class: 'page-body' }, [
    h('div', { class: 'hint-box' }, '主流开局覆盖当头炮、屏风马、顺炮、列炮、反宫马、单提马、仙人指路、飞相、过宫炮、起马、士角炮等体系; 另录《橘中秘》《梅花谱》等古谱全局, 以及七星聚会等江湖排局·名局鉴赏。全部着法均经规则引擎逐步校验。')
  ]);
  OPENING_CATEGORIES.forEach(cat => {
    const ops = OPENINGS.filter(o => o.cat === cat.id);
    if (!ops.length) return;
    body.appendChild(h('div', { class: 'section-title' }, [
      cat.name, h('span', { class: 'st-count' }, ops.length + ' 套')
    ]));
    const g = h('div', { class: 'group' });
    ops.forEach((o) => {
      g.appendChild(h('button', { class: 'list-row', onclick: () => go('#/opening/' + o.id) }, [
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { style: 'font-weight:700;font-size:15px' }, o.name),
          h('div', { class: 'muted', style: 'margin-top:3px' },
            [h('span', { class: 'tag tag-purple' }, o.family), ` ${Math.ceil(o.moves.length / 2)} 回合主干 · ${o.moves.length} 手`])
        ]),
        h('span', { class: 'lr-chevron' }, '›')
      ]));
    });
    body.appendChild(g);
  });
  root.append(topbar('棋谱库 · 开局定式', '#/home'), body);
}
function renderOpening(opId) {
  show('screen-review');
  const root = $('screen-review'); root.innerHTML = '';
  const op = OPENINGS.find(o => o.id === opId);
  if (!op) { root.append(topbar('棋谱', '#/library'), h('div', { class: 'card muted' }, '棋谱不存在')); return; }
  // 古谱全局从初始满盘摆开; 江湖排局·名局鉴赏从自定义残局 FEN 摆开
  const sim = op.fen ? createState({ fen: op.fen }) : createState();
  const res = playLine(sim, op.moves);
  const coords = res.moves.map(m => ({ from: m.from, to: m.to, notation: m.notation }));
  let step = 0;
  const host = h('div', {});
  const info = h('div', { class: 'review-info', id: 'rv-info' });
  const boardHost = h('div', { class: 'review-board-wrap' }, h('div', { class: 'board-host' }, host));
  const moveStrip = h('div', { class: 'move-strip', id: 'rv-strip' });
  const bar = h('div', { class: 'review-ctl' });
  root.append(topbar(op.name, '#/library', null, '棋谱'),
    h('div', { class: 'page-body', style: 'padding:6px 0 0;flex:1;min-height:0;overflow-y:auto' }, [
      h('div', { class: 'card', style: 'margin:6px 14px 4px' }, [
        h('div', { style: 'margin-bottom:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center' }, [
          h('span', { class: 'tag tag-purple' }, op.family),
          op.result ? h('span', { class: 'tag tag-blue' }, op.result) : null
        ]),
        h('div', { class: 'muted' }, op.intro)
      ]),
      info, boardHost, moveStrip
    ]),
    bar);
  const ctl = (txt, fn, cls) => h('button', { class: 'ctl-btn ' + (cls || ''), onclick: fn }, txt);
  bar.append(
    ctl('⏮', () => gotoStep(0)), ctl('‹', () => gotoStep(step - 1)),
    ctl('自动', () => togglePlay(), 'ctl-play'),
    ctl('›', () => gotoStep(step + 1)), ctl('⏭', () => gotoStep(coords.length))
  );
  const board = new BoardView(host, { viewSide: 'r', interactive: false, onMove() { } });
  function rebuild(n) {
    const s = op.fen ? createState({ fen: op.fen }) : createState();
    for (let i = 0; i < n; i++) applyMove(s, coords[i].from, coords[i].to);
    return s;
  }
  function renderStrip() {
    moveStrip.innerHTML = '';
    moveStrip.appendChild(h('button', { class: 'move-pill' + (step === 0 ? ' on' : ''), onclick: () => gotoStep(0) }, '开局'));
    coords.forEach((m, i) => {
      const isRed = i % 2 === 0;
      const pill = h('button', { class: 'move-pill ' + (isRed ? 'move-r' : 'move-b') + (step === i + 1 ? ' on' : ''), onclick: () => gotoStep(i + 1) },
        (isRed ? Math.floor(i / 2) + 1 + '. ' : '') + m.notation);
      moveStrip.appendChild(pill);
    });
  }
  function gotoStep(n) {
    step = Math.max(0, Math.min(coords.length, n));
    const s = rebuild(step);
    board.setState(s);
    const cur = coords[step - 1];
    board.setLastMove(cur ? { from: cur.from, to: cur.to } : null);
    info.textContent = `第 ${Math.ceil(step / 2)} 回合 · ${step}/${coords.length} 手` + (cur ? '　' + cur.notation : '');
    renderStrip();
    const onPill = moveStrip.querySelector('.move-pill.on');
    if (onPill) onPill.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function togglePlay() {
    const btn = bar.querySelector('.ctl-play');
    if (reviewPlayTimer !== null) { clearReviewPlayTimer(); btn.textContent = '自动'; return; }
    btn.textContent = '暂停';
    setReviewPlayTimer(() => { if (step >= coords.length) { clearReviewPlayTimer(); btn.textContent = '自动'; return; } gotoStep(step + 1); }, 1100);
  }
  gotoStep(0);
}

// ---------------- 战绩 / 复盘 ----------------
function renderRecords() {
  show('screen-records');
  const root = $('screen-records'); root.innerHTML = '';
  const list = store.records().slice().sort((a, b) => b.at - a.at);
  const body = h('div', { class: 'page-body' });
  if (!list.length) {
    body.appendChild(h('div', { class: 'empty' }, [
      h('div', { class: 'em-ic' }, '谱'),
      h('div', { class: 'em-t' }, '还没有对局记录'),
      h('div', { class: 'em-d' }, '完成一局人机或局域网对战后, 棋谱会自动保存在本机')
    ]));
  } else {
    const buckets = [[], [], []]; // 今天 / 昨天 / 更早
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    list.forEach(r => {
      const day = 86400000;
      if (r.at >= today) buckets[0].push(r);
      else if (r.at >= today - day) buckets[1].push(r);
      else buckets[2].push(r);
    });
    const labels = ['今天', '昨天', '更早'];
    buckets.forEach((arr, bi) => {
      if (!arr.length) return;
      body.appendChild(h('div', { class: 'section-title' }, [labels[bi], h('span', { class: 'st-count' }, arr.length + ' 局')]));
      const g = h('div', { class: 'group' });
      arr.forEach((r) => {
        const d = new Date(r.at);
        const tagCls = r.result === '胜' ? 'tag-green' : (r.result === '负' || r.result === '黑胜') ? 'tag-red' : r.result === '红胜' ? 'tag-green' : '';
        g.appendChild(h('button', { class: 'list-row', onclick: () => go('#/review/' + r.id) }, [
          h('div', { style: 'flex:1;min-width:0' }, [
            h('div', { style: 'font-weight:700;font-size:15px' }, `${r.mode} · ${r.jieqi ? '揭棋' : '经典'}`),
            h('div', { class: 'muted', style: 'margin-top:3px' },
              `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${r.moves.length}手 · ${reasonShort(r.reason)}`)
          ]),
          h('span', { class: 'tag ' + tagCls }, r.result),
          h('span', { class: 'lr-chevron' }, '›')
        ]));
      });
      body.appendChild(g);
    });
    body.appendChild(h('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:10px', onclick: () => {
      modal({ title: '清空全部记录?', body: '将删除本机保存的所有棋谱。', buttons: [
        { text: '清空', cls: 'btn-primary', onClick: () => { store.clearRecords(); renderRecords(); } },
        { text: '取消', cls: 'btn-ghost' }] });
    } }, '清空记录'));
  }
  root.append(topbar('复盘战绩', '#/home'), body);
}
function reasonShort(r) {
  return { checkmate: '将死', stalemate: '困毙', perpetual: '长将', repetition: '重复和棋', nocapture: '无吃子和棋', timeout: '超时', resign: '认输', offline: '断线', agreement: '和棋' }[r] || r || '';
}

function renderReview(id) {
  show('screen-review');
  const seq = ++reviewSeq; // 本页代际: 切走/重进后旧分析回调不再写本页 UI
  const root = $('screen-review'); root.innerHTML = '';
  const rec = store.records().find(r => r.id === id);
  if (!rec) { root.append(topbar('复盘', '#/records'), h('div', { class: 'card muted' }, '记录不存在')); return; }
  let base = createState({ jieqi: !!rec.jieqi, fen: rec.fen, seed: rec.seed });
  let step = 0;
  let report = store.getAnalysis(rec.id);
  if (report && report.analyzed < rec.moves.length) report = null;
  let analysisJob = null;
  const host = h('div', {});
  const info = h('div', { class: 'review-info', id: 'rv-info' });
  const boardHost = h('div', { class: 'review-board-wrap' }, h('div', { class: 'board-host' }, host));
  const anBox = h('div', { class: 'an-box' });
  const bar = h('div', { class: 'review-ctl' });
  root.append(topbar('棋谱复盘', '#/records', null, '战绩'),
    h('div', { class: 'page-body', style: 'padding:10px 0 0;flex:1;min-height:0;overflow-y:auto' }, [info, boardHost, anBox]),
    bar);
  const ctl = (txt, fn, cls) => h('button', { class: 'ctl-btn ' + (cls || ''), onclick: fn }, txt);
  bar.append(
    ctl('⏮', () => gotoStep(0)), ctl('‹', () => gotoStep(step - 1)),
    ctl('自动', () => togglePlay(), 'ctl-play'),
    ctl('›', () => gotoStep(step + 1)), ctl('⏭', () => gotoStep(rec.moves.length)),
    ctl('导谱', async () => {
      const txt = XQExportText({ moves: rec.moves, result: rec.result, reason: rec.reason, mode: rec.mode, jieqi: rec.jieqi, fen: rec.fen, seed: rec.seed, at: rec.at });
      const shared = await XQShareText(txt);
      if (!shared) { const ok = await XQCopyText(txt); toast(ok ? '棋谱已复制到剪贴板' : '导出失败'); }
    }, 'xq-export-btn')
  );
  const board = new BoardView(host, { viewSide: 'r', jieqi: !!rec.jieqi, interactive: false, onMove() { } });
  function rebuild(n) {
    base = createState({ jieqi: !!rec.jieqi, fen: rec.fen, seed: rec.seed });
    for (let i = 0; i < n; i++) {
      const m = rec.moves[i];
      applyMove(base, m.from, m.to, { revealT: m.reveal ? m.reveal.t : null });
    }
  }
  function gotoStep(n) {
    step = Math.max(0, Math.min(rec.moves.length, n));
    rebuild(step);
    board.setState(base);
    const cur = rec.moves[step - 1];
    if (cur) board.setLastMove({ from: cur.from, to: cur.to });
    // AI 评级标注 + 最佳着提示
    const g = report && report.grades[step - 1];
    if (g && g.bestFrom && (g.grade === 'inaccuracy' || g.grade === 'mistake' || g.grade === 'blunder')) {
      board.showHintsFromAI(g.bestFrom, g.bestTo);
    } else { board.clearHint(); }
    info.innerHTML = '';
    info.append(h('span', { class: 'muted' }, `${rec.mode} · ${rec.result} · ${reasonShort(rec.reason)}　|　`));
    info.append(h('span', {}, `第 ${Math.ceil(step / 2)} 回合 · ${step}/${rec.moves.length} 手` + (cur ? '　' + cur.notation : '')));
    if (g) {
      const meta = GRADE_META[g.grade];
      info.append(h('span', { class: 'an-badge ' + meta.cls, title: g.grade === 'best' ? meta.label : (meta.label + ' · AI建议 ' + g.bestNotation) }, meta.sym));
    }
  }
  function togglePlay() {
    const btn = bar.querySelector('.ctl-play');
    if (reviewPlayTimer !== null) { clearReviewPlayTimer(); btn.textContent = '自动'; return; }
    btn.textContent = '暂停';
    setReviewPlayTimer(() => { if (step >= rec.moves.length) { clearReviewPlayTimer(); btn.textContent = '自动'; return; } gotoStep(step + 1); }, 900);
  }

  // ---------------- AI 复盘分析面板 ----------------
  function renderAnIdle() {
    anBox.innerHTML = '';
    anBox.appendChild(h('button', { class: 'an-start', onclick: startAnalysis }, [
      h('span', { class: 'an-start-ic' }, 'AI'),
      h('span', { style: 'flex:1;text-align:left' }, [
        h('b', {}, 'AI 大师复盘分析'),
        h('span', { class: 'muted', style: 'display:block;font-size:12px;margin-top:2px' }, '逐手着法评级 · 评分曲线 · 失误与最佳着定位')
      ]),
      h('span', { class: 'lr-chevron' }, '›')
    ]));
  }
  function renderAnProgress(done, total) {
    const pct = total ? Math.round(done / total * 100) : 0;
    anBox.innerHTML = '';
    anBox.appendChild(h('div', { class: 'card an-running' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
        h('b', {}, 'AI 深度分析中…'),
        h('span', { class: 'muted' }, `${done}/${total} 手 · ${pct}%`)
      ]),
      h('div', { class: 'an-progress' }, h('div', { class: 'an-progress-bar', style: `width:${pct}%` })),
      h('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:10px', onclick: cancelAnalysis }, '取消分析')
    ]));
  }
  function startAnalysis() {
    const style = store.settings().aiStyle || 'balance';
    renderAnProgress(0, rec.moves.length);
    analysisJob = analyzeRecord(rec, {
      style, deadlineMs: 1100,
      onProgress: (i, t) => { if (seq === reviewSeq) renderAnProgress(i, t); }
    });
    currentAnalysisJob = analysisJob; // 登记到模块句柄, 切页时由 route() 统一 cancel/terminate
    analysisJob.promise
      .then(rep => { if (seq !== reviewSeq) return; report = rep; renderAnReport(); gotoStep(step); })
      .catch(err => { if (seq !== reviewSeq) return; if (String(err.message || err).includes('超时')) toast('分析超时, 请重试'); renderAnIdle(); });
  }
  function cancelAnalysis() {
    if (analysisJob) analysisJob.cancel();
    analysisJob = null; currentAnalysisJob = null; renderAnIdle();
  }

  function evalChart(rep) {
    const W = 300, H = 92, PAD = 5, MID = H / 2;
    const n = rep.curve.length;
    const X = i => n <= 1 ? PAD : PAD + i / (n - 1) * (W - 2 * PAD);
    const Y = v => MID - Math.max(-700, Math.min(700, v)) / 700 * (MID - 10);
    const svg = h('svg', { class: 'an-chart', viewBox: `0 0 ${W} ${H}` });
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    svg.appendChild(mk('rect', { x: 0, y: 0, width: W, height: MID, fill: 'rgba(198,64,64,0.05)' }));
    svg.appendChild(mk('rect', { x: 0, y: MID, width: W, height: MID, fill: 'rgba(40,40,46,0.05)' }));
    svg.appendChild(mk('line', { x1: 0, y1: MID, x2: W, y2: MID, stroke: 'rgba(120,100,70,0.4)', 'stroke-dasharray': '3 3' }));
    const pts = rep.curve.map((c, i) => `${X(i).toFixed(1)},${Y(c.red).toFixed(1)}`).join(' ');
    svg.appendChild(mk('polyline', { points: pts, fill: 'none', stroke: '#b3403a', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
    rep.curve.forEach((c, i) => {
      const dot = mk('circle', { cx: X(i), cy: Y(c.red), r: step === i + 1 ? 4.2 : 2.4,
        fill: c.red >= 0 ? '#c64040' : '#3a3a44', stroke: '#fbf4e4', 'stroke-width': 0.8, style: 'cursor:pointer' });
      dot.addEventListener('click', () => gotoStep(i + 1));
      svg.appendChild(dot);
    });
    return svg;
  }

  function renderAnReport() {
    anBox.innerHTML = '';
    const rep = report;
    const order = ['brilliant', 'good', 'best', 'inaccuracy', 'mistake', 'blunder'];
    const chips = h('div', { class: 'an-chips' });
    for (const k of order) {
      const cnt = rep.counts[k] || 0;
      if (!cnt) continue;
      const meta = GRADE_META[k];
      chips.appendChild(h('span', { class: 'an-chip ' + meta.cls }, `${meta.sym} ${meta.label} ${cnt}`));
    }
    const head = h('div', { class: 'an-rep-head' }, [
      h('b', {}, 'AI 复盘报告'),
      h('span', { class: 'muted', style: 'font-size:12px' }, `分析均深 ${rep.avgDepth} 层`)
    ]);
    const chartCard = h('div', { class: 'card an-chart-card' }, [
      h('div', { class: 'an-chart-legend' }, [
        h('span', { style: 'color:#c64040' }, '↑ 红方优势'),
        h('span', { class: 'muted' }, '点击曲线上的点跳转手数'),
        h('span', { style: 'color:#3a3a44' }, '黑方优势 ↓')
      ]),
      evalChart(rep)
    ]);
    // 关键着法: 妙手 + 全部疑着手, 按手数排序
    const key = rep.grades.filter(g => g.grade !== 'best' && g.grade !== 'good');
    key.sort((a, b) => a.ply - b.ply);
    const list = h('div', { class: 'group an-keylist' });
    if (!key.length) {
      list.appendChild(h('div', { class: 'card muted', style: 'text-align:center;padding:16px' }, '全程未发现明显问题着法'));
    }
    key.forEach(g => {
      const meta = GRADE_META[g.grade];
      const turnNo = Math.floor(g.ply / 2) + 1;
      const sideTxt = g.color === 'r' ? '红' : '黑';
      const diff = g.bestScore - g.playedScore;
      let sub = '';
      if (g.grade === 'brilliant') sub = '战术妙手';
      else if (g.grade === 'inaccuracy' || g.grade === 'mistake' || g.grade === 'blunder') {
        if (g.bestScore >= 99800 && g.playedScore < 99800) sub = `AI建议 ${g.bestNotation} · 错失绝杀`;
        else if (g.playedScore <= -99800) sub = `AI建议 ${g.bestNotation} · 招致绝杀`;
        else sub = `AI建议 ${g.bestNotation}${diff > 0 ? ' · 差 ' + (diff / 100).toFixed(1) + ' 兵' : ''}`;
      }
      list.appendChild(h('button', { class: 'list-row an-keyrow', onclick: () => { gotoStep(g.ply + 1); anBox.scrollIntoView({ block: 'nearest' }); window.scrollTo({ top: 0 }); } }, [
        h('span', { class: 'an-badge ' + meta.cls }, meta.sym),
        h('div', { style: 'flex:1;min-width:0;text-align:left' }, [
          h('div', { style: 'font-weight:700;font-size:14px' }, `${turnNo}回合 ${sideTxt} · ${g.notation}`),
          sub ? h('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' }, sub) : null
        ])
      ]));
    });
    anBox.append(
      h('div', { class: 'card an-summary' }, [head, chips,
        h('div', { class: 'muted', style: 'font-size:12px;margin-top:8px' },
          '评分基于大师级搜索(红方视角): ' + scoreText(rep.curve[rep.curve.length - 1] ? rep.curve[rep.curve.length - 1].red : 0))]),
      chartCard,
      h('div', { class: 'section-title' }, '关键着法'),
      list,
      h('button', { class: 'btn btn-ghost btn-block', style: 'margin:10px 0 4px', onclick: () => {
        modal({ title: '重新分析?', body: '将删除本局已保存的分析结果并重新计算。', buttons: [
          { text: '重新分析', cls: 'btn-primary', onClick: () => { store.clearAnalysis(rec.id); report = null; renderAnIdle(); } },
          { text: '取消', cls: 'btn-ghost' }] });
      } }, '重新分析')
    );
  }

  gotoStep(0);
  if (report) renderAnReport(); else renderAnIdle();
}

// ---------------- 设置 ----------------
function renderSettings() {
  show('screen-settings');
  const root = $('screen-settings'); root.innerHTML = '';
  const s = store.settings();
  const sound = h('input', { type: 'checkbox' });
  sound.checked = soundEnabled();
  sound.addEventListener('change', () => { setSoundEnabled(sound.checked); store.saveSettings({ sound: sound.checked }); });
  const nameInput = h('input', { class: 'input', value: s.name || '', maxlength: 12, placeholder: '对局昵称' });
  nameInput.addEventListener('change', () => store.saveSettings({ name: nameInput.value.trim() || '棋友' }));

  const themePick = h('div', { class: 'theme-pick' });
  const themes = [
    { v: 'wood', t: '木色', sw: 'ts-wood' }, { v: 'jade', t: '青瓷', sw: 'ts-jade' }, { v: 'ink', t: '墨玉', sw: 'ts-ink' }
  ];
  themes.forEach(th => {
    const b = h('button', { class: 'theme-opt' + ((s.theme || 'wood') === th.v ? ' on' : ''), onclick: () => {
      themePick.querySelectorAll('.theme-opt').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      document.body.dataset.theme = th.v; store.saveSettings({ theme: th.v });
    } }, [h('span', { class: 'theme-swatch ' + th.sw }), th.t]);
    themePick.appendChild(b);
  });

  // 界面版本(新/旧版经典): 仅切 data-theme, 即时生效, 持久化; 不影响任何对局/AI/残局逻辑
  const uiNow = s.uiTheme === 'classic' ? 'classic' : 'new';
  const uiSeg = segControl([
    { label: '新版(现代动效)', value: 'new' },
    { label: '旧版经典', value: 'classic' }
  ], uiNow, v => {
    applyUiTheme(v);
    store.saveSettings({ uiTheme: v });
  });

  const body = h('div', { class: 'page-body' }, [
    h('div', { class: 'section-title' }, '通用'),
    h('div', { class: 'group' }, [
      h('div', { class: 'set-row' }, [h('span', {}, '音效与振动'), h('label', { class: 'switch' }, [sound, h('span', { class: 'sl' })])]),
      h('div', { style: 'padding:12px 4px' }, [
        h('div', { class: 'field-label', style: 'margin:0 0 8px' }, '界面版本'),
        uiSeg,
        h('div', { class: 'muted', style: 'margin-top:7px' }, '旧版经典: 朴素配色, 关闭走子/将军/绝杀动效。')
      ]),
      h('div', { style: 'padding:12px 4px 14px' }, [
        h('div', { class: 'field-label', style: 'margin:0 0 8px' }, '棋盘主题'),
        themePick
      ]),
      h('div', { style: 'padding:0 4px 14px' }, [
        h('div', { class: 'field-label', style: 'margin:0 0 8px' }, '对局昵称'),
        nameInput
      ]),
      h('div', { style: 'padding:0 4px 14px' }, [
        h('div', { class: 'field-label', style: 'margin:0 0 8px' }, '默认对局计时'),
        segControl([
          { label: '不限时', value: 'none' }, { label: '10分钟', value: '10' }, { label: '5分钟', value: '5' },
          { label: '20分钟', value: '20' }, { label: '10+3秒', value: '10+3' }, { label: '10+30读秒', value: '10+30s' }
        ], s.time || '10', v => store.saveSettings({ time: v }), 'cols3')
      ])
    ]),
    h('div', { class: 'section-title' }, '联机与隐私'),
    h('div', { class: 'group' }, [
      aboutRow('直', '联机使用 WebRTC DataChannel, iceServers 为空, 只在局域网内建立直连, 不连接任何 STUN / TURN / 中继服务器。'),
      aboutRow('探', '网页没有系统级 UDP 广播 / mDNS 发布权限(原生 App 才能做到 LocalSend 式零交互发现), 因此以两轮扫码交换连接信息。'),
      aboutRow('眼', '摄像头仅用于本地识别二维码, 画面不出设备。'),
      aboutRow('隐', '战绩与设置只保存在本机浏览器, 不上传。')
    ]),
    h('div', { class: 'section-title' }, '棋子字体'),
    h('div', { class: 'group' }, [
      h('div', { class: 'about-row' }, [
        h('div', { class: 'ab-ic' }, '魏'),
        h('div', {}, '棋子文字采用新魏体风格矢量字形(华文新魏 / STXinwei 优先, 内嵌开源毛笔楷体子集兜底), 任意缩放下清晰锐利。')
      ])
    ])
  ]);
  root.append(topbar('设置', '#/home'), body);
  document.body.dataset.theme = s.theme || 'wood';
}
function aboutRow(ic, text) {
  return h('div', { class: 'about-row' }, [h('div', { class: 'ab-ic' }, ic), h('div', {}, text)]);
}

// ---------------- PWA ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
}
route();
