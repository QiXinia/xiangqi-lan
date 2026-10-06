// ============================================================
// WebRTC 局域网直连(iceServers: [] —— 只产生 host/mDNS candidate,
// 不连接任何 STUN/TURN 服务器, 信令与对局数据均不经过互联网)
// ============================================================
const RTC_CONFIG = { iceServers: [] };

function dcTransport(pc, dc, id, name) {
  let openResolve;
  const t = {
    id, name, open: false,
    ready: new Promise(res => { openResolve = res; }),
    onMessage: null, onClose: null,
    send(obj) { if (dc.readyState === 'open') dc.send(JSON.stringify(obj)); },
    close() { try { dc.close(); pc.close(); } catch (e) { } }
  };
  dc.onopen = () => { t.open = true; openResolve && openResolve(true); };
  dc.onmessage = (ev) => {
    try { t.onMessage && t.onMessage(JSON.parse(ev.data)); } catch (e) { }
  };
  dc.onclose = () => t.onClose && t.onClose();
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      openResolve && openResolve(false);
      t.onClose && t.onClose();
    }
  };
  return t;
}

// 延迟绑定版 transport(answerer/guest 专用):
// DataChannel 由房主端 createDataChannel 创建, 须等 answer 回传、ICE/DTLS/SCTP
// 建链后才经 ondatachannel 到达。为避免死锁, acceptOffer 在 gathering 完成后
// 立即返回 answer, 这里先返回一个占位 transport, 稍后由 _bind(channel) 挂上真实 dc。
// open 之前 send() 的消息入队, dc open 后按序补发(GuestRoom 构造时即发 hello)。
function dcTransportDeferred(pc, id, name) {
  let openResolve;
  const queue = [];
  let dc = null;
  const t = {
    id, name, open: false,
    ready: new Promise(res => { openResolve = res; }),
    onMessage: null, onClose: null,
    send(obj) {
      const str = JSON.stringify(obj);
      if (dc && dc.readyState === 'open') {
        try { dc.send(str); } catch (e) { queue.push(str); }
      } else {
        queue.push(str);
      }
    },
    close() { try { dc && dc.close(); pc.close(); } catch (e) { } },
    _bind(channel) {
      dc = channel;
      dc.onmessage = (ev) => {
        try { t.onMessage && t.onMessage(JSON.parse(ev.data)); } catch (e) { }
      };
      dc.onclose = () => t.onClose && t.onClose();
      dc.onopen = () => {
        t.open = true;
        openResolve && openResolve(true);
        flushQueue();
      };
      // ondatachannel 触发时常 dc 已 open, 此时再挂 onopen 不会再收到事件, 主动补一次
      if (dc.readyState === 'open') {
        t.open = true;
        openResolve && openResolve(true);
        flushQueue();
      }
    }
  };
  function flushQueue() {
    while (queue.length) {
      try { dc.send(queue.shift()); } catch (e) { break; }
    }
  }
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      openResolve && openResolve(false);
      t.onClose && t.onClose();
    }
  };
  return t;
}

// ---------- 房主端 ----------
export class HostSignaler {
  constructor({ name, cfg }) {
    this.name = name; this.cfg = cfg;
    this.slots = new Map();
    this._slot = 0;
  }
  // 创建一个邀请槽, 返回 {slot, offer} (offer 为信号对象, 由 UI 编码成二维码)
  async createSlot() {
    const slot = 's' + (++this._slot);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const dc = pc.createDataChannel('xiangqi', { ordered: true });
    const transport = dcTransport(pc, dc, slot, this.name);
    const entry = { pc, dc, transport };
    this.slots.set(slot, entry);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitGathering(pc);
    return {
      slot, transport,
      offer: { v: 1, kind: 'xq-offer', slot, name: this.name, cfg: this.cfg, sdp: pc.localDescription }
    };
  }
  // 扫到/粘贴加入者的 answer
  async feedAnswer(answer) {
    const entry = this.slots.get(answer.slot);
    if (!entry) throw new Error('没有对应的邀请槽');
    await entry.pc.setRemoteDescription(new RTCSessionDescription(answer.sdp));
    return entry.transport;
  }
  closeAll() { for (const [, e] of this.slots) { try { e.pc.close(); } catch (err) { } } this.slots.clear(); }
}

// ---------- 加入者端 ----------
export class GuestSignaler {
  constructor({ name, want = 'play' }) {
    this.name = name; this.want = want;
  }
  // 扫到/粘贴房主 offer 后, 建立连接并生成 answer 信号
  async acceptOffer(offer) {
    this.offer = offer;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    // 立即登记 pc: 若在下方任一 await 期间用户离开并 close(), 也能真正关闭在途连接, 而非空操作泄漏
    this.pc = pc;
    // 延迟绑定: answer 须先回传给房主, dc 才能在 ondatachannel 中到达
    const transport = dcTransportDeferred(pc, offer.slot, this.name);
    pc.ondatachannel = (ev) => transport._bind(ev.channel);
    await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await waitGathering(pc);
    const answer = { v: 1, kind: 'xq-answer', slot: offer.slot, name: this.name, want: this.want, sdp: pc.localDescription };
    return { transport, answer, hostName: offer.name, cfg: offer.cfg };
  }
  close() { try { this.pc && this.pc.close(); } catch (e) { } }
}

function waitGathering(pc, timeout = 3000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pc.removeEventListener('icecandidate', onIce); resolve(); }, timeout);
    const onIce = (e) => { if (e.candidate === null) { clearTimeout(timer); pc.removeEventListener('icecandidate', onIce); resolve(); } };
    pc.addEventListener('icecandidate', onIce);
  });
}
