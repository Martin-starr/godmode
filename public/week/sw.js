// Offline shell: the app itself is cached so it opens without signal; data
// lives in localStorage and syncs through /api/week when online.
const C = "week-v1", FILES = ["./", "index.html", "manifest.json", "icon.svg"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(FILES))));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then((r) => { caches.open(C).then((c) => c.put(e.request, r.clone())); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
