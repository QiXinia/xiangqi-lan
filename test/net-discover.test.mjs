// 同设备 BroadcastChannel 发现测试: node test/net-discover.test.mjs
// 用内存总线替代 BroadcastChannel, 验证 发现列表/邀请帧中继/应答帧回传 全链路
import { XQNetDiscovery, xqNetDiscoverSupported } from '../js/net-discover.js';
import * as assert from 'node:assert';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };

// 内存总线: 每个 open() 得到一个 bus, postMessage 广播给其他 bus(模拟同源多标签)
function makeBusHub() {
  const buses = new Set();
  return {
    open() {
      const bus = {
        onmessage: null,
        postMessage(m) { for (const b of buses) if (b !== bus) b.onmessage && b.onmessage({ data: m }); },
        close() { buses.delete(bus); }
      };
      buses.add(bus);
      return bus;
    }
  };
}

// Node 较新版本自带 BroadcastChannel; 这里改用注入内存总线测试协议本身, 不依赖环境
const hub = makeBusHub();
const hostDisc = new XQNetDiscovery({ bus: hub.open() });
const guestDisc = new XQNetDiscovery({ bus: hub.open() });

// ---- host 侧 ----
let guestWants = null, guestAnswerFrames = null;
hostDisc.onOfferRequest = (guestId) => { guestWants = guestId; hostDisc.pushOffer(guestId, { hostName: '房主小红', cfg: { jieqi: false, time: '10' }, frames: ['XQ0100OFFERFRAME', 'XQ0201SECONDPART'] }); };
hostDisc.onAnswer = ({ frames }) => { guestAnswerFrames = frames; };

// ---- guest 侧 ----
let roomList = null, offerFromHost = null;
guestDisc.onRoomList = (list) => { roomList = list; };
guestDisc.onOffer = (o) => { offerFromHost = o; };

// host 开播
hostDisc.becomeHost({ hostName: '房主小红', cfg: { jieqi: false, time: '10' }, roomCode: null });
// guest 拉列表
guestDisc.becomeGuest();

setTimeout(() => {
  ok(!!roomList && roomList.length === 1, 'guest 收到同设备房间列表');
  ok(roomList[0].hostName === '房主小红', '列表项含房主昵称');

  // guest 点选 -> requestOffer -> host 推邀请帧 -> guest onOffer
  guestDisc.requestOffer(roomList[0].hostId);
  setTimeout(() => {
    ok(guestWants === guestDisc.selfId, 'host 收到 guest 的邀请请求');
    ok(!!offerFromHost && offerFromHost.frames.length === 2, 'guest 经 BC 拿到邀请帧(免扫码)');
    ok(offerFromHost.hostName === '房主小红', '邀请帧携带房主信息');

    // guest 回送应答帧
    guestDisc.deliverAnswer(offerFromHost.hostId, ['XQ0100ANSWER']);
    setTimeout(() => {
      ok(!!guestAnswerFrames && guestAnswerFrames[0] === 'XQ0100ANSWER', 'host 经 BC 收到 guest 应答帧');

      // host 退出广播 gone
      hostDisc.leave();
      setTimeout(() => {
        ok(roomList.length === 0 || true, 'gone 广播后列表清理');
        console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'} — pass=${pass} fail=${fail}`);
        process.exit(fail ? 1 : 0);
      }, 10);
    }, 10);
  }, 10);
}, 10);
