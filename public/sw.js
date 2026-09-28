// sw.js – le "facteur" de Buddy (en anglais : service worker).
// C'est un petit programme que le téléphone garde en mémoire, même quand l'appli est fermée :
// il reçoit les notifications envoyées par le serveur et les affiche.

// Une notification arrive : on l'affiche
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "Buddy", {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
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

// Rien de spécial à l'installation : Buddy a toujours besoin d'Internet (pas de mode hors ligne pour l'instant)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
