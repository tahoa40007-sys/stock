const VERSION = "v9";
const APP_CACHE = `cb-app-${VERSION}`;

// GitHub Pages (/stock/) 用相對路徑最穩
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith("cb-app-") && k !== APP_CACHE)
        .map(k => caches.delete(k))
    );
    self.clients.claim();
  })());
});

// 只處理「同網域」請求；Google Drive 的下載是 cross-origin，不要管它
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
