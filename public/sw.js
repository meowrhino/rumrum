// Service worker de rumrum: cachea el "app shell" (HTML/CSS/JS/iconos) para que
// la app cargue al instante y offline e instalable como PWA. El tiempo real
// (/ws) y nunca se intercepta; aquí rumrum no tiene API REST.
//
// Estrategia: stale-while-revalidate del shell (sirve cache al momento y
// actualiza en segundo plano). Sube la versión del CACHE al cambiar el shell.
const CACHE = "rumrum-v1";
const SHELL = [
  "/",
  "/style.css",
  "/js/main.js",
  "/js/util.js",
  "/js/session.js",
  "/js/ws.js",
  "/js/render.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return; // mutaciones → red
  if (url.origin !== location.origin) return; // fuentes/terceros → red
  if (url.pathname === "/ws") return; // WebSocket → red (no cacheable)

  e.respondWith(
    (async () => {
      const cached = await caches.match(e.request);
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
