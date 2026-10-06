// ============================================================
// XQClock: 对局时钟(纯逻辑, 可在 node 自测)
// 规则模型与 room.js TIME_RULES 对齐: { base, inc, byo } (单位: 秒)
//   base>0   : 双方初始包干秒数
//   inc>0    : 每走一手给刚走完方加 inc 秒(加秒制)
//   byo>0    : 主时间耗尽后进入读秒, 每手 byo 秒, 读秒耗尽判负
// 双方独立钟, 仅"行棋方"扣时; 落子由 settle() 结算刚走完方。
// 时间源可注入 opts.now() -> ms 时间戳, 便于 node 假时钟测试。
// ESM, 无 DOM 依赖; 浏览器侧由 game-controller 驱动 setInterval。
// ============================================================

// rule: TIME_RULES 的值 {label?, base, inc, byo}(秒); opts.now 时间源
export function XQMakeClock(rule, opts = {}) {
  const now = (typeof opts.now === 'function') ? opts.now : () => Date.now();
  const baseMs = Math.round((rule && rule.base || 0) * 1000);
  const incMs = Math.round((rule && rule.inc || 0) * 1000);
  const byoMs = Math.round((rule && rule.byo || 0) * 1000);
  // 无主时间 = 不计时
  if (!baseMs) return XQNullClock();

  const mk = () => ({ remain: baseMs, phase: 'base' });
  const st = { r: mk(), b: mk() };
  let lastTs = now();

  const self = {
    running: true,
    rule,
    // 视图: { r:{remain,phase}, b:{remain,phase}, rule } —— 与原 this._clk 形状一致
    view() { return { r: st.r, b: st.b, rule }; },
    // 刚走完的一方结算: 扣掉本次思考耗时, 加每手加秒; 主时耗尽则进入读秒
    settle(moverSide) {
      const c = st[moverSide]; if (!c) return;
      const t = now();
      const elapsed = t - lastTs; lastTs = t;
      if (c.phase === 'byo') { c.remain = byoMs; return; } // 读秒手: 重置读秒
      c.remain -= elapsed;
      if (incMs) c.remain += incMs;
      if (c.remain <= 0 && byoMs) { c.phase = 'byo'; c.remain = byoMs; }
    },
    // 推进行棋方时钟; 返回超时判负方('r'/'b')或 null(继续)
    tick(turnSide) {
      const c = st[turnSide]; if (!c) return null;
      const t = now();
      const left = c.remain - (t - lastTs);
      lastTs = t;
      if (c.phase === 'byo') {
        if (left <= 0) return turnSide; // 读秒耗尽
        c.remain = left; return null;
      }
      c.remain = left;
      if (left <= 0) {
        if (byoMs) { c.phase = 'byo'; c.remain = byoMs; }
        else return turnSide; // 包干耗尽判负
      }
      return null;
    },
    // 悔棋/回退时把钟恢复到某快照(避免悔棋后时间错乱)
    snapshot() { return { r: { ...st.r }, b: { ...st.b }, lastTs }; },
    restore(s) {
      if (!s) return;
      st.r = { ...s.r }; st.b = { ...s.b }; lastTs = s.lastTs;
    }
  };
  return self;
}

// 不计时时钟: 所有调用空转, 永不超时
function XQNullClock() {
  return {
    running: false,
    rule: null,
    view() { return null; },
    settle() { },
    tick() { return null; },
    snapshot() { return null; },
    restore() { }
  };
}

// 毫秒 -> "mm:ss" 文本(供 UI/导出); byo 前缀由调用方决定
export function XQFmtClock(ms) {
  if (ms == null || ms < 0) return '--:--';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60), ss = s % 60;
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}
