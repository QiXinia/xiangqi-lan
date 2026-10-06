// ============================================================
// 局域网 P2P 信令编解码(纯函数, 浏览器/Node 通用)
// JSON -> deflateRaw -> Base45(QR alphanumeric 友好) -> 分片帧
// ============================================================

let pako = globalThis.pako;
if (!pako && typeof window === 'undefined') {
  // Node 测试环境加载本地 vendor
  const { createRequire } = await import('node:module');
  pako = createRequire(import.meta.url)('../vendor/pako.min.js');
}

// RFC 9285 Base45 字母表(恰为 QR alphanumeric 字符超集, 含空格)
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function base45Encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      // 2 字节 -> 3 字符 (高字节在前)
      const v = bytes[i] * 256 + bytes[i + 1];
      out += B45[v % 45] + B45[Math.floor(v / 45) % 45] + B45[Math.floor(v / 2025) % 45];
    } else {
      out += B45[bytes[i] % 45] + B45[Math.floor(bytes[i] / 45) % 45];
    }
  }
  return out;
}
export function base45Decode(str) {
  const bytes = [];
  let i = 0;
  while (i < str.length) {
    const c1 = B45.indexOf(str[i]);
    const c2 = i + 1 < str.length ? B45.indexOf(str[i + 1]) : -1;
    const c3 = i + 2 < str.length ? B45.indexOf(str[i + 2]) : -1;
    if (c1 < 0 || c2 < 0) throw new Error('bad b45 char');
    if (c3 >= 0) {
      const v = c1 + c2 * 45 + c3 * 2025;
      bytes.push(Math.floor(v / 256) % 256, v % 256);
      i += 3;
    } else {
      bytes.push((c1 + c2 * 45) % 256);
      i += 2;
    }
  }
  return Uint8Array.from(bytes);
}

const b36 = (n, len = 2) => n.toString(36).padStart(len, '0').toUpperCase();
const FRAME_MAGIC = 'XQ';

// 对象 -> 帧字符串数组
export function encodeFrames(obj, chunkSize = 260) {
  const json = JSON.stringify(obj);
  const raw = new TextEncoder().encode(json);
  const zip = pako.deflateRaw ? pako.deflateRaw(raw, { level: 9 })
    : pako.deflate ? pako.deflate(raw, { level: 9, raw: true }) : raw;
  const b45 = base45Encode(zip);
  const total = Math.max(1, Math.ceil(b45.length / chunkSize));
  if (total > 36 * 36 - 1) throw new Error('信令过大');
  const frames = [];
  for (let i = 0; i < total; i++) {
    frames.push(FRAME_MAGIC + b36(total) + b36(i) + b45.slice(i * chunkSize, (i + 1) * chunkSize));
  }
  return frames;
}

// 帧装配器: 喂入扫描到的字符串, 集齐后回调完整 payload
export class FrameReader {
  constructor() { this.reset(); }
  reset() { this.total = 0; this.parts = new Map(); this.payload = null; }
  isFrame(s) { return typeof s === 'string' && s.startsWith(FRAME_MAGIC) && s.length >= 8; }
  add(text) {
    if (!this.isFrame(text)) return null;
    const total = parseInt(text.slice(2, 4), 36);
    const idx = parseInt(text.slice(4, 6), 36);
    const data = text.slice(6);
    if (!Number.isFinite(total) || !Number.isFinite(idx) || idx >= total) return null;
    if (this.total && this.total !== total) this.reset(); // 新一轮
    this.total = total;
    this.parts.set(idx, data);
    if (this.parts.size === total) {
      let joined = '';
      for (let i = 0; i < total; i++) joined += this.parts.get(i);
      this.payload = joined;
      const full = joined;
      this.reset();
      return full;
    }
    return null;
  }
  get progress() { return this.total ? this.parts.size / this.total : 0; }
}

// 完整 payload <-> 对象
export function encodeSignal(obj) {
  const frames = encodeFrames(obj);
  return frames.length === 1 ? frames[0] : frames;
}
export function decodeSignal(payload) {
  const zip = base45Decode(payload);
  const raw = pako.inflateRaw ? pako.inflateRaw(zip)
    : pako.inflate ? pako.inflate(zip, { raw: true }) : zip;
  return JSON.parse(new TextDecoder().decode(raw));
}
