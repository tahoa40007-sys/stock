const VERSION = "v2";
const APP_CACHE = `cb-app-${VERSION}`;
const DATA_CACHE = `cb-data-${VERSION}`;

// 你的資料檔（同網域路徑）
const DATA_PATH = "/data/cb_snapshot_latest_all.json.gz";

// 你網站的基本檔案（可依你實際調整）
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
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
        .filter(k => ![APP_CACHE, DATA_CACHE].includes(k))
        .map(k => caches.delete(k))
    );
    self.clients.claim();
  })());
});

// 讓前端可以要求「清掉資料快取」
self.addEventListener("message", (event) => {
  if (event.data?.type === "PURGE_DATA_CACHE") {
    event.waitUntil((async () => {
      const cache = await caches.open(DATA_CACHE);
      await cache.delete(DATA_PATH); // 用固定 key，不受 query string 影響
    })());
  }
});

// 抓資料：有快取先回快取，同時背景更新（stale-while-revalidate）
async function handleDataRequest(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(DATA_PATH);

  const fetchPromise = fetch(request).then((res) => {
    if (res.ok) cache.put(DATA_PATH, res.clone());
    return res;
  }).catch(() => null);

  if (cached) {
    // 背景更新，不阻塞回應
    fetchPromise;
    return cached;
  }

  const net = await fetchPromise;
  return net || new Response("{}", { headers: { "Content-Type": "application/json" } });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 資料檔
  if (url.pathname === DATA_PATH) {
    event.respondWith(handleDataRequest(event.request));
    return;
  }

  // App 殼：快取優先
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    return cached || fetch(event.request);
  })());
});
