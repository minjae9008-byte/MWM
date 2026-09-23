/**
 * 서비스 워커 — 오프라인 플레이.
 *
 * 간격 반복은 매일 해야 의미가 있는데, 지하철이나 비행기에서 끊기면
 * 그 습관이 깨진다. 첫 방문 이후에는 네트워크 없이도 완전히 돌아가야 한다.
 */

const VERSION = 'mwm-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './assets/icon.svg',
  './src/main.js',
  './src/core/rng.js',
  './src/core/fsrs.js',
  './src/core/srs.js',
  './src/core/korean.js',
  './src/core/optimizer.js',
  './src/core/scheduler.js',
  './src/core/upgrades.js',
  './src/core/balance.js',
  './src/core/run.js',
  './src/core/storage.js',
  './src/platform/webStorage.js',
  './src/data/decks.js',
  './src/game/engine.js',
  './src/game/renderer.js',
  './src/game/input.js',
  './src/game/audio.js',
  './src/ui/dom.js',
  './src/ui/hud.js',
  './src/ui/screens.js',
  './src/ui/stats.js',
  './src/ui/wordbook.js',
  './src/ui/tuning.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 네트워크 우선, 실패하면 캐시 — 개발 중 최신 코드가 바로 반영된다
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
