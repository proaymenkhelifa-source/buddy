// publications/instagram.js – publier un Reel sur Instagram (« Instagram API with Instagram Login », API officielle de Meta).
// Les étapes (doc Meta, version v25.0) :
//   1. créer un « conteneur » REELS avec l'adresse de la vidéo (lien signé temporaire) et la légende ;
//   2. attendre que Meta ait fini de traiter la vidéo (status_code = FINISHED) ;
//   3. publier le conteneur (media_publish) → on reçoit l'identifiant de la publication ;
//   4. lire le lien (permalink) et poster le commentaire (l'épingler reste à faire à la main).
// La connexion (OAuth) et le jeton longue durée (60 jours, renouvelé automatiquement) sont aussi gérés ici.

const API = "https://graph.instagram.com/v25.0";
export const SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_comments"];

// Petit appel à l'API, avec un message d'erreur lisible
async function appel(url, options = {}) {
  const r = await fetch(url, options);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json.error) throw new Error(`Instagram : ${json.error?.message || json.error_message || r.status}`);
  return json;
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- La connexion du compte (OAuth) ---------------- */
// L'adresse où envoyer Aymen pour qu'il se connecte au bon compte Instagram
export function lienConnexion({ redirectUri, state }) {
  const p = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(","), state, force_reauth: "true" });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

// Le retour de la connexion : code → jeton court → jeton longue durée (60 jours) → nom du compte
export async function terminerConnexion({ code, redirectUri }) {
  const corps = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID, client_secret: process.env.INSTAGRAM_APP_SECRET, grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const court = await appel("https://api.instagram.com/oauth/access_token", { method: "POST", body: corps });
  const long = await appel(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET, access_token: court.access_token })}`);
  const moi = await appel(`${API}/me?${new URLSearchParams({ fields: "user_id,username", access_token: long.access_token })}`);
  return {
    access_token: long.access_token,
    refresh_token: null,
    expire_le: new Date(Date.now() + (long.expires_in || 60 * 86400) * 1000).toISOString(),
    infos: { id: String(moi.user_id || court.user_id), nom: moi.username },
  };
}

// Renouvelle le jeton s'il expire dans moins de 20 jours (il doit avoir au moins 24 h) → 60 jours de plus
export async function renouvelerSiBesoin(supabase, connexion) {
  if (!connexion?.access_token || !connexion.expire_le) return connexion;
  const reste = new Date(connexion.expire_le) - Date.now();
  const age = Date.now() - new Date(connexion.mis_a_jour_le || 0);
  if (reste > 20 * 86400e3 || reste <= 0 || age < 86400e3) return connexion;
  const r = await appel(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: connexion.access_token })}`);
  const maj = { access_token: r.access_token, expire_le: new Date(Date.now() + (r.expires_in || 60 * 86400) * 1000).toISOString(), mis_a_jour_le: new Date().toISOString() };
  await supabase.from("connexions_reseaux").update(maj).eq("reseau", "instagram").eq("langue", connexion.langue);
  return { ...connexion, ...maj };
}

/* ---------------- La publication ---------------- */
export async function publier({ supabase, ligne, connexion, video }) {
  connexion = await renouvelerSiBesoin(supabase, connexion);
  const jeton = connexion.access_token;
  const ig = connexion.infos?.id;
  if (!ig) throw new Error("Instagram : identifiant du compte inconnu, reconnecte le compte.");

  // 1. le conteneur Reel
  const conteneur = await appel(`${API}/${ig}/media`, {
    method: "POST",
    body: new URLSearchParams({ media_type: "REELS", video_url: video, caption: ligne.legende || "", share_to_feed: "true", access_token: jeton }),
  });

  // 2. attendre la fin du traitement (au plus ~4 minutes)
  let statut = "IN_PROGRESS";
  for (let i = 0; i < 48 && statut === "IN_PROGRESS"; i++) {
    await attendre(5000);
    statut = (await appel(`${API}/${conteneur.id}?${new URLSearchParams({ fields: "status_code", access_token: jeton })}`)).status_code;
  }
  if (statut !== "FINISHED") throw new Error(`Instagram : la vidéo n'a pas pu être traitée (statut ${statut}).`);

  // 3. publier
  const media = await appel(`${API}/${ig}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: conteneur.id, access_token: jeton }) });

  // 4. le lien + le commentaire (si le commentaire échoue, la vidéo est quand même publiée)
  let url = null, note = null;
  try {
    url = (await appel(`${API}/${media.id}?${new URLSearchParams({ fields: "permalink", access_token: jeton })}`)).permalink || null;
  } catch {}
  if (ligne.commentaire) {
    try {
      await appel(`${API}/${media.id}/comments`, { method: "POST", body: new URLSearchParams({ message: ligne.commentaire, access_token: jeton }) });
    } catch (e) {
      note = `Vidéo publiée, mais le commentaire n'a pas pu être posté (${e.message}).`;
    }
  }
  return { statut: "publie", id_externe: media.id, url, erreur: note };
}
