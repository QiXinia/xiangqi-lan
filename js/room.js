// ============================================================
// 局域网房间状态机(传输无关)
// HostRoom: 房主权威(规则校验/计时/揭棋揭示/终局), 房主固定执红
// GuestRoom: 跟随房主, 收发走子与请求
// Transport 需实现: { id, name?, send(obj), onMessage, onClose, close() }
// ============================================================
import {
  createState, applyMove, legalTargetsFrom, undoMoves, serialize, restore,
  genPerm, mulberry32
} from './engine.js';

export const TIME_RULES = {
  none: { label: '不限时', base: 0, inc: 0, byo: 0 },
  '5': { label: '5分钟包干', base: 300, inc: 0, byo: 0 },
  '10': { label: '10分钟包干', base: 600, inc: 0, byo: 0 },
  '20': { label: '20分钟包干', base: 1200, inc: 0, byo: 0 },
  '5+3': { label: '5分钟+每步3秒', base: 300, inc: 3, byo: 0 },
  '10+3': { label: '10分钟+每步3秒', base: 600, inc: 3, byo: 0 },
  '10+30s': { label: '10分钟+30秒读秒', base: 600, inc: 0, byo: 30 }
};

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function randomSalt() {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}
const pk = (x, y) => `${x},${y}`;
const JIEQI_SLOTS = {
  r: ['0,9', '1,9', '2,9', '3,9', '5,9', '6,9', '7,9', '8,9', '1,7', '7,7', '0,6', '2,6', '4,6', '6,6', '8,6'],
  b: ['0,0', '1,0', '2,0', '3,0', '5,0', '6,0', '7,0', '8,0', '1,2', '7,2', '0,3', '2,3', '4,3', '6,3', '8,3']
};

function parseClock(rules) {
  const t = TIME_RULES[rules.time] || TIME_RULES.none;
  const mk = () => ({ remain: t.base * 1000, phase: 'base' });
  return { r: mk(), b: mk(), rule: t, lastTs: 0 };
}

// ============================================================
// HostRoom (房主=红方, 权威)
// ============================================================
export class HostRoom {
  constructor({ name = '房主', rules = { jieqi: false, time: '10' } } = {}) {
    this.hostName = name;
    this.rules = rules;
    this.hostColor = 'r';
    this.peers = new Map();
    this.seats = { r: { id: '__host__', name }, b: null };
    this.state = null;
    this.started = false;
    this.over = false;
    this.clock = null;
    this.evt = [];
    this.jieqi = !!rules.jieqi;
    this.permB = null; this.saltB = null; this.commitB = null;
    this.commitR = null;
    this.pendingReveal = null;
    this.undoPending = false;
    this.drawPending = false;
    this.offlineMs = 90000;
    this._idc = 0;
    this.dead = false;
  }
  onEvent(cb) { this.evt.push(cb); }
  emit(type, data = {}) { if (this.dead) return; for (const cb of this.evt) cb({ type, ...data }); }
  nextId() { return 'p' + (++this._idc); }
  // 房主主动离开/会话销毁: 摘除所有 peer 传输回调与监听, 此后 close/消息不再驱动对局
  destroy() {
    this.dead = true;
    for (const p of this.peers.values()) {
      try { if (p.transport) { p.transport.onMessage = null; p.transport.onClose = null; } } catch (e) { }
    }
    this.evt.length = 0;
  }

  addTransport(transport) {
    const id = transport.id || (transport.id = this.nextId());
    transport.onMessage = (msg) => this.handle(id, msg);
    transport.onClose = () => this.onPeerClose(id);
    this.peers.set(id, { transport, name: transport.name || '棋友', role: null, online: true, deadline: 0, want: 'play' });
    transport.send({ type: 'helloAck', id, hostName: this.hostName, room: { rules: this.rules, started: this.started } });
    this.emitPeers();
    return id;
  }
  emitPeers() {
    const list = [...this.peers.values()].map(p => ({ name: p.name, role: p.role, online: p.online }));
    this.emit('peers', { peers: list });
  }

