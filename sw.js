/* Nous service worker: offline cache + daily reminder. Bump VERSION when the app shell changes. */
const VERSION = "nous-v4";
const SHELL = ["./", "index.html", "css/app.css", "js/store.js", "js/themes.js", "js/story.js", "js/app.js", "manifest.webmanifest",
  "fonts/fonts.css", "fonts/literata-greek.woff2", "fonts/literata-latin.woff2", "fonts/commissioner-greek.woff2", "fonts/commissioner-latin.woff2",
  "icons/favicon-48.png", "icons/badge-96.png", "icons/icon-192.png", "icons/icon-512.png", "content/index.json"];
importScripts("js/store.js");

self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await c.addAll(SHELL);
  // Precache every content file listed in the index, so all cards work offline from the first visit.
  const index = await (await c.match("content/index.json")).json();
  await c.addAll([...index.topics, index.journeys, index.legacy].map(f => "content/" + f));
  self.skipWaiting();
})()));

self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));

// Same-origin files (fonts included): answer from cache at once, refresh in the background (stale-while-revalidate).
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const key = req.mode === "navigate" ? "index.html" : req;
    const hit = await c.match(key, { ignoreSearch: req.mode === "navigate" });
    const net = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()); return r }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit }
    return (await net) || new Response("Offline", { status: 503 });
  })());
});

/* ---------------- REMINDER ---------------- */
const pad = n => String(n).padStart(2, "0");
const dkey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

async function notify(test) {
  const day = await KV.get("day"), today = dkey(new Date());
  const count = day && day.date === today ? day.count : 0, goal = (day && day.goal) || 5, streak = (day && day.streak) || 0;
  const left = Math.max(goal - count, 1);
  const body = streak > 0
    ? `Σε περιμένουν ${left} ${left === 1 ? "ιδέα" : "ιδέες"} για τον στόχο σου. Κράτα ζωντανό το σερί των ${streak} ${streak === 1 ? "ημέρας" : "ημερών"}.`
    : `Σε περιμένουν ${left} ${left === 1 ? "ιδέα" : "ιδέες"} για τον σημερινό στόχο.`;
  await self.registration.showNotification(test ? "Nous · δοκιμή" : "Nous", {
    body, icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "nous-daily", data: { url: "./#today" } });
}

async function checkReminder() {
  const rem = await KV.get("reminder");
  if (!rem || !rem.on) return;
  const now = new Date(), today = dkey(now), [h, m] = rem.time.split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  if ((await KV.get("notified")) === today) return;
  const day = await KV.get("day");
  await KV.set("notified", today);
  if (day && day.date === today && day.count >= day.goal) return; // goal already met
  // Don't interrupt someone who is reading right now.
  const open = await self.clients.matchAll({ type: "window" });
  if (open.some(c => c.visibilityState === "visible")) return;
  await notify(false);
}

self.addEventListener("periodicsync", e => { if (e.tag === "nous-daily") e.waitUntil(checkReminder()) });
self.addEventListener("message", e => {
  if (e.data && e.data.type === "check-reminder") e.waitUntil(checkReminder());
  if (e.data && e.data.type === "test-notification") e.waitUntil(notify(true));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); if ("navigate" in c) c.navigate(e.notification.data.url); return } }
    await self.clients.openWindow(e.notification.data.url);
  })());
});
