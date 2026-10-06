// 断线重连状态机测试: node test/net-reconnect.test.mjs
import { XQNetReconnector, XQNetLinkState } from '../js/net-reconnect.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };

// 可控时钟: advance 手动推进
function makeClock() {
  let now = 0; const pending = [];
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = { fn, at: now + ms }; pending.push(id); return id; },
    clearTimeout: (id) => { const i = pending.indexOf(id); if (i >= 0) pending.splice(i, 1); },
    advance(ms) { now += ms; const due = pending.filter(t => t.at <= now); for (const t of due) { pending.splice(pending.indexOf(t), 1); t.fn(); } }
  };
}

// 场景1: 短暂 disconnected 在观察期内恢复 -> 不进入重连中
{
  const clk = makeClock();
  const r = new XQNetReconnector({ suspectMs: 3000, giveUpMs: 10000, clock: clk });
  let restarts = 0; r.onAttemptRestart = () => restarts++;
  r.notifyIce('disconnected');
  clk.advance(1500);            // 观察期内恢复
  r.notifyIce('connected');
  ok(r.state === XQNetLinkState.UP, '短暂断链在观察期内自动恢复, 不判中断');
  ok(restarts === 0, '未触发 ICE restart');
}

// 场景2: disconnected 持续超过观察期 -> 重连中 + 触发一次 restart; 随后恢复
{
  const clk = makeClock();
  const r = new XQNetReconnector({ suspectMs: 3000, giveUpMs: 10000, clock: clk });
  let restarts = 0, transitions = [];
  r.onAttemptRestart = () => restarts++;
  r.onTransition = (s) => transitions.push(s);
  r.notifyIce('disconnected');
  clk.advance(3001);            // 超过 suspectMs
  ok(r.state === XQNetLinkState.RECONNECTING, '持续断链 -> 进入重连中');
  ok(restarts === 1, '重连中触发一次 ICE restart');
  r.notifyIce('connected');
  ok(r.state === XQNetLinkState.UP && restarts === 1, '重连成功回到 up, 不再额外 restart');
}

// 场景3: 重连一直失败, 超过 giveUpMs -> giveup
{
  const clk = makeClock();
  const r = new XQNetReconnector({ suspectMs: 1000, giveUpMs: 5000, maxRestart: 2, clock: clk });
  r.notifyIce('disconnected');
  clk.advance(1001);           // -> reconnecting
  ok(r.state === XQNetLinkState.RECONNECTING, '进入重连中');
  clk.advance(5000);            // 超过 giveUp
  ok(r.state === XQNetLinkState.GIVEUP, '重连超时 -> giveup(明确失败提示)');
}

// 场景4: 对方主动离开(干净 closed / clean bye) -> gone, 不尝试重连
{
  const clk = makeClock();
  const r = new XQNetReconnector({ clock: clk });
  let restarts = 0; r.onAttemptRestart = () => restarts++;
  r.notifyClosed({ clean: true });
  ok(r.state === XQNetLinkState.GONE, '干净关闭/收到 bye -> gone(对方主动离开)');
  ok(restarts === 0, '主动离开不触发 ICE restart');
}

// 场景5: 突兀关闭(网络中断) -> 直接重连中, 区别于场景4
{
  const clk = makeClock();
  const r = new XQNetReconnector({ suspectMs: 1000, giveUpMs: 99999, clock: clk });
  r.notifyClosed({ clean: false });
  ok(r.state === XQNetLinkState.RECONNECTING, '突兀关闭 -> 按网络中断进入重连中');
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