  handle(id, msg) {
    const peer = this.peers.get(id);
    if (!peer) return;
    switch (msg.type) {
      case 'hello': {
        if (msg.reconnect) {
          const entry = [...this.peers.entries()].find(([, p]) => p.name === msg.name && !p.online && (p.role === 'r' || p.role === 'b'));
          if (entry) { this.reconnect(entry[0], id, peer); return; }
        }
        peer.name = msg.name || peer.name;
        peer.want = msg.want || 'play';
        this.emitPeers();
        if (this.started) this.acceptJoin(id, 'spec');
        else this.emit('challenge', { peerId: id, name: peer.name, want: peer.want });
        break;
      }
      case 'jieqiReady':
        this.commitR = msg.commit;
        this.beginGame();
        break;
      case 'move': {
        if (!this.started || this.over || this.state.status !== 'playing') return;
        if (!this.seats.b || this.seats.b.id !== id) return;
        this.guestMove(id, msg.from, msg.to);
        break;
      }
      case 'reveal': {
        if (this.pendingReveal && this.pendingReveal.peerId === id) {
          const pr = this.pendingReveal; this.pendingReveal = null;
          this.hostDoMove(pr.from, pr.to, msg.t);
        }
        break;
      }
      case 'undoReq':
        if (this.over) break;
        this.undoPending = true;
        this.emit('undoPending', { name: peer.name, fromPeer: id });
        break;
      case 'undoReply':
        if (this.undoPending && id === this.seats.b.id) {
          this.undoPending = false;
          if (msg.agree) this.doUndo();
          else this.emit('undoDeclined', { name: peer.name });
        }
        break;
      case 'drawReq':
        if (this.over) break;
        this.drawPending = true;
        this.emit('drawPending', { name: peer.name, fromPeer: id });
        break;
      case 'drawReply':
        if (this.drawPending && id === this.seats.b.id) {
          this.drawPending = false;
          if (msg.agree) this.endGame('draw', 'agreement');
          else this.emit('drawDeclined', { name: peer.name });
        }
        break;
      case 'resign':
        if (!this.over) this.endGame('redwin', 'resign'); // 黑方认输
        break;
      case 'revealAll': {
        // 终局: guest(黑) 公开红方排列, host 校验其承诺
        sha256(msg.salt + JSON.stringify(msg.perm)).then(h => {
          if (this.dead) return;
          const valid = (h === this.commitR);
          this.emit('revealAll', { side: msg.side, salt: msg.salt, perm: msg.perm, valid });
        });
        break;
      }
      case 'chat': {
        const payload = { type: 'chat', name: peer.name, role: peer.role, text: String(msg.text || '').slice(0, 80), ts: Date.now() };
        this.broadcast(payload, id); // 不回发发送者(其本地自行显示)
        this.emit('chat', payload);
        break;
      }
    }
  }

  reconnect(oldId, newId, newPeer) {
    const old = this.peers.get(oldId);
    const role = old.role;
    old.transport = newPeer.transport;
    old.online = true; old.deadline = 0;
    this.peers.delete(newId);
    old.transport.onMessage = (m) => this.handle(oldId, m);
    old.transport.onClose = () => this.onPeerClose(oldId);
    this.peers.set(oldId, old);
    old.transport.send({ type: 'reconnected', role });
    if (this.started) old.transport.send({ type: 'snapshot', state: this.viewFor(role), clock: this.clockView(), seat: role, rules: this.rules });
    this.emitPeers();
    this.broadcast({ type: 'peerBack', name: old.name });
  }

  onPeerClose(id) {
    if (this.dead) return;
    const peer = this.peers.get(id);
    if (!peer || !peer.online) return;
    peer.online = false; peer.deadline = Date.now() + this.offlineMs;
    this.broadcast({ type: 'peerOffline', name: peer.name, deadline: peer.deadline });
    this.emit('peerOffline', { name: peer.name, deadline: peer.deadline });
    this.emitPeers();
  }

