// publications/robot.js – le robot qui publie. Appelé par /api/cron/publish?creneau=midi|soir.
// Pour chaque publication VALIDÉE du jour (heure de Paris) et du créneau :
//   publie (ou fait semblant en mode essai) → « publie », « prive_attente » ou « erreur » ;
//   quand toutes les publications d'un fichier sont terminées, le fichier est supprimé du stockage (coût zéro) ;
//   puis un e-mail de compte rendu est envoyé à Aymen.
// Mode essai : PUBLICATION_DRY_RUN=true (c'est la valeur par défaut tant que rien d'autre n'est écrit) → RIEN n'est envoyé aux réseaux.
import { Resend } from "resend";
import { BUCKET, TERMINES, MAX_PAR_JOUR, maintenantParis, plusJours, lienSigne, adresseAymen, emailSimple, esc, NOMS_RESEAUX, DRAPEAUX, NOMS_CRENEAUX } from "./commun.js";

// Le mode essai est ACTIF sauf si PUBLICATION_DRY_RUN vaut exactement "false"
export const modeEssai = () => process.env.PUBLICATION_DRY_RUN !== "false";

// Les modules par réseau (ajoutés étape par étape : Instagram, puis YouTube, puis TikTok)
const MODULES = {};
export function brancherReseau(reseau, module) { MODULES[reseau] = module; }

// Publier UNE ligne. Renvoie { statut, id_externe?, url?, erreur? }
async function publierLigne(supabase, ligne, essai) {
  const video = await lienSigne(supabase, ligne.fichier); // vérifie aussi que le fichier existe bien
  if (essai) {
    await new Promise((r) => setTimeout(r, 300)); // on fait semblant d'envoyer
    return { statut: "publie", id_externe: "ESSAI", url: null, essai: true, lien: video };
  }
  const module = MODULES[ligne.reseau];
  if (!module) return { statut: "erreur", erreur: `La publication sur ${NOMS_RESEAUX[ligne.reseau]} n'est pas encore branchée.` };
  const { data: connexion } = await supabase.from("connexions_reseaux").select("*").eq("reseau", ligne.reseau).eq("langue", ligne.langue).maybeSingle();
  if (!connexion?.access_token) return { statut: "erreur", erreur: `Le compte ${NOMS_RESEAUX[ligne.reseau]} ${ligne.langue.toUpperCase()} n'est pas connecté (page Connexions).` };
  return module.publier({ supabase, ligne, connexion, video });
}

// Publier UNE ligne et ranger le résultat dans Supabase. Renvoie { ligne, statut, id_externe?, url?, erreur? }
// (utilisé par le robot, et par le bouton de test « Publier maintenant » de la page admin)
export async function publierUneLigne(supabase, ligne, { essai = modeEssai() } = {}) {
  await supabase.from("publications").update({ statut: "en_cours", erreur: null }).eq("id", ligne.id);
  let r;
  try {
    r = await publierLigne(supabase, ligne, essai);
  } catch (e) {
    r = { statut: "erreur", erreur: e.message || String(e) };
  }
  await supabase.from("publications").update({
    statut: r.statut, id_externe: r.id_externe ?? null, url: r.url ?? null, erreur: r.erreur ?? null,
    publie_le: ["publie", "prive_attente"].includes(r.statut) ? new Date().toISOString() : null,
  }).eq("id", ligne.id);
  await menage(supabase, [ligne.fichier]);
  return { ligne, ...r };
}

// Ménage : on supprime les fichiers dont toutes les publications sont terminées (coût zéro)
async function menage(supabase, fichiers) {
  const supprimes = [];
  for (const fichier of [...new Set(fichiers)]) {
    const { data: toutes } = await supabase.from("publications").select("statut").eq("fichier", fichier);
    if (toutes?.length && toutes.every((t) => TERMINES.includes(t.statut))) {
      const { error: e } = await supabase.storage.from(BUCKET).remove([fichier]);
      if (!e) supprimes.push(fichier);
    }
  }
  return supprimes;
}

