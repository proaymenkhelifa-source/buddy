// publications/commun.js – les règles communes du robot de publication (utilisées par le serveur ET par
// le petit programme videos/preparer-publication.mjs).
//   - les jours et les heures sont toujours ceux de PARIS (le robot tourne sur des serveurs en UTC) ;
//   - 2 créneaux par jour : « midi » (vers 12 h) et « soir » (vers 19 h 30) ;
//   - maximum 2 publications par compte et par jour → un compte a au plus une publication par créneau.

export const BUCKET = "publications"; // le dossier de stockage PRIVÉ des vidéos
export const RESEAUX = ["tiktok", "instagram", "youtube"];
export const LANGUES = ["fr", "en"];
export const CRENEAUX = ["midi", "soir"];
export const MAX_PAR_JOUR = 2;
// Heure (Paris) à partir de laquelle un créneau du jour est considéré comme passé pour une NOUVELLE vidéo
// (on laisse au moins ~1 h à Aymen pour valider avant le passage du robot).
const LIMITE_CRENEAU = { midi: 11 * 60, soir: 18 * 60 + 30 };
// Une publication « terminée » ne bougera plus : son fichier peut être supprimé du stockage
export const TERMINES = ["publie", "prive_attente", "annule"];

// Le jour (AAAA-MM-JJ) et l'heure (en minutes) à Paris, pour un instant donné
export function maintenantParis(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(date).map((x) => [x.type, x.value]),
  );
  return { jour: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour % 24) * 60 + +p.minute };
}

// Ajoute n jours à une date AAAA-MM-JJ
export function plusJours(jour, n) {
  const d = new Date(jour + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Le créneau habituel : 1 vidéo par jour (choix d'Aymen), au soir (~19 h–20 h à Paris, début d'après-midi à New York).
// Réglable avec PUBLICATION_CRENEAU=midi ; PUBLICATION_PAR_JOUR=2 pour publier midi ET soir.
export const CRENEAU_HABITUEL = (env = process.env) => (CRENEAUX.includes(env.PUBLICATION_CRENEAU) ? env.PUBLICATION_CRENEAU : "soir");
const PAR_JOUR = (env = process.env) => (env.PUBLICATION_PAR_JOUR === "2" ? 2 : 1);

// Le prochain créneau libre pour une nouvelle vidéo (FR et EN le même jour, au même créneau).
// Avec 1 vidéo par jour : un jour est libre s'il n'a encore aucune publication active (tout sauf « annule »).
export async function prochainCreneauLibre(supabase, { depuis = new Date(), env = process.env } = {}) {
  const habituel = CRENEAU_HABITUEL(env), parJour = PAR_JOUR(env);
  const { jour, minutes } = maintenantParis(depuis);
  const { data, error } = await supabase.from("publications").select("date_prevue, creneau").gte("date_prevue", jour).neq("statut", "annule");
  if (error) throw error;
  const pris = new Set(data.map((r) => `${r.date_prevue}|${r.creneau}`));
  const joursPris = new Set(data.map((r) => r.date_prevue));
  const ordre = parJour === 2 ? CRENEAUX : [habituel];
  for (let i = 0; i < 365; i++) {
    const j = plusJours(jour, i);
    if (parJour === 1 && joursPris.has(j)) continue;
    for (const c of ordre) {
      if (i === 0 && minutes >= LIMITE_CRENEAU[c]) continue; // déjà trop tard aujourd'hui
      if (!pris.has(`${j}|${c}`)) return { date: j, creneau: c };
    }
  }
  throw new Error("Aucun créneau libre dans l'année : vérifie la page admin.");
}

// Un créneau donné est-il libre (pour l'option --date / le bouton « Reporter ») ? sauf = n° de vidéo à ignorer
export async function creneauLibre(supabase, date, creneau, sauf = null) {
  let q = supabase.from("publications").select("video").eq("date_prevue", date).eq("creneau", creneau).neq("statut", "annule");
  const { data, error } = await q;
  if (error) throw error;
  return data.every((r) => r.video === sauf);
}

// Un lien temporaire (signé) vers une vidéo du stockage privé : c'est lui que les réseaux téléchargent
export async function lienSigne(supabase, fichier, secondes = 6 * 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(fichier, secondes);
  if (error) throw error;
  return data.signedUrl;
}

// L'adresse e-mail d'Aymen pour les comptes rendus : PUBLICATION_EMAIL, sinon la 1re adresse de ADMIN_EMAILS
export function adresseAymen(env = process.env) {
  return (env.PUBLICATION_EMAIL || (env.ADMIN_EMAILS || "").split(",")[0] || "").trim();
}

// Petit nettoyage HTML pour les e-mails
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Les noms affichés
export const NOMS_RESEAUX = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
export const NOMS_CRENEAUX = { midi: "midi (entre 12 h et 13 h)", soir: "soir (entre 19 h et 20 h)" };
export const DRAPEAUX = { fr: "🇫🇷", en: "🇬🇧" };

// Un petit e-mail simple aux couleurs de Buddy
export function emailSimple(titre, corpsHtml) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#14284b">
  <div style="font-size:22px;font-weight:800;margin-bottom:12px">${titre}</div>
  ${corpsHtml}
  <div style="margin-top:24px;font-size:12px;color:#64748b">Robot de publication Buddy</div>
</div>`;
}
