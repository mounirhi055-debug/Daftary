const CACHE_NAME = "daftary-cache-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./register.html",
  "./dashboard.html",
  "./admin.html",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/db.js",
  "./js/ui.js",
  "./js/auth.js",
  "./js/dashboard.js",
  "./js/admin.js",
  "./manifest.json",
  "./icons/logo.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

const FONT_ASSETS = [
  "https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=Tajawal:wght@400;500;700;900&display=swap"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(ASSETS).catch(() => {});

      await Promise.all(FONT_ASSETS.map((url) =>
        fetch(url, { mode: "cors" }).then((res) => cache.put(url, res)).catch(() => {})
      ));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => cached);
    })
  );
});
