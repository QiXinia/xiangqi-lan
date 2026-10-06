// 房间状态机 loopback 测试: node test/room.test.mjs
import { HostRoom, GuestRoom } from '../js/room.js';
import { searchBestMove } from '../js/ai.js';
import * as E from '../js/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function pair(name) {
  const x = { id: 'h_' + name, name: 'hostSide' };
  const y = { id: 'g_' + name, name };
  x.send = (o) => queueMicrotask(() => y.onMessage && y.onMessage(JSON.parse(JSON.stringify(o))));
  y.send = (o) => queueMicrotask(() => x.onMessage && x.onMessage(JSON.parse(JSON.stringify(o))));
  let closedX = false, closedY = false;
  x.close = () => { if (!closedY) { closedY = true; y.onClose && y.onClose(); } };
  y.close = () => { if (!closedX) { closedX = true; x.onClose && x.onClose(); } };
  return [x, y];
}

async function setupRoom(rules = { jieqi: false, time: 'none' }, guestWant = 'play') {
  const host = new HostRoom({ name: '房主小红', rules });
  const [t1, t2] = pair('小黑');
  let challenge = null;
  host.onEvent(e => { if (e.type === 'challenge') challenge = e; });
  host.addTransport(t1);
  const guest = new GuestRoom(t2, { name: '小黑', want: guestWant });
  await wait(5);
  host.acceptJoin(challenge.peerId, guestWant === 'watch' ? 'spec' : 'b');
  await wait(10);
  return { host, guest, challenge };
}

// 双方可见明子布局一致性(忽略未翻暗子真身)
function boardsAgree(h, g) {
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const a = h.state.board[y][x], b = g.state.board[y][x];
    if (!a && !b) continue;
    if (!a || !b) return `棋子存在性不一致 @${x},${y}`;
    if (a.c !== b.c) return `颜色不一致 @${x},${y}`;
    if (a.hidden !== b.hidden) return `翻开状态不一致 @${x},${y}`;
    if (!a.hidden && a.t !== b.t) return `明子类型不一致 @${x},${y}: ${a.t} vs ${b.t}`;
  }
  if (h.state.turn !== g.state.turn) return '轮次不一致';
  if (h.state.moves.length !== g.state.moves.length) return '着法数不一致';
  return null;
}

// 揭棋用加权随机着法(偏好吃子), 不依赖 AI 全知假设
function pickRandomMove(st) {
  const ms = E.legalMoves(st, st.turn);
  if (!ms.length) return null;
  const caps = ms.filter(m => st.board[m.to[1]][m.to[0]]);
  if (caps.length && Math.random() < 0.6) return caps[Math.floor(Math.random() * caps.length)];
  return ms[Math.floor(Math.random() * ms.length)];
}

async function aiGame(rules, maxMoves = 160) {
  const { host, guest } = await setupRoom(rules);
  ok(!!host.state && !!guest.state, '对局开始, 双方均拿到局面');
  const jieqi = !!rules.jieqi;
  let log = [];
  for (let i = 0; i < maxMoves && host.state.status === 'playing'; i++) {
    const isHost = host.state.turn === 'r';
    const st = isHost ? host.state : guest.state;
    const mv = jieqi ? pickRandomMove(st) : searchBestMove(st, { level: 2, deadline: Date.now() + 1500 });
    if (!mv) break;
    log.push((isHost ? '红' : '黑') + (jieqi ? '' : E.moveNotation(st, mv.from, mv.to)));
    const r = isHost ? host.localMove(mv.from, mv.to) : guest.localMove(mv.from, mv.to);
    if (!r.ok) { ok(false, '着法被拒 ' + JSON.stringify(mv)); break; }
    await wait(jieqi ? 40 : 30);
    const dis = boardsAgree(host, guest);
    if (dis) { ok(false, '双方局面不一致: ' + dis); break; }
  }
  return { host, guest, log };
}

// ---------- 1. 经典联机对局 ----------
{
  const { host, guest } = await aiGame({ jieqi: false, time: 'none' });
  console.log('经典对局:', host.state.moves.length, '手, 结果:', host.state.status, host.state.reason);
  ok(host.state.status !== 'playing', '经典对局分出胜负 (' + host.state.status + '/' + host.state.reason + ')');
  ok(host.state.status === guest.state.status, '双方终局状态一致');
  ok(host.state.moves.length === guest.state.moves.length, '双方着法数一致');
}

// ---------- 2a. 揭棋开局: 双方互不知对方持有的暗子 ----------
{
  const { host, guest } = await setupRoom({ jieqi: true, time: 'none' });
  let hostUnknownRed = 0, guestKnownRed = 0, guestUnknownBlack = 0, hostKnownBlack = 0;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const h = host.state.board[y][x], g = guest.state.board[y][x];
    if (h && h.hidden && h.c === 'r') { if (h.t === '?') hostUnknownRed++; }
    if (h && h.hidden && h.c === 'b') { if (h.t && h.t !== '?') hostKnownBlack++; }
    if (g && g.hidden && g.c === 'r') { if (g.t && g.t !== '?') guestKnownRed++; }
    if (g && g.hidden && g.c === 'b') { if (g.t === '?') guestUnknownBlack++; }
  }
  ok(hostUnknownRed === 15, 'host 视角 15 个红方暗子全部未知');
  ok(guestUnknownBlack === 15, 'guest 视角 15 个黑方暗子全部未知');
  ok(hostKnownBlack === 15 && guestKnownRed === 15, '双方各自持有对方暗子排列(仅用于揭示, UI 不显示)');
}

