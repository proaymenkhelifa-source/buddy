// push.js – le "bureau de poste" des NOTIFICATIONS du téléphone (comme emails.js pour les e-mails).
// Quand une personne accepte les notifications, son téléphone nous donne une "adresse" (un abonnement) :
// on la range dans Supabase (tableau push_subscriptions), et on peut ensuite lui envoyer des notifications,
// même quand l'appli est fermée. C'est gratuit (contrairement aux e-mails).
// Les clés VAPID (dans .env et sur Vercel) prouvent aux téléphones que les notifications viennent bien de Buddy.

import webpush from "web-push";
import http2 from "node:http2";
import crypto from "node:crypto";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "https://buddycoach.app";

// Les notifications sont prêtes seulement si les 2 clés sont là
export const pushReady = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (pushReady) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

// La clé PUBLIQUE est faite pour être donnée à la page (comme la clé publique de Supabase)
export const vapidPublicKey = PUBLIC_KEY || null;

// --- L'APPLI IPHONE (App Store) ---
// Dans l'appli iPhone, les notifications passent par Apple (APNs) et non par le navigateur.
// L'"adresse" d'un iPhone est rangée dans le même tableau, sous la forme "apns:<jeton>".
// Il faut 3 réglages (dans .env et sur Vercel), donnés par Apple une fois le compte développeur ouvert :
// APNS_KEY_ID, APNS_TEAM_ID et APNS_KEY (le contenu du fichier .p8). APNS_BUNDLE_ID est facultatif.
const APNS = {
  keyId: process.env.APNS_KEY_ID,
  teamId: process.env.APNS_TEAM_ID,
  key: (process.env.APNS_KEY || "").replace(/\\n/g, "\n"), // le .p8 peut être collé sur une seule ligne avec des \n
  topic: process.env.APNS_BUNDLE_ID || "app.buddycoach.buddy",
};
export const apnsReady = Boolean(APNS.keyId && APNS.teamId && APNS.key);

// Le "laissez-passer" pour parler à Apple : valable 1 heure, on le refait toutes les 50 minutes
let apnsToken = null;
function apnsJwt() {
  if (apnsToken && Date.now() - apnsToken.at < 50 * 60 * 1000) return apnsToken.jwt;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = b64({ alg: "ES256", kid: APNS.keyId }) + "." + b64({ iss: APNS.teamId, iat: Math.floor(Date.now() / 1000) });
  const signature = crypto.sign("sha256", Buffer.from(unsigned), { key: APNS.key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  apnsToken = { jwt: unsigned + "." + signature, at: Date.now() };
  return apnsToken.jwt;
}

// Envoie une notification à un iPhone. Renvoie "ok", "gone" (appli désinstallée, jeton périmé) ou "error".
function sendApns(client, deviceToken, { title, body, url, tag, ttl }) {
  return new Promise((resolve) => {
    const req = client.request({
      ":method": "POST",
      ":path": "/3/device/" + deviceToken,
      authorization: "bearer " + apnsJwt(),
      "apns-topic": APNS.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + ttl),
      "apns-collapse-id": String(tag).slice(0, 64),
    });
    let status = 0, answer = "";
    req.on("response", (headers) => { status = headers[":status"]; });
    req.on("data", (chunk) => { answer += chunk; });
    req.on("end", () => {
      if (status === 200) return resolve("ok");
      if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(answer)) return resolve("gone");
      console.error("🔔 Notification iPhone non envoyée :", status, answer);
      resolve("error");
    });
    req.on("error", (e) => { console.error("🔔 APNs :", e.message); resolve("error"); });
    req.end(JSON.stringify({ aps: { alert: { title, body }, sound: "default", "thread-id": tag }, url }));
  });
}

// Envoie une notification à TOUS les appareils d'une personne (téléphone, ordinateur…).
// ttl = combien de secondes la notification reste valable si le téléphone est éteint
// (un rappel "dans 5 minutes" ne doit pas arriver 2 heures plus tard).
// Renvoie le nombre d'appareils qui l'ont bien reçue.
export async function sendPush(supabase, userId, { title, body, url = "/", tag = "buddy", ttl = 3600 }) {
  if (!pushReady && !apnsReady) return 0;
  const { data: subs, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error || !subs?.length) return 0;
  let sent = 0;
  // Les iPhones de l'appli App Store : on passe par Apple (une seule connexion pour tous)
  const iphones = apnsReady ? subs.filter((s) => s.endpoint.startsWith("apns:")) : [];
  if (iphones.length) {
    const client = http2.connect("https://api.push.apple.com");
    client.on("error", (e) => console.error("🔔 APNs :", e.message));
    await Promise.all(iphones.map(async (s) => {
      const result = await sendApns(client, s.endpoint.slice(5), { title, body, url, tag, ttl });
      if (result === "ok") sent++;
      if (result === "gone") await supabase.from("push_subscriptions").delete().eq("id", s.id);
    }));
    client.close();
  }
  if (!pushReady) return sent;
  await Promise.all(subs.filter((s) => !s.endpoint.startsWith("apns:")).map(async (s) => {
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
