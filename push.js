// push.js – le "bureau de poste" des NOTIFICATIONS du téléphone (comme emails.js pour les e-mails).
// Quand une personne accepte les notifications, son téléphone nous donne une "adresse" (un abonnement) :
// on la range dans Supabase (tableau push_subscriptions), et on peut ensuite lui envoyer des notifications,
// même quand l'appli est fermée. C'est gratuit (contrairement aux e-mails).
// Les clés VAPID (dans .env et sur Vercel) prouvent aux téléphones que les notifications viennent bien de Buddy.

import webpush from "web-push";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "https://buddycoach.app";

// Les notifications sont prêtes seulement si les 2 clés sont là
export const pushReady = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (pushReady) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

// La clé PUBLIQUE est faite pour être donnée à la page (comme la clé publique de Supabase)
export const vapidPublicKey = PUBLIC_KEY || null;

// Envoie une notification à TOUS les appareils d'une personne (téléphone, ordinateur…).
// ttl = combien de secondes la notification reste valable si le téléphone est éteint
// (un rappel "dans 5 minutes" ne doit pas arriver 2 heures plus tard).
// Renvoie le nombre d'appareils qui l'ont bien reçue.
export async function sendPush(supabase, userId, { title, body, url = "/", tag = "buddy", ttl = 3600 }) {
  if (!pushReady) return 0;
  const { data: subs, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error || !subs?.length) return 0;
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url, tag }),
        { TTL: ttl },
      );
      sent++;
    } catch (e) {
      // 404 / 410 = cet appareil n'accepte plus les notifications (désinstallé, refusé…) : on l'oublie
      if (e.statusCode === 404 || e.statusCode === 410) await supabase.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("🔔 Notification non envoyée :", e.statusCode || "", e.body || e.message);
    }
  }));
  return sent;
}