  acceptJoin(id, role) {
    const peer = this.peers.get(id);
    if (!peer || peer.role) return;
    if (role === 'spec' || (role === 'b' && this.seats.b)) {
      peer.role = 'spec';
      peer.transport.send({ type: 'joined', role: 'spec', rules: this.rules });
      if (this.started) peer.transport.send({ type: 'snapshot', state: this.viewFor('spec'), clock: this.clockView(), seat: 'spec', rules: this.rules });
      this.emitPeers();
      this.broadcast({ type: 'specIn', name: peer.name });
      return;
    }
    peer.role = 'b';
    this.seats.b = { id, name: peer.name };
    peer.transport.send({ type: 'joined', role: 'b', rules: this.rules });
    this.emitPeers();
    if (this.jieqi) {
      const rng = mulberry32((Math.random() * 4294967296) >>> 0);
      this.permB = genPerm('b', rng);
      this.saltB = randomSalt();
      sha256(this.saltB + JSON.stringify(this.permB)).then(commit => {
        if (this.dead || this.commitB !== null) return;
        this.commitB = commit;
        peer.transport.send({ type: 'jieqiBegin', commit, yourSide: 'b' });
      });
    } else this.beginGame();
  }
  declineJoin(id, reason) {
    const peer = this.peers.get(id);
    if (peer) { peer.transport.send({ type: 'joinDeclined', reason }); }
    this.emitPeers();
  }

  beginGame() {
    if (this.started) return;
    let perms = null;
    if (this.jieqi) {
      const unk = (c) => Object.fromEntries(JIEQI_SLOTS[c].map(k => [k, '?']));
      perms = { r: unk('r'), b: unk('b') };
      Object.assign(perms.b, this.permB); // host 持有黑方排列(仅用于揭示, UI 不显示)
    }
    this.state = createState(this.jieqi ? { jieqi: true, perms } : {});
    this.clock = parseClock(this.rules);
    this.clock.lastTs = Date.now();
    this.started = true; this.over = false;
    const guestId = this.seats.b && this.seats.b.id;
    if (guestId && this.peers.has(guestId)) {
      this.peers.get(guestId).transport.send({
        type: 'startGame', rules: this.rules,
        state: this.viewFor('b'), clock: this.clockView(), seat: 'b', hostColor: 'r'
      });
    }
    this.emit('startGame', { state: this.state, seat: 'r' });
  }

  isLegal(from, to) {
    return legalTargetsFrom(this.state, from[0], from[1]).some(t => t[0] === to[0] && t[1] === to[1]);
  }
  localMove(from, to) {
    if (!this.started || this.over || this.state.status !== 'playing') return { ok: false };
    if (this.state.turn !== 'r') return { ok: false };
    if (!this.isLegal(from, to)) return { ok: false, illegal: true };
    const piece = this.state.board[from[1]][from[0]];
    if (this.jieqi && piece.hidden && piece.t === '?') {
      const opp = this.seats.b && this.peers.get(this.seats.b.id);
      if (opp) {
        this.pendingReveal = { from, to, peerId: this.seats.b.id };
        opp.transport.send({ type: 'needReveal', from, to });
        return { ok: true, pending: true };
      }
    }
    this.hostDoMove(from, to, null);
    return { ok: true };
  }
  hostDoMove(from, to, revealT) {
    const m = applyMove(this.state, from, to, revealT ? { revealT } : {});
    this.afterMove('r', m);
  }
  guestMove(id, from, to) {
    const peer = this.peers.get(id);
    if (this.state.turn !== 'b') return;
    if (!this.isLegal(from, to)) { peer.transport.send({ type: 'illegalMove' }); return; }
    let revealT = null;
    const piece = this.state.board[from[1]][from[0]];
    if (this.jieqi && piece.hidden && this.permB) revealT = this.permB[pk(from[0], from[1])];
    const m = applyMove(this.state, from, to, revealT ? { revealT } : {});
    this.afterMove('b', m);
  }
  afterMove(side, m) {
    const ended = this.state.status !== 'playing';
    this.settleClock(side, ended);
    const payload = {
      type: 'move', actor: side, from: m.from, to: m.to,
      reveal: m.reveal, capturedHidden: m.captured ? m.captured.hidden : false,
      notation: m.notation, check: !!m.check, ts: Date.now(),
      status: this.state.status, reason: this.state.reason, clock: this.clockView()
    };
    this.broadcast(payload);
    this.emit('move', { side, move: m });
    if (ended) this.endGame(this.state.status, this.state.reason);
  }
  // 走子方按钟
  settleClock(side, ended) {
    if (!this.clock || !this.clock.rule.base) return;
    const now = Date.now();
    const c = this.clock[side];
    const elapsed = now - this.clock.lastTs;
    this.clock.lastTs = now;
    if (c.phase === 'byo') { c.remain = this.clock.rule.byo * 1000; return; }
    c.remain -= elapsed;
    if (this.clock.rule.inc) c.remain += this.clock.rule.inc * 1000;
    if (c.remain <= 0) {
      if (this.clock.rule.byo) { c.phase = 'byo'; c.remain = this.clock.rule.byo * 1000; }
      else if (!ended) { c.remain = 0; this.endGame(side === 'r' ? 'blackwin' : 'redwin', 'timeout'); }
      else c.remain = 0;
    }
  }
  // UI 定时调用(约每 250ms); 推进当前行棋方时钟, 处理超时/断线判负
  tick(now = Date.now()) {
    if (!this.started || this.over || !this.clock) return;
    if (this.clock.rule.base && this.state.status === 'playing') {
      const side = this.state.turn;
      const c = this.clock[side];
      const elapsed = now - this.clock.lastTs;
      this.clock.lastTs = now;
      c.remain -= elapsed;
      if (c.remain <= 0) {
        if (c.phase === 'base' && this.clock.rule.byo) {
          c.phase = 'byo'; c.remain = this.clock.rule.byo * 1000;
          this.broadcast({ type: 'clock', clock: this.clockView() });
        } else {
          c.remain = 0; this.endGame(side === 'r' ? 'blackwin' : 'redwin', 'timeout'); return;
        }
      }
    }
    for (const [, p] of this.peers) {
      if ((p.role === 'r' || p.role === 'b') && !p.online && now > p.deadline) {
        this.endGame(p.role === 'r' ? 'blackwin' : 'redwin', 'offline');
      }
    }
  }
  clockView() { return this.clock ? JSON.parse(JSON.stringify(this.clock)) : null; }

