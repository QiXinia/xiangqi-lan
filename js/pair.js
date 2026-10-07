// ============================================================
// 局域网配对: 两轮扫码(房主 offer 轮播 -> 加入者 answer -> 房主扫回)
// 纯 WebRTC, iceServers:[]; 另提供文本信令兜底(手动传递)
// ============================================================
import { HostSignaler, GuestSignaler } from './net-peer.js';
import { HostRoom, GuestRoom } from './room.js';
import { encodeFrames, decodeSignal, FrameReader } from './net-codec.js';
import { FramePlayer, QrScanner, renderQR } from './qrcode-ui.js';
import { XQNetDiscovery, xqNetDiscoverSupported } from './net-discover.js';
import { modal, toast, h, navBar, closeModal } from './ui.js';
import { sfx } from './audio.js';

// 信令协议版本: 跨设备扫码交换时若对端版本不符, 明确提示而非静默卡死
const XQNET_PROTO_V = 1;
// 把一组信令帧拼成完整 payload(复用 FrameReader), 失败返回 null
function assembleFrames(reader, frames) {
  let payload = null;
  for (const f of frames) {
    if (!reader.isFrame(f)) continue;
    payload = reader.add(f) || payload;
  }
  return payload;
}

const TIME_LABEL = { none: '不限时', '5': '5分钟包干', '10': '10分钟包干', '20': '20分钟包干', '5+3': '5分+3秒', '10+3': '10分+3秒', '10+30s': '10分+30秒读秒' };

function stepHead(no, title, sub) {
  return h('div', { class: 'step-head' }, [
    h('div', { class: 'step-badge' }, String(no)),
    h('div', { style: 'flex:1;min-width:0' }, [
      h('div', { class: 'st-t' }, title),
      sub ? h('div', { class: 'st-s' }, sub) : null
    ])
  ]);
}