// ---------- 2b. 揭棋对局: 翻开同步与被吃暗子信息隔离 ----------
{
  const { host, guest } = await aiGame({ jieqi: true, time: 'none' }, 220);
  console.log('揭棋对局:', host.state.moves.length, '手, 结果:', host.state.status, host.state.reason);
  ok(host.state.status === guest.state.status, '揭棋终局状态一致 (' + host.state.status + '/' + host.state.reason + ')');
  // 被吃暗子可见性: 红吃黑(host 可见/guest 不可见), 黑吃红(guest 可见/host 不可见)
  const redAteDark = host.state.captured.r.filter(c => c.hidden);
  const blackAteDark = host.state.captured.b.filter(c => c.hidden);
  console.log('红吃暗子数:', redAteDark.length, ' 黑吃暗子数:', blackAteDark.length);
  if (redAteDark.length) {
    ok(redAteDark.every(c => c.t && c.t !== '?'), '红方吃黑暗子: host(吃子方)可见真身');
    const gRedAte = guest.state.captured.r.filter(c => c.hidden);
    ok(gRedAte.every(c => c.t === '?'), '红方吃黑暗子: guest(被吃方)不可见真身');
  }
  if (blackAteDark.length) {
    ok(blackAteDark.every(c => c.t === '?'), '黑方吃红暗子: host(被吃方)不可见真身');
    const gBlackAte = guest.state.captured.b.filter(c => c.hidden);
    ok(gBlackAte.every(c => c.t && c.t !== '?'), '黑方吃红暗子: guest(吃子方)可见真身');
  }
  ok(redAteDark.length + blackAteDark.length > 0, '揭棋对局中出现了暗子吃子(可见性规则被检验)');
}

// ---------- 3. 悔棋 ----------
{
  const { host, guest } = await setupRoom({ jieqi: false, time: 'none' });
  // 红走炮二平五 (7,7)->(4,7)? 红视角中炮: (4,6)兵挡住, 炮(7,7)->(4,7) 横移
  host.localMove([7, 7], [4, 7]); await wait(10);
  // 黑走马8进7: (1,0)马 -> (2,2)
  guest.localMove([1, 0], [2, 2]); await wait(10);
  const before = host.state.moves.length;
  host.localUndoReq(); await wait(10);
  guest.replyUndo(true); await wait(10);
  ok(host.state.moves.length === before - 2, 'host 侧悔棋 2 手');
  ok(guest.state.moves.length === before - 2, 'guest 侧同步悔棋 2 手');
  const dis = boardsAgree(host, guest);
  ok(!dis, '悔棋后双方局面一致' + (dis ? ': ' + dis : ''));
}

// ---------- 4. 求和 / 认输 ----------
{
  const { host, guest } = await setupRoom({ jieqi: false, time: 'none' });
  guest.drawReq(); await wait(10);
  host.replyDraw(true); await wait(10);
  ok(host.state.status === 'draw' && guest.state.status === 'draw', '双方同意和棋');
}
{
  const { host, guest } = await setupRoom({ jieqi: false, time: 'none' });
  guest.resign(); await wait(10);
  ok(host.state.status === 'redwin' && host.state.reason === 'resign', '黑方认输, 红胜');
  ok(guest.state.status === 'redwin', 'guest 收到认输结果');
}

// ---------- 5. 超时判负 ----------
{
  const { host } = await setupRoom({ jieqi: false, time: '10' });
  host.clock.r.remain = 50;
  host.tick(Date.now() + 60);
  ok(host.state.status === 'blackwin' && host.state.reason === 'timeout', '红方超时判负');
}

// ---------- 6. 断线判负 ----------
{
  const { host, guest } = await setupRoom({ jieqi: false, time: 'none' });
  guest.transport.close(); await wait(10);
  const blackPeer = [...host.peers.values()].find(p => p.role === 'b');
  ok(blackPeer && !blackPeer.online, '检测到对手断线');
  host.tick(Date.now() + 95000);
  ok(host.state.status === 'redwin' && host.state.reason === 'offline', '断线超时判负');
}

// ---------- 7. 观战者视角(揭棋: 暗子全不可见) ----------
{
  const host = new HostRoom({ name: '房主', rules: { jieqi: true, time: 'none' } });
  const [t1, t2] = pair('小黑');
  let ch = null;
  host.onEvent(e => { if (e.type === 'challenge') ch = e; });
  host.addTransport(t1);
  const guest = new GuestRoom(t2, { name: '小黑', want: 'play' });
  await wait(5);
  host.acceptJoin(ch.peerId, 'b'); await wait(15);

  // 观战者(对局进行中加入, host 自动按观战接纳)
  const [s1, s2] = pair('看客');
  let specMsg = [];
  host.addTransport(s1);
  s2.onMessage = (m) => { specMsg.push(m); };
  s2.send({ type: 'hello', name: '看客', want: 'watch' });
  await wait(15);
  const snap = specMsg.find(m => m.type === 'snapshot');
  ok(!!snap, '观战者收到局面快照');
  const hiddenPieces = snap.state.pieces.filter(p => p[4]);
  ok(hiddenPieces.length === 30 && hiddenPieces.every(p => p[3] === '?'), '观战者视角 30 个暗子全部未知');
  const ip = snap.state.initialPerms;
  ok([...Object.values(ip.r), ...Object.values(ip.b)].every(v => v === '?'), '观战者快照不含任何暗子排列信息');
}

// ---------- 8. 非法着法拒绝 ----------
{
  const { host, guest } = await setupRoom({ jieqi: false, time: 'none' });
  // 黑方在红方回合发走子(直接构造消息)
  guest.send({ type: 'move', from: [1, 0], to: [2, 2] });
  await wait(10);
  ok(host.state.turn === 'r' && host.state.moves.length === 0, '轮次错误的走子被忽略');
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
