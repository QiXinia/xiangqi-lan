// ============================================================
// 断线重连状态机(传输无关 / 规则无关, 浏览器与 Node 通用)
//
// 职责:
//   * 观察 ICE / connectionState / DataChannel close 信号, 粗粒度判定链路状态;
//   * 区分两类"断开":
//       - 对方主动离开(收到 bye / pc 被对端干净关闭) -> GONE, 不再尝试重连;
//       - 网络中断(NIC 抖动 / 切 WiFi / mDNS 解析失败 / 瞬时丢包) -> RECONNECTING;
//   * 进入重连中后按次数尝试 ICE restart(onAttemptRestart 由调用方实现:
//     同设备经 BroadcastChannel 中继新 SDP; 跨设备由 UI 提示用户重新扫码,
//     复用 room.js 的 hello{reconnect}+快照回放恢复);
//   * 重连成功(notifyUp)由调用方触发一次快照重同步; 超时放弃 -> GIVEUP。
//
// 不承诺: 跨设备在不重新交换 SDP 的情况下自动穿透已彻底死亡的 UDP 链路 ——
// 纯静态无信令服务器做不到, 跨设备重连必然需要一次手动(扫码/粘贴)动作。
// iceServers 恒为 [], 本模块不产生任何新的网络连接配置。
// ============================================================

export const XQNetLinkState = Object.freeze({
  UP: 'up',                       // 已连接
  RECONNECTING: 'reconnecting',  // 重连中(网络中断, 正在尝试恢复)
  GONE: 'gone',                   // 对方主动离开
  GIVEUP: 'giveup'               // 重连超时失败
});

export class XQNetReconnector {
  /**
   * @param {object}   [opts]
   * @param {number}   [opts.suspectMs=3500]  disconnected/failed 持续超过该值 -> 判定为网络中断
   * @param {number}   [opts.giveUpMs=45000]  重连总尝试时限, 超过即放弃
   * @param {number}   [opts.maxRestart=2]    最多触发几次 ICE restart
   * @param {object}   [opts.clock]           可注入 {now(),setTimeout,clearTimeout} 便于测试
   */
  constructor({
    suspectMs = 3500, giveUpMs = 45000, maxRestart = 2, clock = null
  } = {}) {
    this.state = XQNetLinkState.UP;
    this.suspectMs = suspectMs;
    this.giveUpMs = giveUpMs;
    this.maxRestart = maxRestart;
    this._restarts = 0;
    this._suspectTimer = null;
    this._giveUpTimer = null;
    // ---- 供调用方挂载的钩子 ----
    this.onTransition = null;       // (state, {prev, recovered, reason}) => {}
    this.onAttemptRestart = null;    // () => void | Promise    执行一次 ICE restart(由调用方实现 SDP 中继)
    this.clock = clock || {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id)
    };
  }
  _set(state, info = {}) {
    const prev = this.state;
    this.state = state;
    try { this.onTransition && this.onTransition(state, Object.assign({ prev }, info)); } catch (e) { }
  }

  // 数据通道重新 open / ICE 回到 connected: 视为重连成功
  notifyUp() {
    if (this.state === XQNetLinkState.UP) return;
    this._clearTimers();
    const recovered = this.state === XQNetLinkState.RECONNECTING;
    this._restarts = 0;
    this._set(XQNetLinkState.UP, { recovered });
  }

  // RTCPC.iceConnectionState 观测
  notifyIce(state) {
    if (this.state === XQNetLinkState.GONE || this.state === XQNetLinkState.GIVEUP) return;
    if (state === 'connected' || state === 'completed') {
      if (this.state === XQNetLinkState.RECONNECTING) this.notifyUp();
      return;
    }
    if (state === 'disconnected' || state === 'failed') this._suspect(false);
  }
  // RTCPeerConnection.connectionState 观测
  notifyConn(state) {
    if (this.state === XQNetLinkState.GONE || this.state === XQNetLinkState.GIVEUP) return;
    if (state === 'connected') {
      if (this.state === XQNetLinkState.RECONNECTING) this.notifyUp();
      return;
    }
    if (state === 'disconnected' || state === 'failed') this._suspect(false);
    else if (state === 'closed') this._gone();   // pc 被对端/本地干净关闭
  }
  // 传输层 onClose。clean=true 表示我们已知对方主动离开(收到 bye / 正常关闭)
  notifyClosed({ clean = false } = {}) {
    if (clean) this._gone();
    else this._suspect(true);   // 突兀关闭 -> 按网络中断处理, 直接进入重连中
  }

  _suspect(hard) {
    if (this.state === XQNetLinkState.GONE || this.state === XQNetLinkState.GIVEUP) return;
    if (hard) { this._enterReconnecting(); return; }
    if (this._suspectTimer) return;   // 已在观察期
    this._suspectTimer = this.clock.setTimeout(() => this._enterReconnecting(), this.suspectMs);
  }
  _enterReconnecting() {
    this._clearSuspect();
    if (this.state === XQNetLinkState.GONE || this.state === XQNetLinkState.GIVEUP) return;
    if (this.state === XQNetLinkState.UP) {
      this._set(XQNetLinkState.RECONNECTING, {});
      this._giveUpTimer = this.clock.setTimeout(() => this._giveUp(), this.giveUpMs);
    }
    this._tryRestart();
  }
  _tryRestart() {
    if (this._restarts >= this.maxRestart) return;
    this._restarts++;
    try { this.onAttemptRestart && this.onAttemptRestart(); } catch (e) { }
  }
  _gone() {
    this._clearTimers();
    if (this.state !== XQNetLinkState.GONE) this._set(XQNetLinkState.GONE, {});
  }
  _giveUp() {
    this._clearTimers();
    if (this.state === XQNetLinkState.RECONNECTING) this._set(XQNetLinkState.GIVEUP, { reason: 'timeout' });
  }
  _clearSuspect() { if (this._suspectTimer) { this.clock.clearTimeout(this._suspectTimer); this._suspectTimer = null; } }
  _clearTimers() {
    this._clearSuspect();
    if (this._giveUpTimer) { this.clock.clearTimeout(this._giveUpTimer); this._giveUpTimer = null; }
  }
  destroy() { this._clearTimers(); }
}