function frameTextFromTextarea(value) {
  return value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// ================= 房主流程 =================
export async function hostPairFlow(root, { name, cfg, onEnter, onBack }) {
  root.innerHTML = '';
  const signaler = new HostSignaler({ name, cfg });
  let room = null;
  let player = null, scanner = null, reader = new FrameReader();
  let connected = 0;
  let currentOfferFrames = null;   // 当前邀请帧, 供同设备标签索要时推送
  // 同设备(同浏览器)多标签发现: 若支持, 自动广播房间存在; 不支持则静默降级为纯扫码
  const disco = xqNetDiscoverSupported() ? new XQNetDiscovery() : null;
  if (disco) {
    disco.onAnswer = ({ frames }) => {
      const payload = assembleFrames(new FrameReader(), frames);
      if (payload) onAnswer(payload).catch(() => { });
    };
    disco.onOfferRequest = (guestId) => {
      if (currentOfferFrames) disco.pushOffer(guestId, { hostName: name, cfg, frames: currentOfferFrames });
    };
    disco.becomeHost({ hostName: name, cfg, roomCode: null });
  }

  root.appendChild(navBar({
    title: '创建对局房间', backLabel: '大厅',
    onBack: () => cleanup(onBack)
  }));
  const wrap = h('div', { class: 'pair-wrap', style: 'flex:1;min-height:0;overflow-y:auto' });
  root.appendChild(wrap);

  const top = stepHead(1, '请好友扫描你屏幕上的二维码',
    `房间: ${cfg.jieqi ? '揭棋' : '中国象棋'} · ${TIME_LABEL[cfg.time] || '不限时'} · 房主执红`);
  const stage = h('div', { class: 'qr-stage' }, [
    h('canvas', { id: 'host-qr' }),
    h('div', { class: 'qr-cap', id: 'host-qr-cap' }, '等待生成…'),
    h('div', { class: 'prog-bar' }, h('div', { class: 'prog-fill', id: 'host-qr-fill', style: 'width:0%' }))
  ]);
  const scanStage = h('div', { class: 'qr-stage' }, [
    stepHead(2, '好友屏幕出现二维码后, 用摄像头扫回'),
    h('div', { class: 'scan-video-wrap', style: 'aspect-ratio:16/10;margin-top:12px' }, [
      h('video', { class: 'scan-video', id: 'host-video', playsinline: '', muted: '' }),
      h('div', { class: 'scan-frame', style: 'inset:24%' }),
      h('div', { class: 'scan-hint', id: 'host-scan-hint' }, '正在启动摄像头…')
    ])
  ]);
  const inviteMore = h('button', { class: 'btn btn-ghost btn-block', style: 'display:none;margin-top:2px', onclick: () => addSlot() }, '继续邀请观战者(再扫一人)');

  // 文本信令兜底
  const textDetail = h('details', { class: 'text-code' }, [
    h('summary', {}, '无法扫码? 使用文本信令(同设备双开/手动传递)'),
    h('div', { class: 'muted', style: 'margin:6px 0' }, '把下面全部文本发给好友(任选方式); 好友生成的回答信令粘贴到这里:'),
    h('textarea', { id: 'host-offer-text', readonly: '', style: 'height:70px' }),
    h('textarea', { id: 'host-answer-text', placeholder: '在此粘贴好友的回答信令(可一次粘贴多行)' }),
    h('button', {
      class: 'btn btn-primary btn-block', style: 'margin-top:6px', onclick: async () => {
        const frames = frameTextFromTextarea(document.getElementById('host-answer-text').value);
        let payload = null;
        for (const f of frames) { payload = reader.add(f) || payload; if (f && !reader.isFrame(f)) toast('包含非信令内容, 已忽略'); }
        if (payload) await onAnswer(payload); else toast('回答信令不完整');
      }
    }, '导入回答信令')
  ]);
  wrap.append(top, stage, scanStage, inviteMore, textDetail);

  async function addSlot() {
    const { slot, transport, offer } = await signaler.createSlot();
    const frames = encodeFrames(offer);
    currentOfferFrames = frames;
    document.getElementById('host-offer-text').value = frames.join('\n');
    if (player) player.stop();
    player = new FramePlayer(document.getElementById('host-qr'), frames, { interval: 320 });
    player.onTick = (i, total) => {
      document.getElementById('host-qr-cap').textContent = `请好友扫描 (${i}/${total})`;
      document.getElementById('host-qr-fill').style.width = (i / total * 100) + '%';
    };
    player.start();
    return { slot, transport };
  }

  async function onAnswer(payload) {
    let answer;
    try { answer = decodeSignal(payload); }
    catch (e) { toast('回答信令解析失败: 二维码不完整或已损坏'); return false; }
    if (answer.kind !== 'xq-answer') { toast('不是有效的回答信令(类型不符)'); return false; }
    if (answer.v !== XQNET_PROTO_V) { toast('回答信令版本不符: 请双方更新到同一版本后重试'); return false; }
    let transport;
    try { transport = await signaler.feedAnswer(answer); }
    catch (e) { toast('接受回答失败: ' + e.message); return false; }
    const ok = await Promise.race([
      transport.ready,
      new Promise(r => setTimeout(() => r(false), 8000))
    ]);
    if (!ok) { toast('连接失败: 请确认双方在同一局域网/WiFi, 重试扫码'); return false; }
    if (!room) {
      room = new HostRoom({ name, rules: cfg });
      room.onEvent(ev => onHostEvent(ev));
    }
    transport.name = answer.name;
    room.addTransport(transport);
    connected++;
    sfx.invite();
    return true;
  }

  function onHostEvent(ev) {
    if (ev.type === 'challenge') {
      const wantText = ev.want === 'watch' ? '观战' : '对战';
      const seatFree = !room.seats.b;
      modal({
        title: '加入请求',
        body: `${ev.name} 请求加入房间(${wantText})。联机数据仅在局域网内直连传输。`,
        buttons: [
          ev.want === 'play' && seatFree ? { text: '同意对战', cls: 'btn-primary', onClick: () => room.acceptJoin(ev.peerId, 'b') } : null,
          { text: '允许观战', cls: 'btn-ghost', onClick: () => room.acceptJoin(ev.peerId, 'spec') },
          { text: '拒绝', cls: 'btn-ghost', onClick: () => room.declineJoin(ev.peerId, '房间已满') }
        ].filter(Boolean)
      });
    } else if (ev.type === 'startGame') {
      cleanup(null, true);
      const opp = room.seats.b ? room.seats.b.name : '黑方';
      onEnter(room, { isHost: true, oppName: opp });
    } else if (ev.type === 'peers') {
      const playing = ev.peers.some(p => p.role === 'b');
      if (playing) { inviteMore.style.display = ''; inviteMore.textContent = '继续邀请观战者(再扫一人)'; }
    }
  }

  // 摄像头扫 answer
  async function startScan() {
    scanner = new QrScanner({
      onFrame(text) {
        if (!reader.isFrame(text)) return;
        const payload = reader.add(text);
        if (payload) { reader = new FrameReader(); onAnswer(payload).then(ok => { if (ok === false) reader = new FrameReader(); }); }
        else {
          document.getElementById('host-scan-hint').textContent = '正在采集回答二维码…';
        }
      }
    });
    try {
      await scanner.start(document.getElementById('host-video'));
      document.getElementById('host-scan-hint').textContent = '摄像头已就绪, 对准好友屏幕';
    } catch (e) {
      document.getElementById('host-scan-hint').textContent = '摄像头不可用, 可使用下方文本信令';
    }
  }

  function cleanup(cb, keep) {
    if (player) player.stop();
    if (scanner) scanner.stop();
    if (!keep) { signaler.closeAll(); try { disco && disco.leave(); } catch (e) { } }
    if (cb) cb();
  }
  window._xqPairCleanup = () => cleanup(null);

  await addSlot();
  await startScan();
}

// ================= 加入者流程 =================
export async function guestPairFlow(root, { name, want, onEnter, onBack }) {
  root.innerHTML = '';
  root.appendChild(navBar({
    title: '加入对局', backLabel: '大厅',
    onBack: () => cleanup(onBack)
  }));
  const wrap = h('div', { class: 'pair-wrap', style: 'flex:1;min-height:0;overflow-y:auto' });
  root.appendChild(wrap);
  let signaler = null, scanner = null, room = null, answered = false;
  let connectTimer = null, player = null, left = false;
  let bcHostId = null;   // 若本次邀请来自同设备标签, 应答帧经 BC 回传
  const offerReader = new FrameReader();
  // 同设备发现: 列出本浏览器其他标签页已开的房间, 点选即免扫码加入
  const disco = xqNetDiscoverSupported() ? new XQNetDiscovery() : null;
  const sameList = h('div', { class: 'net-samelist', style: 'display:none;margin-top:10px' });
  if (disco) {
    disco.onRoomList = (list) => {
      sameList.innerHTML = '';
      if (!list.length) { sameList.style.display = 'none'; return; }
      sameList.style.display = '';
      sameList.appendChild(h('div', { class: 'field-label' }, [h('span', {}, '同设备')]));
      for (const room of list) {
        sameList.appendChild(h('button', {
          class: 'list-row', style: 'text-align:left',
          onclick: () => { bcHostId = room.hostId; disco.requestOffer(room.hostId); toast('正在向同设备房间请求邀请…'); }
        }, [
          h('div', { style: 'flex:1' }, [
            h('div', { style: 'font-weight:700;font-size:14.5px' }, (room.hostName || '房主') + ' 的房间'),
            h('div', { class: 'muted', style: 'margin-top:2px' }, '同浏览器标签 · 免扫码直连')
          ]),
          h('span', { class: 'lr-chevron' }, '›')
        ]));
      }
    };
    disco.onOffer = ({ frames }) => {
      const payload = assembleFrames(offerReader, frames);
      if (payload) onOffer(payload, { fromBC: true }); else toast('同设备邀请帧不完整');
    };
    disco.becomeGuest();
  }

  const scanView = h('div', {}, [
    stepHead(1, want === 'watch' ? '扫描房主二维码以观战' : '扫描房主二维码加入对战'),
    (() => { const d = h('div', { class: 'net-samenote muted', style: 'font-size:12px;margin:2px 2px 0' }, '同设备多开? 下方会自动列出本浏览器已开的房间; 跨设备请扫码或粘贴房主邀请信令'); return d; })(),
    sameList,
    h('div', { class: 'qr-stage scan-stage', style: 'margin-top:10px' }, h('div', { class: 'scan-video-wrap' }, [
      h('video', { class: 'scan-video', id: 'guest-video', playsinline: '', muted: '' }),
      h('div', { class: 'scan-frame' }),
      h('div', { class: 'scan-hint', id: 'guest-scan-hint' }, '正在启动摄像头…')
    ])),
    (() => {
      const d = h('details', { class: 'text-code' }, [
        h('summary', {}, '无法扫码? 粘贴房主的邀请信令'),
        h('textarea', { id: 'guest-offer-text', placeholder: '粘贴房主的全部邀请信令(可多行)' }),
        h('button', {
          class: 'btn btn-primary btn-block', style: 'margin-top:6px', onclick: () => {
            const frames = frameTextFromTextarea(document.getElementById('guest-offer-text').value);
            let payload = null;
            for (const f of frames) payload = offerReader.add(f) || payload;
            if (payload) onOffer(payload); else toast('邀请信令不完整');
          }
        }, '导入邀请信令')
      ]);
      return d;
    })()
  ]);
  const answerView = h('div', { style: 'display:none' }, [
    stepHead(2, '请房主扫描你屏幕上的二维码'),
    h('div', { class: 'qr-stage', style: 'margin-top:10px' }, [
      h('canvas', { id: 'guest-qr' }),
      h('div', { class: 'qr-cap', id: 'guest-qr-cap' }),
      h('div', { class: 'prog-bar' }, h('div', { class: 'prog-fill', id: 'guest-qr-fill', style: 'width:0%' }))
    ]),
    h('div', { class: 'muted', style: 'text-align:center' }, '扫描成功后将自动进入房间, 请保持屏幕常亮'),
    // 文本信令兜底: 同设备双开/无摄像头时, 把 answer 文本回传给房主
    h('details', { class: 'text-code' }, [
      h('summary', {}, '无法扫码? 复制回答信令(同设备双开/手动传递)'),
      h('div', { class: 'muted', style: 'margin:6px 0' }, '把下面全部回答信令发给房主, 让房主粘贴进其「导入回答信令」框:'),
      h('textarea', { id: 'guest-answer-text', readonly: '', style: 'height:70px' }),
      h('button', {
        class: 'btn btn-primary btn-block', style: 'margin-top:6px', onclick: async () => {
          const ta = document.getElementById('guest-answer-text');
          const txt = ta.value;
          try { await navigator.clipboard.writeText(txt); toast('已复制回答信令'); }
          catch (e) {
            ta.focus(); ta.select();
            try { if (document.execCommand('copy')) toast('已复制回答信令'); else toast('请长按手动选择全部复制'); }
            catch (err) { toast('请长按手动选择全部复制'); }
          }
        }
      }, '复制回答信令')
    ])
  ]);
  wrap.append(scanView, answerView);

  async function onOffer(payload, { fromBC = false } = {}) {
    if (answered) return;
    let offer;
    try { offer = decodeSignal(payload); } catch (e) { toast('邀请信令解析失败: 二维码不完整或已损坏'); return; }
    if (offer.kind !== 'xq-offer') { toast('不是有效的房间邀请(类型不符)'); return; }
    if (offer.v !== XQNET_PROTO_V) { toast('邀请信令版本不符: 请双方更新到同一版本后重试'); return; }
    if (!fromBC) bcHostId = null;   // 扫码/粘贴路径 -> 应答走二维码; BC 路径 -> 走标签中继
    answered = true;
    signaler = new GuestSignaler({ name, want });
    let res;
    try { res = await signaler.acceptOffer(offer); } catch (e) { toast('建立连接失败: ' + e.message); answered = false; return; }
    // await 期间用户可能已返回: 立即收尾, 不再建房/播二维码/挂超时, 避免在大厅空弹"连接超时"
    if (left) { try { signaler.close(); } catch (e2) { } return; }
    room = new GuestRoom(res.transport, { name, want });
    room.onEvent(ev => onGuestEvent(ev, offer));
    // 显示 answer QR
    scanView.style.display = 'none'; answerView.style.display = '';
    const frames = encodeFrames(res.answer);
    document.getElementById('guest-answer-text').value = frames.join('\n');
    if (bcHostId && disco) disco.deliverAnswer(bcHostId, frames);  // 同设备: 应答帧经 BC 直达房主标签
    player = new FramePlayer(document.getElementById('guest-qr'), frames, { interval: 320 });
    player.onTick = (i, total) => {
      document.getElementById('guest-qr-cap').textContent = `等待房主扫描 (${i}/${total})`;
      document.getElementById('guest-qr-fill').style.width = (i / total * 100) + '%';
    };
    player.start();
    if (scanner) scanner.stop();
    // 可撤销的连接超时看护: 放宽到 30s 以容纳人工文本信令流程(切标签/复制/房主粘贴/同意);
    // open、进房、离开任一路径都会撤销定时器; 触发时多重判定, 已连接绝不误弹遮罩
    connectTimer = setTimeout(() => {
      connectTimer = null;
      if (entered || room.state || res.transport.open) return;
      modal({
        title: '连接超时', body: '请确认双方在同一局域网/WiFi, 房主已扫描你的二维码, 或已导入你的回答信令。',
        buttons: [{ text: '重试', cls: 'btn-primary', onClick: () => cleanup(onBack) }]
      });
    }, 30000);
    res.transport.ready.then(ok => {
      // 数据通道 open 即视为连接成功, 撤销超时; ready 因 ICE 瞬时断开解析为 false 时
      // 不立刻弹失败框, 仍交 30s 定时器在触发时按 transport.open/room.state 判定, 避免瞬断误报
      if (ok && connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    });
  }
  let entered = false;
  function onGuestEvent(ev, offer) {
    if (ev.type === 'joinDeclined') {
      modal({ title: '房主拒绝了请求', body: ev.reason || '房间可能已满。', buttons: [{ text: '返回', cls: 'btn-primary', onClick: () => cleanup(onBack) }] });
    } else if (ev.type === 'snapshot' && !entered) {
      entered = true;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; } closeModal();
      cleanup(null, true);
      onEnter(room, { cfg: offer.cfg, hostName: offer.name, seat: ev.seat });
    }
  }

  async function startScan() {
    scanner = new QrScanner({
      onFrame(text) {
        if (!offerReader.isFrame(text)) return;
        const payload = offerReader.add(text);
        if (payload) onOffer(payload);
      }
    });
    try {
      await scanner.start(document.getElementById('guest-video'));
      document.getElementById('guest-scan-hint').textContent = '将摄像头对准房主屏幕的二维码';
    } catch (e) {
      document.getElementById('guest-scan-hint').textContent = '摄像头不可用, 请使用文本信令';
    }
  }
  function cleanup(cb, keep) {
    if (!keep) left = true; // 进局移交(keep)不算离开; 其余路径令在途 onOffer 续体中止
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    if (player) { try { player.stop(); } catch (e) { } player = null; } // 停止 answer 二维码轮播(与 host 对称)
    if (scanner) scanner.stop();
    if (!keep) {
      if (signaler) signaler.close();
      if (room && typeof room.destroy === 'function') { try { room.destroy(); } catch (e) { } }
      try { disco && disco.leave(); } catch (e) { }
    }
    if (cb) cb();
  }
  window._xqPairCleanup = () => cleanup(null);

  await startScan();
}