  replyUndo(agree) {
    if (!this.undoPending) return;
    this.undoPending = false;
    const p = this.peers.get(this.seats.b.id);
    if (agree) { this.doUndo(); if (p) p.transport.send({ type: 'undoReply', agree: true }); }
    else if (p) p.transport.send({ type: 'undoReply', agree: false });
  }
  replyDraw(agree) {
    if (!this.drawPending) return;
    this.drawPending = false;
    const p = this.peers.get(this.seats.b.id);
    if (agree) this.endGame('draw', 'agreement');
    else if (p) p.transport.send({ type: 'drawReply', agree: false });
  }
  doUndo() {
    const n = Math.min(2, this.state.moves.length);
    undoMoves(this.state, n);
    this.over = false;
    this.broadcast({ type: 'snapshot', state: this.viewFor('b'), clock: this.clockView(), seat: 'b', rules: this.rules });
    this.emit('undo', {});
  }
  localUndoReq() {
    const p = this.peers.get(this.seats.b.id);
    if (p) { this.undoPending = true; p.transport.send({ type: 'undoReq', name: this.hostName }); }
  }
  localDrawReq() {
    const p = this.peers.get(this.seats.b.id);
    if (p) { this.drawPending = true; p.transport.send({ type: 'drawReq', name: this.hostName }); }
  }
  localResign() { if (!this.over) this.endGame('blackwin', 'resign'); }
  sendChat(text) {
    const payload = { type: 'chat', name: this.hostName, role: 'r', text: String(text || '').slice(0, 80), ts: Date.now() };
    this.broadcast(payload);
    this.emit('chat', payload);
  }

  endGame(status, reason) {
    if (this.over) return;
    this.over = true;
    if (this.state) { this.state.status = status; this.state.reason = reason; }
    const msg = { type: 'end', status, reason, clock: this.clockView() };
    if (this.jieqi && this.saltB) { msg.revealHost = { salt: this.saltB, perm: this.permB }; msg.wantReveal = true; }
    this.broadcast(msg);
    this.emit('end', { status, reason });
  }

