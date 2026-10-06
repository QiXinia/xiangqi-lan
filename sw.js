// 局域网象棋 Service Worker —— 打开过一次后整站离线可用(对局不依赖互联网)
const CACHE = 'xq-lan-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/ui.js',
  './js/storage.js',
  './js/audio.js',
  './js/engine.js',
  './js/ai.js',
  './js/ai.worker.js',
  './js/puzzles.js',
  './js/board-view.js',
  './js/game-controller.js',
  './js/room.js',
  './js/net-codec.js',
  './js/net-peer.js',
  './js/qrcode-ui.js',
  './js/pair.js',
  './vendor/pako.min.js',
  './vendor/qrcode.js',
  './vendor/jsqr.js',
  './fonts/chess.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 任何跨域请求一律不走缓存、不拦截
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { });
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
