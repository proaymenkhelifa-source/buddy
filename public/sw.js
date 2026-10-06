// sw.js – le "facteur" de Buddy (en anglais : service worker).
// C'est un petit programme que le téléphone garde en mémoire, même quand l'appli est fermée :
// il reçoit les notifications envoyées par le serveur et les affiche.

// Une notification arrive : on l'affiche
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "Buddy", {
    body: data.body || "",
    icon: "/icons/buddy-192.png",
    badge: "/icons/buddy-192.png",
    tag: data.tag || "buddy",   // une notification du même genre remplace la précédente
    renotify: true,
    data: { url: data.url || "/" },
  }));
});

// On touche la notification : on ouvre Buddy (ou on revient dessus s'il est déjà ouvert)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of windows) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        return w.navigate(url).catch(() => {});
      }
    }
    return clients.openWindow(url);
  })());
});

// HORS CONNEXION : Buddy a besoin d'Internet, mais s'il s'ouvre sans réseau, on affiche une jolie page
// "Pas de connexion" (gardée en mémoire à l'installation) au lieu de l'écran d'erreur du navigateur.
const OFFLINE_CACHE = "buddy-offline-v1";
const OFFLINE_FILES = ["/offline.html", "/buddy/relax.webp", "/icons/buddy-bubble.svg"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_FILES)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== OFFLINE_CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
// Seulement l'ouverture des PAGES, et seulement si Internet ne répond pas. Tout le reste passe normalement.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline.html")) || Response.error()));
});
