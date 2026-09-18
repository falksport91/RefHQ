const CACHE = "law18referee-v0.44.0";
const SHELL = ["/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const pathname = new URL(event.request.url).pathname;
  if (pathname.startsWith("/api/owner-documents/")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  if (pathname === "/version.json") {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  // Never retain an application page. A cached page can reference JavaScript
  // chunks that no longer exist after a deployment and prevent React startup.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(new Request(event.request, { cache: "no-store" })));
    return;
  }
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
