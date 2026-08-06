// اسم كاش ثابت — لا حاجة لتغييره يدوياً عند كل نشر.
// كل ملفات الكود (html/js/css) تُجلب دائماً من الشبكة أولاً (network-first)،
// فأي تحديث تنشره يصل مباشرة عند أول تحميل صفحة بعده — بدون أي خطوة يدوية.
const CACHE_NAME = "daftary-cache";

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

// Core files that must always reflect the latest deploy: network first,
// falling back to cache only when offline.
const NETWORK_FIRST_EXT = [".html", ".js", ".css"];

function isNetworkFirst(url) {
  const path = new URL(url).pathname;
  return path.endsWith("/") || NETWORK_FIRST_EXT.some((ext) => path.endsWith(ext));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(ASSETS).catch(() => {});

      await Promise.all(FONT_ASSETS.map((url) =>
        fetch(url, { mode: "cors" }).then((res) => cache.put(url, res)).catch(() => {})
      ));
    })
  );
  // Activate the new worker immediately instead of waiting for all tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));

      // Take control of every open tab right away.
      await self.clients.claim();

      // Tell every open tab a new version landed so it can reload itself.
      const clientsList = await self.clients.matchAll({ type: "window" });
      clientsList.forEach((client) => client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION }));
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const request = event.request;

  if (isNetworkFirst(request.url)) {
    // Network-first: always try to fetch the newest file; cache it for
    // offline fallback, and only use the cache if the network fails.
    event.respondWith(
      fetch(request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets (icons, fonts, images) that rarely change.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
          return res;
        })
        .catch(() => cached);
    })
  );
});