  broadcast(msg, exceptId) {
    for (const [id, p] of this.peers) {
      if (id === exceptId) continue;
      try { p.transport.send(msg); } catch (e) { }
    }
  }
  // 按视角序列化: 玩家看不到己方未翻暗子; 观战者所有暗子不可见
  viewFor(role) {
    const data = serialize(this.state);
    const hide = (pc) => { if (pc[4]) pc[3] = '?'; };
    if (role === 'spec') {
      for (const pc of data.pieces) hide(pc);
      if (data.initialPerms) { data.initialPerms.r = {}; data.initialPerms.b = {}; for (const k of JIEQI_SLOTS.r) data.initialPerms.r[k] = '?'; for (const k of JIEQI_SLOTS.b) data.initialPerms.b[k] = '?'; }
    } else if (role === 'b') {
      for (const pc of data.pieces) if (pc[4] && pc[2] === 'b') pc[3] = '?';
      if (data.initialPerms) for (const k of JIEQI_SLOTS.b) data.initialPerms.b[k] = '?';
    }
    return data;
  }
}

// ============================================================
// GuestRoom (加入者=黑方或观战者)
// ============================================================
export class GuestRoom {
  constructor(transport, { name = '棋友', want = 'play' } = {}) {
    this.transport = transport;
    this.name = name;
    this.want = want;
    this.state = null;
    this.seat = null;
    this.rules = null;
    this.clock = null;
    this.hostName = '';
    this.mySide = null;       // 'b' (对战) 或 'spec'
    this.permOpp = null;     // 我为对手方生成的排列(我执黑 => 红方排列)
    this.saltOpp = null; this.commitOpp = null;
    this.commitHost = null;  // host 对黑方排列的承诺
    this.evt = [];
    this.dead = false;
    transport.onMessage = (m) => { if (!this.dead) this.handle(m).catch(e => this.emit('error', { message: String(e) })); };
    // 本端主动 destroy 后, 底层 pc 异步转为 closed 不再对外发"房间已解散"(那是对端掉线才应提示)
    transport.onClose = () => { if (!this.dead) this.emit('closed', {}); };
    transport.send({ type: 'hello', name, want });
  }
  onEvent(cb) { this.evt.push(cb); }
  emit(type, data = {}) { if (this.dead) return; for (const cb of this.evt) cb({ type, ...data }); }
  send(o) { if (this.dead) return; try { this.transport.send(o); } catch (e) { } }
  // 主动离开/会话销毁: 摘除传输回调与全部监听, 使此后的异步 close/消息不再驱动已销毁的对局
  destroy() {
    this.dead = true;
    try { if (this.transport) { this.transport.onMessage = null; this.transport.onClose = null; } } catch (e) { }
    this.evt.length = 0;
  }

