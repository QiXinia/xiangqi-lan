// ============================================================
// 同设备(同浏览器)多标签/多页近场发现 —— 纯静态无服务器边界内能做到的最好
//
// 能力边界(务必与文案一致):
//  * 纯静态网页没有 mDNS / DNS-SD / UDP 广播 API, 跨设备"自动发现"在不引入
//    任何信令服务器的前提下做不到; 因此:
//      - 同设备多标签/多页: 用 BroadcastChannel(同源) 自动广播发现,
//        offer/answer 信令帧直接在标签之间中继, 免去两轮扫码。
//      - 跨设备: 仍只能靠「出二维码/房间码 + 扫码或粘贴剪贴板」手动交换 SDP。
//  * 本模块不触碰 RTCPeerConnection, 只搬运已经编好的信令帧字符串,
//    因此不改变 iceServers(恒为 [])、不引入 STUN/TURN/中继/互联网信令。
// ============================================================

export const XQNET_DISCOVER_PROTO = 1;
export const XQNET_DISCOVER_CHANNEL = 'xqnet-lan-v1';

// 当前环境是否具备同设备发现能力(BroadcastChannel)
export function xqNetDiscoverSupported() {
  try { return typeof globalThis.BroadcastChannel === 'function'; }
  catch (e) { return false; }
}

function xqNetRandId() {
  return 't' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

// 一条同设备发现会话。host 侧与 guest 侧共用本类, 靠 becomeHost/becomeGuest 区分角色。
// bus 可注入(测试用内存总线); 浏览器内缺省用 BroadcastChannel。
//
// 消息(均为 JSON 安全的普通对象, 经 BroadcastChannel 传递):
//   xqnet/presence  host -> 广播: 我在这个浏览器里开了房间 {hostName,cfg,roomCode}
//   xqnet/list      guest -> 广播: 请现存 host 重新播报一次
//   xqnet/offerReq  guest -> host: 把你的邀请信令帧发给我
//   xqnet/offer     host  -> guest: 邀请信令帧(与二维码编码出的 frames 完全一致)
//   xqnet/answer    guest -> host: 回答信令帧
//   xqnet/gone      host -> 广播: 我已退出
export class XQNetDiscovery {
  constructor({ selfId, bus, channel } = {}) {
    this.selfId = selfId || xqNetRandId();
    this.role = null;
    this.hostInfo = null;
    this.hosts = new Map();      // hostId -> {hostId, hostName, cfg, roomCode, ts}
    // ---- 供 pair.js 挂载的钩子 ----
    this.onRoomList = null;      // (list:Array) => {}          guest 侧: 同浏览器可用房间刷新
    this.onOfferRequest = null;  // (guestId) => {}             host 侧: 某 guest 标签要我的邀请帧
    this.onOffer = null;         // ({hostId,hostName,cfg,frames}) => {}   guest 侧: 拿到邀请帧
    this.onAnswer = null;        // ({guestId, frames}) => {}   host 侧: 拿到 guest 的回答帧
    this.onGone = null;          // (hostId) => {}
    this._keepAlive = null;
    this._bus = bus || (xqNetDiscoverSupported() ? new BroadcastChannel(channel || XQNET_DISCOVER_CHANNEL) : null);
    if (this._bus) this._bus.onmessage = (ev) => this._route(ev && ev.data);
  }
  get available() { return !!this._bus; }

  _post(msg) {
    if (!this._bus) return;
    try { this._bus.postMessage(Object.assign({ proto: XQNET_DISCOVER_PROTO, from: this.selfId }, msg)); }
    catch (e) { }
  }
  _route(m) {
    if (!m || m.proto !== XQNET_DISCOVER_PROTO || m.from === this.selfId) return;
    switch (m.kind) {
      case 'xqnet/presence':
        this.hosts.set(m.from, { hostId: m.from, hostName: m.hostName, cfg: m.cfg, roomCode: m.roomCode, ts: m.ts || Date.now() });
        this.onRoomList && this.onRoomList([...this.hosts.values()]);
        break;
      case 'xqnet/list':
        this._postPresence();           // host 收到 list 请求 -> 立即重新播报
        break;
      case 'xqnet/offerReq':
        if (m.to === this.selfId) this.onOfferRequest && this.onOfferRequest(m.from);
        break;
      case 'xqnet/offer':
        if (m.to === this.selfId) this.onOffer && this.onOffer({ hostId: m.from, hostName: m.hostName, cfg: m.cfg, frames: m.frames });
        break;
      case 'xqnet/answer':
        if (m.to === this.selfId) this.onAnswer && this.onAnswer({ guestId: m.from, frames: m.frames });
        break;
      case 'xqnet/gone':
        if (this.hosts.delete(m.from)) {
          this.onRoomList && this.onRoomList([...this.hosts.values()]);
          this.onGone && this.onGone(m.from);
        }
        break;
    }
  }

  // ---------- host 侧 ----------
  becomeHost({ hostName, cfg, roomCode }) {
    this.role = 'host';
    this.hostInfo = { hostName, cfg, roomCode };
    this._postPresence();
    // 周期性心跳播报: guest 列表随 tab 存活自动刷新
    try { this._keepAlive = setInterval(() => this._postPresence(), 4000); } catch (e) { }
  }
  _postPresence() {
    if (this.role !== 'host' || !this.hostInfo) return;
    this._post({
      kind: 'xqnet/presence', role: 'host',
      hostName: this.hostInfo.hostName, cfg: this.hostInfo.cfg, roomCode: this.hostInfo.roomCode, ts: Date.now()
    });
  }
  // host 被某 guest 标签索要邀请帧后, 把当前邀请帧定向推过去
  pushOffer(guestId, { hostName, cfg, frames }) {
    this._post({ kind: 'xqnet/offer', to: guestId, hostName, cfg, frames });
  }

  // ---------- guest 侧 ----------
  becomeGuest() {
    this.role = 'guest';
    this.refreshList();
  }
  refreshList() {
    this.hosts.clear();
    this.onRoomList && this.onRoomList([]);
    this._post({ kind: 'xqnet/list' });
  }
  requestOffer(hostId) { this._post({ kind: 'xqnet/offerReq', to: hostId }); }
  deliverAnswer(hostId, frames) { this._post({ kind: 'xqnet/answer', to: hostId, frames }); }

  leave() {
    try { if (this._keepAlive) clearInterval(this._keepAlive); } catch (e) { }
    this._keepAlive = null;
    this._post({ kind: 'xqnet/gone' });
    try { this._bus && this._bus.close(); } catch (e) { }
  }
}
