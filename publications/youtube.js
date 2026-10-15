// publications/youtube.js – publier un Short sur YouTube (YouTube Data API v3, API officielle de Google).
// Une connexion par chaîne (FR et EN). Étapes :
//   1. on télécharge la vidéo depuis le stockage (lien signé) ;
//   2. envoi « résumable » : on ouvre une session d'envoi (titre, description, public, pas pour les enfants), puis on envoie le fichier ;
//   3. si YouTube a mis la vidéo en privé (projet Google pas encore validé, ou réglage de la chaîne) → « privée en attente » ;
//   4. on publie le commentaire.
// Le jeton d'accès dure 1 heure : on le renouvelle avec le « refresh token » (connexion hors ligne) à chaque publication.

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"];

async function appel(url, options = {}) {
  const r = await fetch(url, options);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json.error) throw new Error(`YouTube : ${json.error?.message || json.error_description || json.error || r.status}`);
  return json;
}

/* ---------------- La connexion de la chaîne (OAuth Google) ---------------- */
export function lienConnexion({ redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "), state,
    access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function terminerConnexion({ code, redirectUri }) {
  const t = await appel("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ code, client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!t.refresh_token) throw new Error("YouTube : Google n'a pas donné de clé longue durée. Retire l'accès sur myaccount.google.com/permissions puis reconnecte.");
  const chaines = await appel("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${t.access_token}` } });
  const c = chaines.items?.[0];
  if (!c) throw new Error("YouTube : ce compte Google n'a pas de chaîne YouTube. Choisis le compte de la chaîne au moment de la connexion.");
  return {
    access_token: t.access_token, refresh_token: t.refresh_token,
    expire_le: null, // la clé longue durée n'expire pas tant qu'elle sert (appli Google « en production »)
    infos: { id: c.id, nom: c.snippet?.customUrl?.replace(/^@/, "") || c.snippet?.title },
  };
}

// Un jeton d'accès tout neuf (valable 1 heure) à partir de la clé longue durée
async function jetonFrais(connexion) {
  const t = await appel("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, refresh_token: connexion.refresh_token, grant_type: "refresh_token" }),
  });
  return t.access_token;
}

/* ---------------- La publication ---------------- */
export async function publier({ ligne, connexion, video }) {
  if (!connexion.refresh_token) throw new Error("YouTube : clé longue durée absente, reconnecte la chaîne.");
  const jeton = await jetonFrais(connexion);

  // 1. la vidéo
  const fichier = await fetch(video);
  if (!fichier.ok) throw new Error(`YouTube : impossible de lire la vidéo dans le stockage (${fichier.status}).`);
  const octets = Buffer.from(await fichier.arrayBuffer());

  // 2. la session d'envoi, puis le fichier
  const titre = (ligne.titre_youtube || ligne.titre_interne || "Buddy").slice(0, 100);
  const meta = {
    snippet: { title: titre, description: (ligne.legende || "").slice(0, 5000), categoryId: "22", defaultLanguage: ligne.langue, defaultAudioLanguage: ligne.langue },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false, embeddable: true },
  };
  const session = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(octets.length) },
    body: JSON.stringify(meta),
  });
  if (!session.ok) throw new Error(`YouTube : ouverture de l'envoi refusée (${(await session.json().catch(() => ({}))).error?.message || session.status}).`);
  const adresse = session.headers.get("location");
  const envoi = await appel(adresse, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(octets.length) }, body: octets });

  const id = envoi.id;
  const url = `https://youtube.com/shorts/${id}`;
  const prive = envoi.status?.privacyStatus && envoi.status.privacyStatus !== "public";

  // 3. le commentaire (si ça échoue, la vidéo est quand même en ligne)
  let note = null;
  if (ligne.commentaire) {
    try {
      await appel("https://www.googleapis.com/youtube/v3/commentThreads?part=snippet", {
        method: "POST",
        headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
        body: JSON.stringify({ snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: ligne.commentaire } } } }),
      });
    } catch (e) {
      note = `Vidéo envoyée, mais le commentaire n'a pas pu être posté (${e.message}).`;
    }
  }
  if (prive) return { statut: "prive_attente", id_externe: id, url, erreur: `YouTube a mis la vidéo en « ${envoi.status.privacyStatus} » : passe-la en public dans YouTube Studio.${note ? " " + note : ""}` };
  return { statut: "publie", id_externe: id, url, erreur: note };
}
