// Service worker для установки «Реактора» как приложения.
// Стратегия «сначала сеть»: онлайн игры всегда берутся свежие с сервера, как без воркера.
// Кэш нужен только чтобы меню и уже открытые игры открывались, если сеть пропала.
// Чужие домены (Supabase, шрифты) воркер не трогает.
const CACHE = 'reactor-v1';
const PRECACHE = ['games/', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/maskable-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const menu = await caches.match('games/');
          if (menu) return menu;
        }
        return Response.error();
      })
  );
});