// Le passage du robot pour un créneau
// jourForce (AAAA-MM-JJ) : seulement en mode essai, pour tester tout de suite une vidéo prévue un autre jour
export async function publierCreneau(supabase, creneau, { maintenant = new Date(), jourForce = null } = {}) {
  const essai = modeEssai();
  const jour = essai && /^\d{4}-\d{2}-\d{2}$/.test(jourForce || "") ? jourForce : maintenantParis(maintenant).jour;
  // au passage : on renouvelle les jetons Instagram qui expirent bientôt (même les jours sans vidéo)
  if (!essai && MODULES.instagram?.renouvelerSiBesoin) {
    const { data: cx } = await supabase.from("connexions_reseaux").select("*").eq("reseau", "instagram");
    for (const c of cx || []) await MODULES.instagram.renouvelerSiBesoin(supabase, c).catch((e) => console.error("Jeton Instagram :", e.message));
  }
  // Validation automatique (PUBLICATION_AUTO_VALIDATION=true, choix d'Aymen) : les publications « à valider » du jour partent aussi,
  // mais seulement sur les comptes déjà connectés (les autres restent « à valider », sans fabriquer d'erreurs).
  const auto = process.env.PUBLICATION_AUTO_VALIDATION === "true";
  const { data: brutes, error } = await supabase.from("publications").select("*")
    .eq("date_prevue", jour).eq("creneau", creneau).in("statut", auto ? ["valide", "a_valider"] : ["valide"]).order("video").order("langue").order("reseau");
  if (error) throw error;
  let lignes = brutes;
  if (auto) {
    const { data: cx } = await supabase.from("connexions_reseaux").select("reseau, langue, access_token");
    const connectes = new Set((cx || []).filter((c) => c.access_token).map((c) => c.reseau + "|" + c.langue));
    lignes = brutes.filter((l) => l.statut === "valide" || essai || connectes.has(l.reseau + "|" + l.langue));
  }

  // règle : maximum 2 publications par compte et par jour (vérifiée avant de lancer les envois)
  const aPublier = [], resultats = [];
  for (const ligne of lignes) {
    const { count } = await supabase.from("publications").select("id", { count: "exact", head: true })
      .eq("date_prevue", jour).eq("reseau", ligne.reseau).eq("langue", ligne.langue).in("statut", ["publie", "prive_attente", "en_cours"]);
    const dejaPrevues = aPublier.filter((l) => l.reseau === ligne.reseau && l.langue === ligne.langue).length;
    if ((count || 0) + dejaPrevues >= MAX_PAR_JOUR) {
      const erreur = `Déjà ${MAX_PAR_JOUR} publications aujourd'hui sur ce compte : reporte-la.`;
      await supabase.from("publications").update({ statut: "erreur", erreur }).eq("id", ligne.id);
      resultats.push({ ligne, statut: "erreur", erreur });
    } else aPublier.push(ligne);
  }
  // les envois partent tous en même temps (le traitement d'une vidéo par un réseau peut prendre 1 à 2 minutes)
  resultats.push(...(await Promise.all(aPublier.map((l) => publierUneLigne(supabase, l, { essai })))));
  const supprimes = await menage(supabase, lignes.map((l) => l.fichier));
  // le grand ménage : tout fichier prévu il y a plus de 7 jours est effacé, même s'il n'a pas été publié
  const { data: vieux } = await supabase.from("publications").select("fichier").lt("date_prevue", plusJours(jour, -7));
  const aEffacer = [...new Set((vieux || []).map((v) => v.fichier))];
  if (aEffacer.length) {
    const { data: restants } = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
    const dossiers = new Set((restants || []).map((x) => x.name));
    const vraiment = aEffacer.filter((f) => dossiers.has(f.split("/")[0]));
    if (vraiment.length && !(await supabase.storage.from(BUCKET).remove(vraiment)).error) supprimes.push(...vraiment);
  }

  if (resultats.length) await emailCompteRendu({ jour, creneau, essai, resultats, supprimes });
  return { jour, creneau, essai, publiees: resultats.length, supprimes, resultats: resultats.map((r) => ({ id: r.ligne.id, video: r.ligne.video, reseau: r.ligne.reseau, langue: r.ligne.langue, statut: r.statut, url: r.url ?? null, erreur: r.erreur ?? null })) };
}

// L'e-mail de compte rendu
async function emailCompteRendu({ jour, creneau, essai, resultats, supprimes }) {
  const a = adresseAymen();
  if (!process.env.RESEND_API_KEY || !a) return;
  const app = process.env.APP_URL || "https://buddycoach.app";
  const nom = (r) => `${DRAPEAUX[r.ligne.langue]} ${NOMS_RESEAUX[r.ligne.reseau]} ${r.ligne.langue.toUpperCase()} · vidéo ${esc(r.ligne.video)}`;
  const ok = resultats.filter((r) => r.statut === "publie");
  const prive = resultats.filter((r) => r.statut === "prive_attente");
  const ko = resultats.filter((r) => r.statut === "erreur");
  const li = (r, extra) => `<li style="margin:4px 0">${nom(r)}${extra}</li>`;
  const html = emailSimple(`${essai ? "🧪 ESSAI · " : ""}Publications du ${esc(jour)} (${esc(NOMS_CRENEAUX[creneau])})`, `
    ${essai ? `<p style="background:#fef3c7;padding:10px 12px;border-radius:10px"><b>Mode essai</b> : rien n'a été envoyé aux réseaux. Tout le reste s'est passé comme en vrai.</p>` : ""}
    ${ok.length ? `<p><b>✅ Publié (${ok.length})</b></p><ul>${ok.map((r) => li(r, r.url ? ` — <a href="${esc(r.url)}">voir</a>` : essai ? " — (essai)" : "")).join("")}</ul>` : ""}
    ${prive.length ? `<p><b>⏳ Privé en attente (${prive.length})</b> : à passer en public à la main sur le réseau, tant que l'audit n'est pas validé.</p><ul>${prive.map((r) => li(r, r.url ? ` — <a href="${esc(r.url)}">ouvrir</a>` : "")).join("")}</ul>` : ""}
    ${ko.length ? `<p><b>❌ Erreur (${ko.length})</b></p><ul>${ko.map((r) => li(r, `<br><span style="color:#b91c1c">${esc(r.erreur)}</span>`)).join("")}</ul>
      <p><a href="${app}/admin/publications" style="display:inline-block;background:#5fe2c3;color:#14284b;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">Réessayer depuis la page admin</a></p>` : ""}
    ${supprimes.length ? `<p style="color:#64748b">🧹 Vidéos supprimées du stockage : ${supprimes.map(esc).join(", ")}</p>` : ""}`);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sujet = `${essai ? "🧪 ESSAI · " : ""}${ko.length ? "❌" : prive.length ? "⏳" : "✅"} Publications ${creneau} du ${jour}`;
  const { error } = await resend.emails.send({ from: process.env.EMAIL_FROM || "Buddy <buddy@buddycoach.app>", to: a, subject: sujet, html });
  if (error) console.error("Robot de publication : e-mail de compte rendu non envoyé :", error.message);
}
