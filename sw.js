/*
 * 서비스 워커 — 앱 셸을 미리 캐시해 오프라인에서도 실행되게 한다.
 * 전략: stale-while-revalidate (캐시를 즉시 쓰고 뒤에서 최신본으로 갱신)
 *       → assets/ 의 스프라이트를 교체하면 다음 방문 때 자동 반영된다.
 * 앱 구조(파일 목록)를 바꿨다면 CACHE 이름의 버전을 올려 주세요.
 */
const CACHE = 'omok-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './rules.js',
  './ai.js',
  './sprite-config.js',
  './manifest.webmanifest',
  './assets/board.svg',
  './assets/stones.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  })());
});
