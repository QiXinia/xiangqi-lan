// ============================================================
// 观战 AI 对战: 纯逻辑状态机(无 DOM/无 worker)
//   - 持红/黑两方各自配置 {engine, level}, 按当前回合方轮流驱动 AI;
//   - play/pause/step(暂停态单步一手)/speed(每手间隔)/restart/换配置;
//   - 终局/着法/循环判和一律由注入的 applyFn(复用 engine)判定, 本模块不另写规则;
//   - 健壮性: aiCall 超时兜底已在注入层; 本模块再设最大手数保护, 某方回 null 用
//     fallbackFn 兜底, 绝不死循环卡死。
// 顶层符号统一 XQSpec* 前缀, 避开 build checkDup。
// ============================================================

// 播放速度 -> 每手间隔 ms(慢/中/快)
export const SPEC_SPEEDS = { slow: 900, mid: 420, fast: 160 };
// 最大手数保护: 防双方无限拉锯(无吃子和棋应更早触发, 这里再兜一层)
export const SPEC_MAX_MOVES = 260;

export class XQSpectate {
  // opts:
  //   red, black : {engine:'classic'|'pro', level:1-5}
  //   aiCallFn(side, engine, level) -> Promise<mv|null>   (注入, 内部已含超时兜底)
  //   fallbackFn(side) -> mv|null                          (某方回 null 时取一个合法着)
  //   applyFn(mv, side) -> {over, status, reason, nextSide} (注入: 落子+记谱+判终局)
  //   onEnd({status, reason})                              (终局回调)
  //   speed: 'slow'|'mid'|'fast'
  constructor(opts = {}) {
    this.cfg = {
      red: { engine: opts.red?.engine === 'pro' ? 'pro' : 'classic', level: this._lvl(opts.red?.level) },
      black: { engine: opts.black?.engine === 'pro' ? 'pro' : 'classic', level: this._lvl(opts.black?.level) }
    };
    this.aiCallFn = opts.aiCallFn || (async () => null);
    this.fallbackFn = opts.fallbackFn || (() => null);
    this.applyFn = opts.applyFn || (() => ({ over: true, status: 'draw', reason: 'spec-nofn', nextSide: 'r' }));
    this.onEnd = opts.onEnd || (() => {});
    this.setSpeed(opts.speed);
    this.paused = false;
    this.moveCount = 0;
    this.running = false;
    this.side = 'r';          // 当前轮到的 AI
    this._timer = null;
    this._busy = false;
  }
  _lvl(v) { v = +v; return v >= 1 && v <= 5 ? v : 3; }
  cfgFor(side) { return this.cfg[side === 'b' ? 'black' : 'red']; }
  setSpeed(s) { if (SPEC_SPEEDS[s]) this.speed = s; else this.speed = 'mid'; }
  waitMs() { return SPEC_SPEEDS[this.speed]; }
  get over() { return !this.running; }

  start() {
    if (this.running) return;
    this.running = true;
    this._kick();
  }
  stop() {
    this.running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }
  setPaused(p) {
    this.paused = !!p;
    if (!this.paused) this._kick();
  }
  // 换配置并重置到开局(由外层重建 state 后调用)
  reset(red, black, speed) {
    this.stop();
    if (red) this.cfg.red = { engine: red.engine === 'pro' ? 'pro' : 'classic', level: this._lvl(red.level) };
    if (black) this.cfg.black = { engine: black.engine === 'pro' ? 'pro' : 'classic', level: this._lvl(black.level) };
    if (speed) this.setSpeed(speed);
    this.paused = false; this.moveCount = 0; this.side = 'r'; this._busy = false;
  }
  _kick() {
    if (!this.running || this.paused || this._busy || this._timer != null) return;
    this._timer = setTimeout(() => { this._timer = null; this._tick(); }, this.waitMs());
  }
  async _tick() {
    if (!this.running || this._busy) return;
    this._busy = true;
    const side = this.side;
    const ai = this.cfgFor(side);
    let mv = null;
    try { mv = await this.aiCallFn(side, ai.engine, ai.level); } catch (e) { mv = null; }
    // 到点/异常后若已 stop(退出/换配置), 放弃, 不污染旧局面
    if (!this.running) { this._busy = false; return; }
    if (!mv) { try { mv = this.fallbackFn(side); } catch (e) { mv = null; } }
    if (!mv) { // 无任何合法着 -> 判负(对方胜), 绝不死循环
      this._busy = false; this.stop();
      this.onEnd({ status: side === 'r' ? 'blackwin' : 'redwin', reason: 'spec-nomove' });
      return;
    }
    let res = { over: true, status: 'draw', reason: 'spec-nofn', nextSide: side === 'r' ? 'b' : 'r' };
    try { res = this.applyFn(mv, side) || res; } catch (e) { res = { over: true, status: 'draw', reason: 'spec-applyerr', nextSide: side === 'r' ? 'b' : 'r' }; }
    this.moveCount++;
    this._busy = false;
    if (res.over) { this.stop(); this.onEnd({ status: res.status, reason: res.reason }); return; }
    if (this.moveCount >= SPEC_MAX_MOVES) { this.stop(); this.onEnd({ status: 'draw', reason: 'spec-maxmoves' }); return; }
    this.side = res.nextSide;
    this._kick();
  }
  // 暂停态手动单步: 恰好推进一手; 非暂停态忽略(避免与自动循环重复触发)
  stepOnce() {
    if (!this.running || !this.paused || this._busy) return Promise.resolve(false);
    this._timer = null;
    return this._tick().then(() => true);
  }
}
