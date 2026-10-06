// 断线重连后 快照回放一致性 + 观战快照隔离 测试: node test/net-resync.test.mjs
import { HostRoom, GuestRoom } from '../js/room.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// 一对直连传输
function pair(name) {
  const x = { id: 'h_' + name, name };
  const y = { id: 'g_' + name, name };
  x.send = (o) => queueMicrotask(() => y.onMessage && y.onMessage(JSON.parse(JSON.stringify(o))));
  y.send = (o) => queueMicrotask(() => x.onMessage && x.onMessage(JSON.parse(JSON.stringify(o))));
  let cx = false, cy = false;
  x.close = () => { if (!cy) { cy = true; y.onClose && y.onClose(); } };
  y.close = () => { if (!cx) { cx = true; x.onClose && x.onClose(); } };
  return [x, y];
}

// 棋盘可见性一致(忽略未翻暗子真身)
function boardsAgree(h, g) {
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const a = h.state.board[y][x], b = g.state.board[y][x];
    if (!a && !b) continue;
    if (!a || !b) return `棋子存在性不一致 @${x},${y}`;
    if (a.c !== b.c) return `颜色不一致 @${x},${y}`;
    if (a.hidden !== b.hidden) return `翻开状态不一致 @${x},${y}`;
    if (!a.hidden && a.t !== b.t) return `明子类型不一致 @${x},${y}`;
  }
  if (h.state.turn !== g.state.turn) return '轮次不一致';
  if (h.state.moves.length !== g.state.moves.length) return '着法数不一致';
  return null;
}

async function setupClassic() {
  const host = new HostRoom({ name: '房主', rules: { jieqi: false, time: 'none' } });
  const [t1, t2] = pair('小黑');
  let ch = null;
  host.onEvent(e => { if (e.type === 'challenge') ch = e; });
  host.addTransport(t1);
  const guest = new GuestRoom(t2, { name: '小黑', want: 'play' });
  await wait(5);
  host.acceptJoin(ch.peerId, 'b');
  await wait(10);
  return { host, guest, t1, t2 };
}

// ---------- 1. 断线重连: 凭令牌找回席位, 快照回放后双方局面一致 ----------
{
  const { host, guest } = await setupClassic();
  // 双方各走几手(沿用 room.test 已验证合法的开局)
  host.localMove([7, 7], [4, 7]); await wait(5);   // 红炮二平五(横移)
  guest.localMove([1, 0], [2, 2]); await wait(5);  // 黑马 8进7
  host.localMove([2, 6], [2, 5]); await wait(5);   // 红三兵进一
  guest.localMove([7, 0], [6, 2]); await wait(5);  // 另一黑马 7进6(马腿空)
  const beforeMoves = host.state.moves.length;
  ok(beforeMoves >= 4, `对局进行中(${beforeMoves} 手)`);

  const token = guest.peerToken;
  ok(!!token, 'guest 从 helloAck 拿到重连令牌: ' + token);

  // 模拟网络中断: 突兀关闭 guest 传输(不发 bye)
  guest.transport.close();
  await wait(10);
  const blackPeer = [...host.peers.values()].find(p => p.role === 'b');
  ok(blackPeer && !blackPeer.online, 'host 检测到黑方断线(待重连)');

  // 重连: 新传输 + GuestRoom(reconnect, token)
  const [t3, t4] = pair('小黑-重连');
  host.addTransport(t3);
  const reGuest = new GuestRoom(t4, { name: '小黑', want: 'play', reconnect: true, peerToken: token });
  let gotSnap = false;
  reGuest.onEvent(e => { if (e.type === 'snapshot') gotSnap = true; });
  await wait(20);

  ok(gotSnap, '重连后 guest 收到完整局面快照');
  ok(reGuest.state && reGuest.state.moves.length === beforeMoves, '快照回放后着法数与断线前一致');
  const dis = boardsAgree(host, reGuest);
  ok(!dis, '重连回放后 host/guest 局面完全一致' + (dis ? ': ' + dis : ''));
  ok(reGuest.mySide === 'b' || reGuest.seat === 'b', '重连后仍执黑(席位恢复)');
}

// ---------- 2. 主动离开(bye) vs 网络中断: 房主收到 bye 立即按"对方离开"结算 ----------
{
  const host = new HostRoom({ name: '房主', rules: { jieqi: false, time: 'none' } });
  const [t1, t2] = pair('小黑');
  let ch = null, leftEv = null;
  host.onEvent(e => { if (e.type === 'challenge') ch = e; if (e.type === 'peerLeft') leftEv = e; });
  host.addTransport(t1);
  const guest = new GuestRoom(t2, { name: '小黑', want: 'play' });
  await wait(5);
  host.acceptJoin(ch.peerId, 'b');
  await wait(10);
  ok(host.state.status === 'playing', '对局进行中');

  guest.leave();           // 主动离开, 发 bye
  await wait(10);
  ok(!!leftEv && leftEv.role === 'b', 'host 区分到: 黑方主动离开(peerLeft)');
  ok(host.state.status === 'redwin' && host.state.reason === 'left', '对方主动离开 -> 立即结算红胜, 不等 90s');
}

// ---------- 3. 观战者: 对局进行中进入, 拿到快照并同步后续着法 ----------
{
  const host = new HostRoom({ name: '房主', rules: { jieqi: false, time: 'none' } });
  const [t1, t2] = pair('小黑');
  let ch = null;
  host.onEvent(e => { if (e.type === 'challenge') ch = e; });
  host.addTransport(t1);
  const guest = new GuestRoom(t2, { name: '小黑', want: 'play' });
  await wait(5);
  host.acceptJoin(ch.peerId, 'b');
  await wait(10);
  host.localMove([1, 2], [2, 0]); await wait(5);

  // 观战者后加入
  const [s1, s2] = pair('看客');
  const spec = new GuestRoom(s2, { name: '看客', want: 'watch' });
  host.addTransport(s1);
  await wait(10);
  ok(spec.seat === 'spec', '观战者席位 = spec');
  ok(!!spec.state, '观战者拿到当前完整棋局快照');
  ok(spec.state.moves.length === host.state.moves.length, '观战者着法数与房主一致');

  // 后续着法同步给观战者
  guest.localMove([7, 0], [6, 2]); await wait(10);
  ok(spec.state.moves.length === host.state.moves.length, '观战者实时同步后续着法');
  const dis = boardsAgree(host, spec);
  ok(!dis, '观战者与房主局面一致' + (dis ? ': ' + dis : ''));
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
