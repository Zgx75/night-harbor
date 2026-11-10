// Bump the version whenever the app shell changes. Keep an entire release together.
const CACHE = 'night-harbor-shell-v6';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/type.css', '/extras.css', '/pwa.css', '/layout.css',
  '/app.js', '/extras.js', '/progress.js', '/timing.js', '/plan-state.js',
  '/records.js', '/pwa.js', '/account.js', '/account.css', '/social.js', '/social.css', '/manifest.webmanifest', '/icon.svg',
  '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('night-harbor-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache API requests, credentials, conversation contents, or other origins.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(url.pathname)) || fetch(event.request);
  })());
});