  async handle(m) {
    switch (m.type) {
      case 'helloAck':
        this.hostName = m.hostName; this.rules = m.room.rules;
        this.emit('helloAck', m);
        break;
      case 'joined':
        this.seat = m.role; this.mySide = m.role;
        this.emit('joined', m);
        break;
      case 'joinDeclined':
        this.emit('joinDeclined', m); break;
      case 'jieqiBegin': {
        this.commitHost = m.commit;
        const oppSide = m.yourSide === 'b' ? 'r' : 'b';
        const rng = mulberry32((Math.random() * 4294967296) >>> 0);
        this.permOpp = genPerm(oppSide, rng);
        this.saltOpp = randomSalt();
        this.commitOpp = await sha256(this.saltOpp + JSON.stringify(this.permOpp));
        if (this.dead) return;
        this.send({ type: 'jieqiReady', commit: this.commitOpp });
        break;
      }
      case 'startGame':
      case 'snapshot': {
        this.seat = m.seat || this.seat;
        this.rules = m.rules || this.rules;
        this.clock = m.clock;
        if (this.rules && this.rules.jieqi && this.permOpp) {
          const oppSide = this.mySide === 'b' ? 'r' : 'b';
          m.state.initialPerms = m.state.initialPerms || { r: {}, b: {} };
          if (this.mySide !== 'spec') Object.assign(m.state.initialPerms[oppSide], this.permOpp);
        }
        this.state = restore(m.state);
        this.emit('snapshot', { state: this.state, seat: this.seat, start: m.type === 'startGame' });
        break;
      }
      case 'move': {
        if (!this.state) break;
        const revealT = m.reveal ? m.reveal.t : null;
        const mv = applyMove(this.state, m.from, m.to, revealT ? { revealT } : {});
        this.clock = m.clock;
        this.emit('move', { side: m.actor, move: mv, raw: m });
        if (m.status !== 'playing') { this.state.status = m.status; this.state.reason = m.reason; this.emit('end', { status: m.status, reason: m.reason }); }
        break;
      }
      case 'needReveal': {
        const t = this.permOpp ? this.permOpp[pk(m.from[0], m.from[1])] : null;
        this.send({ type: 'reveal', from: m.from, to: m.to, t });
        break;
      }
      case 'undoReq': this.emit('undoPending', m); break;
      case 'undoReply': this.emit('undoReply', m); break;
      case 'undoDeclined': this.emit('undoDeclined', m); break;
      case 'drawReq': this.emit('drawPending', m); break;
      case 'drawReply': this.emit('drawReply', m); break;
      case 'drawDeclined': this.emit('drawDeclined', m); break;
      case 'end': {
        let hostValid = null;
        if (m.revealHost) {
          const h = await sha256(m.revealHost.salt + JSON.stringify(m.revealHost.perm));
          if (this.dead) return; // await 期间房间已销毁, 不再写状态/发终局
          hostValid = (h === this.commitHost);
          if (hostValid && this.state) { // 公开对方排列, 供复盘揭示
            this.state.initialPerms = this.state.initialPerms || { r: {}, b: {} };
            Object.assign(this.state.initialPerms.b, m.revealHost.perm);
          }
        }
        if (this.state) { this.state.status = m.status; this.state.reason = m.reason; }
        this.emit('end', { ...m, hostValid });
        if (m.wantReveal && this.saltOpp) {
          this.send({ type: 'revealAll', side: this.mySide === 'b' ? 'r' : 'b', salt: this.saltOpp, perm: this.permOpp });
        }
        break;
      }
      case 'revealAll':
        this.emit('revealAll', m); break;
      case 'chat': this.emit('chat', m); break;
      case 'peerOffline': this.emit('peerOffline', m); break;
      case 'peerBack': this.emit('peerBack', m); break;
      case 'specIn': this.emit('specIn', m); break;
      case 'reconnected':
        this.seat = m.role; this.mySide = m.role; this.emit('reconnected', m); break;
      case 'illegalMove': this.emit('illegalMove', m); break;
      case 'clock': this.clock = m.clock; this.emit('clock', m); break;
      default: this.emit('message', m);
    }
  }

  localMove(from, to) {
    if (!this.state || this.state.status !== 'playing' || this.seat !== 'b') return { ok: false };
    if (this.state.turn !== 'b') return { ok: false };
    const legal = legalTargetsFrom(this.state, from[0], from[1]).some(t => t[0] === to[0] && t[1] === to[1]);
    if (!legal) return { ok: false, illegal: true };
    this.send({ type: 'move', from, to });
    return { ok: true, waiting: true };
  }
  replyUndo(agree) { this.send({ type: 'undoReply', agree }); }
  replyDraw(agree) { this.send({ type: 'drawReply', agree }); }
  undoReq() { this.send({ type: 'undoReq' }); }
  drawReq() { this.send({ type: 'drawReq' }); }
  resign() { this.send({ type: 'resign' }); }
  sendChat(text) { this.send({ type: 'chat', text: String(text || '').slice(0, 80) }); }
}

// Loopback 传输对(自动化测试用)
export function loopbackPair() {
  let a2b = [], b2a = [];
  const flush = () => {
    const aa = a2b; a2b = []; for (const o of aa) b.onMessage && b.onMessage(o);
    const bb = b2a; b2a = []; for (const o of bb) a.onMessage && a.onMessage(o);
  };
  const a = { id: 'la', name: 'A', send(o) { a2b.push(JSON.parse(JSON.stringify(o))); queueMicrotask(flush); }, onMessage: null, onClose: null, close() { b.onClose && b.onClose(); } };
  const b = { id: 'lb', name: 'B', send(o) { b2a.push(JSON.parse(JSON.stringify(o))); queueMicrotask(flush); }, onMessage: null, onClose: null, close() { a.onClose && a.onClose(); } };
  return [a, b];
}
