// publications/connexions.js – connecter les 6 comptes Buddy (TikTok, Instagram, YouTube × FR, EN).
//   GET  /admin/connexions                              → la page (public/admin-connexions.html)
//   GET  /api/admin/connexions                          → l'état des 6 comptes (jamais les jetons eux-mêmes)
//   POST /api/admin/connexions/:reseau/:langue/debut    → l'adresse où aller se connecter
//   GET  /admin/connexions/:reseau/callback             → le retour du réseau : on range le jeton dans Supabase
//   POST /api/admin/connexions/:reseau/:langue/oublier  → efface le jeton de ce compte
// Le « state » de la connexion est signé (HMAC) : personne ne peut forger un retour à notre place.
import fs from "node:fs";
import crypto from "node:crypto";
import { RESEAUX, LANGUES } from "./commun.js";
import * as instagram from "./instagram.js";

const PAGE = new URL("../public/admin-connexions.html", import.meta.url);
// Les réseaux dont la connexion est déjà codée (YouTube et TikTok arrivent aux étapes 3 et 4)
const MODULES = { instagram };
const PRET = { instagram: () => Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) };

const appUrl = () => (process.env.APP_URL || "https://buddycoach.app").replace(/\/$/, "");
const retour = (reseau) => `${appUrl()}/admin/connexions/${reseau}/callback`;
const cle = () => process.env.CRON_SECRET || process.env.SUPABASE_SECRET_KEY;

// state = langue.expiration.signature (valable 15 minutes)
function signer(reseau, langue) {
  const corps = `${reseau}.${langue}.${Date.now() + 15 * 60e3}.${crypto.randomBytes(8).toString("hex")}`;
  return `${corps}.${crypto.createHmac("sha256", cle()).update(corps).digest("hex").slice(0, 32)}`;
}
function verifier(state, reseau) {
  const morceaux = String(state || "").split(".");
  if (morceaux.length !== 5) return null;
  const corps = morceaux.slice(0, 4).join(".");
  const attendu = crypto.createHmac("sha256", cle()).update(corps).digest("hex").slice(0, 32);
  if (attendu.length !== morceaux[4].length || !crypto.timingSafeEqual(Buffer.from(attendu), Buffer.from(morceaux[4]))) return null;
  const [r, langue, expire] = morceaux;
  if (r !== reseau || !LANGUES.includes(langue) || Date.now() > +expire) return null;
  return langue;
}

export function installerConnexions(app, { supabase, requireUser, requireAdmin }) {
  app.get("/admin/connexions", (req, res) => res.type("html").send(fs.readFileSync(PAGE, "utf-8")));

  app.get("/api/admin/connexions", requireUser, requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase.from("connexions_reseaux").select("reseau, langue, expire_le, infos, mis_a_jour_le, access_token");
      if (error) throw error;
      const comptes = [];
      for (const reseau of RESEAUX) for (const langue of LANGUES) {
        const c = data.find((d) => d.reseau === reseau && d.langue === langue);
        const reste = c?.expire_le ? (new Date(c.expire_le) - Date.now()) / 86400e3 : null;
        const etat = !c?.access_token ? "non_connecte" : reste !== null && reste <= 0 ? "expire" : reste !== null && reste < 7 ? "bientot" : "connecte";
        comptes.push({ reseau, langue, etat, nom: c?.infos?.nom || null, expire_le: c?.expire_le || null, disponible: Boolean(MODULES[reseau]), pret: PRET[reseau]?.() || false });
      }
      res.json({ comptes });
    } catch (error) {
      res.status(500).json({ error: error.message || "Erreur." });
    }
  });

  app.post("/api/admin/connexions/:reseau/:langue/debut", requireUser, requireAdmin, (req, res) => {
    const { reseau, langue } = req.params;
    if (!MODULES[reseau] || !LANGUES.includes(langue)) return res.status(400).json({ error: "Ce réseau n'est pas encore branché." });
    if (!PRET[reseau]()) return res.status(400).json({ error: `Il manque les clés de l'appli ${reseau} dans les réglages (Vercel / .env).` });
    res.json({ url: MODULES[reseau].lienConnexion({ redirectUri: retour(reseau), state: signer(reseau, langue) }) });
  });

  app.get("/admin/connexions/:reseau/callback", async (req, res) => {
    const { reseau } = req.params;
    const langue = verifier(req.query.state, reseau);
    const fin = (message) => res.redirect(`/admin/connexions?${new URLSearchParams({ message })}`);
    if (!MODULES[reseau] || !langue) return fin("❌ Lien de connexion invalide ou expiré : recommence depuis la page Connexions.");
    if (req.query.error || !req.query.code) return fin(`❌ Connexion annulée (${req.query.error_description || req.query.error || "pas de code"}).`);
    try {
      const c = await MODULES[reseau].terminerConnexion({ code: String(req.query.code).replace(/#_$/, ""), redirectUri: retour(reseau) });
      const { error } = await supabase.from("connexions_reseaux").upsert({ reseau, langue, ...c, mis_a_jour_le: new Date().toISOString() });
      if (error) throw error;
      fin(`✅ ${reseau} ${langue.toUpperCase()} connecté${c.infos?.nom ? ` (@${c.infos.nom})` : ""}.`);
    } catch (e) {
      console.error("Connexion", reseau, langue, ":", e.message);
      fin(`❌ ${e.message}`);
    }
  });

  app.post("/api/admin/connexions/:reseau/:langue/oublier", requireUser, requireAdmin, async (req, res) => {
    const { reseau, langue } = req.params;
    const { error } = await supabase.from("connexions_reseaux").delete().eq("reseau", reseau).eq("langue", langue);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });
}
