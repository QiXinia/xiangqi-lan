// 信令编解码测试: node test/net.test.mjs
import { base45Encode, base45Decode, encodeFrames, decodeSignal, FrameReader } from '../js/net-codec.js';
import * as assert from 'node:assert';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };

// 1. Base45 RFC 向量
{
  const enc = (s) => base45Encode(new TextEncoder().encode(s));
  ok(enc('AB') === 'BB8', 'Base45 RFC: AB -> BB8 (got ' + enc('AB') + ')');
  ok(enc('Hello!!') === '%69 VD92EX0', 'Base45 RFC: Hello!!');
  ok(enc('base-45') === 'UJCLQE7W581', 'Base45 RFC: base-45');
  for (const s of ['AB', 'Hello!!', '象棋xiangqi', 'x'.repeat(300)]) {
    const back = new TextDecoder().decode(base45Decode(enc(s)));
    ok(back === s, 'Base45 往返: ' + s.slice(0, 10));
  }
}

// 2. 模拟真实 SDP 信令往返 + 分片
{
  const fakeSDP = 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'
    + 'c=IN IP4 0.0.0.0\r\na=ice-ufrag:abcd\r\na=ice-pwd:0123456789abcdef0123456789\r\n'
    + 'a=fingerprint:sha-256 ' + 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99\r\n'
    + 'a=candidate:1 1 udp 2122252543 192.168.1.23 54321 typ host\r\n'
    + 'a=candidate:2 1 udp 2122252542 192.168.1.23 54322 typ host\r\n'
    + 'a=candidate:3 1 tcp 1518214911 192.168.1.23 0 typ host tcptype active\r\n';
  const offer = { type: 'offer', name: '棋手小明', slot: 3, room: { mode: 'classic', time: '10+0' }, sdp: fakeSDP };
  const frames = encodeFrames(offer);
  console.log('信令 JSON 字节:', new TextEncoder().encode(JSON.stringify(offer)).length,
    ' 分片数:', frames.length, ' 单片最大:', Math.max(...frames.map(f => f.length)), '字符');
  ok(frames.length >= 2, '真实 SDP 被分为多片');
  ok(frames.every(f => f.length <= 280), '单片不超过 280 字符(手机互扫可靠密度)');

  // 乱序+重复+夹杂无关二维码喂入
  const reader = new FrameReader();
  const order = [...frames.keys()].reverse();
  let result = null;
  for (const i of order) {
    reader.add('https://example.com/qr/123'); // 无关码
    result = reader.add(frames[i]) || result;
    result = reader.add(frames[i]) || result; // 重复
  }
  ok(result, '乱序/重复/夹杂环境下仍能集齐');
  const obj = decodeSignal(result);
  ok(obj.sdp === fakeSDP && obj.name === '棋手小明' && obj.slot === 3, '解码内容一致');
}

// 3. 小信令单片
{
  const frames = encodeFrames({ type: 'answer', sdp: 'x' });
  ok(frames.length === 1 && frames[0].startsWith('XQ0100'), '小信令单片帧头正确 (got ' + frames[0].slice(0, 6) + ')');
  ok(decodeSignal(frames[0].slice(6)).sdp === 'x', '单片解码');
}

// 4. 中文与揭棋房间设置往返
{
  const o = { type: 'offer', room: { jieqi: true, time: '10+3' }, name: '楚河' };
  const f = encodeFrames(o);
  const r = new FrameReader();
  let p = null;
  for (const x of f) p = r.add(x) || p;
  const back = decodeSignal(p);
  ok(back.room.jieqi === true && back.name === '楚河', '中文/揭棋设置往返');
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
