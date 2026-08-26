// ============================================================
// QuParkir — Service Worker sederhana & aman
// navigate: network-first (fallback dokumen yang sama, lalu landing index.html)
// asset same-origin: stale-while-revalidate
// CDN (gstatic/unpkg/jsdelivr): cache-first
// ============================================================
const VER = "qp-v15";
// Dokumen yang ikut disimpan saat pertama diakses (compro + shell aplikasi).
const DOCS = ["/index.html", "/app.html"];
const CDN_HOSTS = ["www.gstatic.com", "unpkg.com", "cdn.jsdelivr.net"];

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // navigasi halaman → network-first, fallback dokumen yang sama lalu landing
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      // "/" dan "/app" dipetakan ke dokumen fisiknya agar cache konsisten
      let key = url.pathname;
      if (key === "/" || key === "") key = "/index.html";
      else if (key === "/app" || key === "/app/") key = "/app.html";
      try {
        const res = await fetch(req);
        if (res && res.ok && DOCS.includes(key)) {
          try { const c = await caches.open(VER); await c.put(key, res.clone()); } catch (_) {}
        }
        return res;
      } catch (_) {
        return (await caches.match(key))
            || (await caches.match("/index.html"))
            || Response.error();
      }
    })());
    return;
  }

  // asset same-origin (css/js/manifest) → stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const refresh = fetch(req).then(async (res) => {
        if (res && res.ok) { try { const c = await caches.open(VER); await c.put(req, res.clone()); } catch (_) {} }
        return res;
      }).catch(() => cached);
      return cached || refresh;
    })());
    return;
  }

  // CDN immutable → cache-first
  if (CDN_HOSTS.includes(url.host)) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      // izinkan response opaque (script no-cors dari qr.js) agar lib QR ikut ter-cache
      if (res && (res.ok || res.type === "opaque")) { try { const c = await caches.open(VER); await c.put(req, res.clone()); } catch (_) {} }
      return res;
    })());
    return;
  }

  // host lain (tile OSM, googleapis, qrserver) → jangan intercept
});
