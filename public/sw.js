const CACHE_NAME = 'ai-or-not-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/leaderboard.html',
  '/stats.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return res;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      if (event.request.mode === 'navigate') {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
      }

      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
