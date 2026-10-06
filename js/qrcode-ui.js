// ============================================================
// 二维码生成(canvas)与摄像头扫描(jsQR); 信号帧全部字符可走
// QR Alphanumeric 模式(0-9 A-Z 空格 $%*+-./:)
// ============================================================

// 在 canvas 上绘制二维码; text 须为 Alphanumeric 字符集
export function renderQR(canvas, text, { fg = '#1a1a1a', bg = '#ffffff', margin = 2, scale } = {}) {
  const qr = qrcode(0, 'M'); // 自动选择最小版本, 纠错 M
  qr.addData(text, 'Alphanumeric');
  qr.make();
  const count = qr.getModuleCount();
  const size = count + margin * 2;
  const css = scale || Math.floor((canvas.parentElement?.clientWidth || 280) / size);
  canvas.width = size * css; canvas.height = size * css;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) {
    if (qr.isDark(r, c)) ctx.fillRect((c + margin) * css, (r + margin) * css, css, css);
  }
  return { count, modules: size };
}

// 帧轮播播放器
export class FramePlayer {
  constructor(canvas, frames, { interval = 350, fg, bg } = {}) {
    this.frames = frames; this.i = 0; this.canvas = canvas;
    this.interval = interval; this.qropts = { fg, bg };
    this.timer = null; this.onTick = null;
  }
  start() {
    const draw = () => {
      renderQR(this.canvas, this.frames[this.i], this.qropts);
      this.onTick && this.onTick(this.i + 1, this.frames.length);
      this.i = (this.i + 1) % this.frames.length;
    };
    draw();
    this.timer = setInterval(draw, this.interval);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

// 摄像头扫描器
export class QrScanner {
  constructor({ onFrame, onProgress, onError } = {}) {
    this.onFrame = onFrame; this.onProgress = onProgress; this.onError = onError;
    this.running = false;
    this.stream = null;
    this._cancelled = false;
  }
  async start(videoEl, hiddenCanvas) {
    this.video = videoEl;
    this.canvas = hiddenCanvas || document.createElement('canvas');
    this._cancelled = false;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    // 授权弹窗期间用户可能已离开(stop): 立即释放刚拿到的摄像头, 不得点灯/启动解码循环
    if (this._cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => { });
    if (this._cancelled) { this.stop(); return; }
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
        const w = videoEl.videoWidth, h = videoEl.videoHeight;
        if (w) {
          this.canvas.width = w; this.canvas.height = h;
          const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(videoEl, 0, 0, w, h);
          try {
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
            if (code && code.data) this.onFrame && this.onFrame(code.data);
          } catch (e) { }
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() {
    this._cancelled = true;
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  }
}
