// ==========================================
// 📦 Fake Tweet Webメーカー Service Worker
// フォント含め殻をキャッシュしてオフラインでも動くようにする。
// ==========================================

const CACHE = "nisetsui-v1";
const CORE = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/js/render-core.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/fonts/NotoSansJP-Regular.ttf",
  "/fonts/NotoSansJP-Bold.ttf",
];

// 📥 インストール時に殻をキャッシュする
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

// 🧹 古いキャッシュを削除する
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 🌐 キャッシュがあれば即返し、通信できれば最新版を保存する
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
