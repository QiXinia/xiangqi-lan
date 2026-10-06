// 音效(WebAudio 合成, 无外部音频文件)
let ctx = null;
let enabled = true;
export function setSoundEnabled(v) { enabled = v; try { localStorage.setItem('xq_sound', v ? '1' : '0'); } catch (e) { } }
export function soundEnabled() {
  try { const v = localStorage.getItem('xq_sound'); return v === null ? true : v === '1'; } catch (e) { return true; }
}
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => { });
  return ctx;
}
function tone({ freq = 440, dur = 0.08, type = 'sine', gain = 0.18, slideTo, delay = 0 }) {
  const c = ac(); if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise({ dur = 0.06, gain = 0.12, freq = 1200, delay = 0 }) {
  const c = ac(); if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}
export const sfx = {
  tap() { tone({ freq: 320, dur: 0.03, type: 'triangle', gain: 0.08 }); },
  move() { noise({ dur: 0.05, gain: 0.15, freq: 900 }); tone({ freq: 180, dur: 0.07, type: 'sine', gain: 0.12, slideTo: 120 }); },
  capture() { noise({ dur: 0.09, gain: 0.2, freq: 500 }); tone({ freq: 140, dur: 0.12, type: 'sine', gain: 0.18, slideTo: 80 }); },
  flip() { noise({ dur: 0.12, gain: 0.1, freq: 2400 }); },
  check() { tone({ freq: 660, dur: 0.1, type: 'square', gain: 0.1 }); tone({ freq: 880, dur: 0.14, type: 'square', gain: 0.1, delay: 0.12 }); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.14, delay: i * 0.12 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.14, delay: i * 0.14 })); },
  draw() { [440, 440, 440].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.12, delay: i * 0.14 })); },
  invite() { tone({ freq: 740, dur: 0.1, type: 'sine', gain: 0.1 }); tone({ freq: 988, dur: 0.16, type: 'sine', gain: 0.1, delay: 0.1 }); }
};
export function vibrate(ms = 30) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }
