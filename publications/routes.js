// publications/routes.js – les adresses du robot de publication, branchées sur le serveur par server.js.
//   GET  /admin/publications                 → la page admin (le fichier public/admin-publications.html)
//   GET  /api/admin/publications             → les vidéos à venir + l'historique (admin uniquement)
//   POST /api/admin/publications/action      → valider tout / valider / annuler / reporter / réessayer / modifier un texte / publier maintenant (test)
//   + la page Connexions (publications/connexions.js)
//   ALL  /api/cron/publish?creneau=midi|soir → le passage du robot (protégé par CRON_SECRET, comme /api/cron/tick)
//        (en mode essai seulement : &jour=AAAA-MM-JJ pour tester une vidéo prévue un autre jour)
// Rien ici ne modifie les routes existantes de l'appli.
import fs from "node:fs";
import { BUCKET, CRENEAUX, lienSigne, creneauLibre, maintenantParis } from "./commun.js";
import { publierCreneau, publierUneLigne, modeEssai, brancherReseau } from "./robot.js";
import { installerConnexions } from "./connexions.js";
import * as instagram from "./instagram.js";

brancherReseau("instagram", instagram);

const PAGE = new URL("../public/admin-publications.html", import.meta.url);
const A_VENIR = ["a_valider", "valide", "en_cours", "erreur"];

export function installerPublications(app, { supabase, requireUser, requireAdmin }) {
  installerConnexions(app, { supabase, requireUser, requireAdmin });
  app.get("/admin/publications", (req, res) => res.type("html").send(fs.readFileSync(PAGE, "utf-8")));

  // La liste : à venir (groupé par vidéo, avec un lien d'aperçu signé) + historique
  app.get("/api/admin/publications", requireUser, requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase.from("publications").select("*").order("date_prevue").order("video").order("langue").order("reseau");
      if (error) throw error;
      const videos = new Map();
      for (const p of data) {
        if (!videos.has(p.video)) videos.set(p.video, { video: p.video, titre: p.titre_interne, publications: [] });
        videos.get(p.video).publications.push(p);
      }
      const aVenir = [], historique = [];
      for (const v of videos.values()) {
        const enCours = v.publications.some((p) => A_VENIR.includes(p.statut));
        if (enCours) {
          // un aperçu par langue (lien valable 2 h), seulement si le fichier est encore là
          v.apercus = {};
          for (const p of v.publications) {
            if (!v.apercus[p.langue]) v.apercus[p.langue] = await lienSigne(supabase, p.fichier, 7200).catch(() => null);
          }
          aVenir.push(v);
        } else historique.push(v);
      }
      historique.reverse();
      res.json({ aVenir, historique, essai: modeEssai(), aujourdhui: maintenantParis().jour });
    } catch (error) {
      res.status(500).json({ error: error.message || "Erreur." });
    }
  });

  // Les boutons de la page admin
  app.post("/api/admin/publications/action", requireUser, requireAdmin, async (req, res) => {
    const { action, id, video, date, creneau, champs } = req.body || {};
    const maj = (filtre, valeurs) => filtre(supabase.from("publications").update(valeurs)).select("id");
    try {
      let r;
      if (action === "valider_tout") {
        r = await maj((q) => q.eq("video", String(video)).eq("statut", "a_valider"), { statut: "valide" });
      } else if (action === "valider") {
        r = await maj((q) => q.eq("id", id).eq("statut", "a_valider"), { statut: "valide" });
      } else if (action === "annuler") {
        r = await maj((q) => q.eq("id", id).in("statut", ["a_valider", "valide", "erreur"]), { statut: "annule" });
      } else if (action === "reessayer") {
        r = await maj((q) => q.eq("id", id).in("statut", ["erreur", "annule"]), { statut: "valide", erreur: null });
      } else if (action === "reporter") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !CRENEAUX.includes(creneau)) return res.status(400).json({ error: "Date ou créneau invalide." });
        if (date < maintenantParis().jour) return res.status(400).json({ error: "Cette date est déjà passée." });
        if (!(await creneauLibre(supabase, date, creneau, String(video)))) return res.status(400).json({ error: "Ce créneau est déjà pris par une autre vidéo (2 publications max par compte et par jour)." });
        r = await maj((q) => q.eq("video", String(video)).in("statut", A_VENIR.filter((s) => s !== "en_cours")), { date_prevue: date, creneau });
      } else if (action === "publier_maintenant") {
        // Bouton de test : publie UNE ligne validée tout de suite, en vrai (même si le robot est en mode essai)
        const { data: ligne } = await supabase.from("publications").select("*").eq("id", id).eq("statut", "valide").maybeSingle();
        if (!ligne) return res.status(400).json({ error: "Seule une publication « Validée » peut partir maintenant." });
        const resultat = await publierUneLigne(supabase, ligne, { essai: false });
        return res.json({ ok: resultat.statut !== "erreur", resultat });
      } else if (action === "modifier") {
        const valeurs = {};
        for (const k of ["legende", "titre_youtube", "commentaire"]) if (typeof champs?.[k] === "string") valeurs[k] = champs[k].slice(0, 5000);
        r = await maj((q) => q.eq("id", id).in("statut", ["a_valider", "valide", "erreur"]), valeurs);
      } else {
        return res.status(400).json({ error: "Action inconnue." });
      }
      if (r.error) throw r.error;
      res.json({ ok: true, lignes: r.data.length });
    } catch (error) {
      res.status(500).json({ error: error.message || "Erreur." });
    }
  });

  // La sonnette du robot (appelée par les crons Vercel, qui envoient « Authorization: Bearer <CRON_SECRET> »)
  app.all("/api/cron/publish", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const given = (req.headers.authorization || "").replace("Bearer ", "") || req.query.key;
    if (!secret || given !== secret) return res.status(403).json({ error: "Accès refusé." });
    // Sécurité : tant que le robot est en mode essai, les passages AUTOMATIQUES (crons Vercel) ne font rien,
    // pour ne jamais « publier pour de faux » une vidéo validée. Un essai se lance à la main (sans être un cron Vercel).
    if (modeEssai() && /vercel-cron/i.test(req.headers["user-agent"] || "")) return res.json({ ignore: "mode essai : passage automatique ignoré" });
    const creneau = req.query.creneau;
    if (!CRENEAUX.includes(creneau)) return res.status(400).json({ error: "Paramètre creneau=midi ou creneau=soir obligatoire." });
    try {
      res.json(await publierCreneau(supabase, creneau, { jourForce: req.query.jour })); // « jour » ne marche qu'en mode essai
    } catch (error) {
      console.error("Robot de publication :", error.message);
      res.status(500).json({ error: error.message || "Erreur." });
    }
  });
}
