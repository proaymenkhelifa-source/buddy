// BILAN DE SANTÉ DE BUDDY (à lancer sur l'ordinateur, jamais en ligne)
// Vérifie le site, la base Supabase, les rappels, les e-mails et fait un vrai parcours avec le compte de démo
// (connexion, tâche créée/cochée/supprimée, citation, discussion avec Buddy).
// Ne montre jamais de clé ni de mot de passe.
// Lancer : node --env-file=.env outils/bilan-sante.cjs
// Chaque ligne commence par OK, ATTENTION ou PROBLÈME ; à la fin : le nombre de problèmes.
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const dns = require("dns").promises;
const tls = require("tls");

const SITE = "https://buddycoach.app";
let problems = 0, warnings = 0;
const line = (level, label, info = "") => {
  if (level === "PROBLÈME") problems++;
  if (level === "ATTENTION") warnings++;
  console.log(`${level.padEnd(9)} ${label}${info ? " — " + info : ""}`);
};
const check = (good, label, info, level = "PROBLÈME") => line(good ? "OK" : level, label, info);

async function site() {
  for (const path of ["/", "/api/config", "/legal/confidentialite.html", "/legal/suppression-compte.html", "/.well-known/assetlinks.json", "/sitemap.xml"]) {
    const t = Date.now();
    const r = await fetch(SITE + path).catch(() => null);
    check(r?.status === 200, "Page " + path, (r?.status || "aucune réponse") + ", " + (Date.now() - t) + " ms");
  }
  const days = await new Promise((resolve) => {
    const s = tls.connect(443, "buddycoach.app", { servername: "buddycoach.app" }, () => {
      resolve(Math.round((new Date(s.getPeerCertificate().valid_to) - Date.now()) / 864e5));
      s.end();
    });
    s.on("error", () => resolve(-1));
  });
  check(days > 14, "Certificat https", days + " jours restants", days > 0 ? "ATTENTION" : "PROBLÈME");
  const txt = async (name) => (await dns.resolveTxt(name).catch(() => [])).map((x) => x.join(""));
  check((await txt("_dmarc.buddycoach.app")).some((v) => v.startsWith("v=DMARC1")), "Anti-spam e-mails (DMARC)", "", "ATTENTION");
  check((await txt("resend._domainkey.buddycoach.app")).length > 0, "Signature des e-mails (DKIM)", "");
}

async function database() {
  const db = new Client({ connectionString: process.env.NEW_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const rows = async (sql) => (await db.query(sql)).rows;
    const u = (await rows(`select count(*)::int total,
      count(*) filter (where created_at > now() - interval '7 days')::int semaine,
      count(*) filter (where email_confirmed_at is null and created_at > now() - interval '7 days')::int non_confirmes
      from auth.users`))[0];
    line("INFO", "Comptes", `${u.total} au total, ${u.semaine} cette semaine, ${u.non_confirmes} pas confirmés cette semaine`);
    const premium = (await rows("select count(*)::int n from profiles where plan = 'premium'"))[0].n;
    line("INFO", "Premium", premium + " comptes");
    const last = (await rows("select max(sent_at) last, count(*) filter (where sent_at > now() - interval '24 hours')::int jour from email_log"))[0];
    const hours = last.last ? (Date.now() - new Date(last.last)) / 36e5 : 999;
    check(hours < 26, "Rappels (cron-job.org → /api/cron/tick)", `${last.jour} envoyés en 24 h, dernier il y a ${hours.toFixed(1)} h`);
    const push = (await rows("select count(*) filter (where endpoint like 'apns:%')::int iphone, count(*) filter (where endpoint not like 'apns:%')::int web from push_subscriptions"))[0];
    check(push.iphone > 0, "Notifications iPhone enregistrées", `${push.iphone} iPhone, ${push.web} navigateurs`, "ATTENTION");
  } finally {
    await db.end();
  }
}

async function demoAccount() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD });
  check(!error && data.session, "Connexion (compte de démo)", error?.message);
  if (!data?.session) return;
  const headers = { authorization: "Bearer " + data.session.access_token, "content-type": "application/json" };
  const call = async (method, path, body) => {
    const t = Date.now();
    const r = await fetch(SITE + path, { method, headers, body: body && JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, text, ms: Date.now() - t };
  };
  try {
    const state = await call("GET", "/api/state");
    check(state.status === 200, "Données de la personne (/api/state)", `${state.status}, ${state.ms} ms`);
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const added = await call("POST", "/api/tasks", { title: "Test santé Buddy (à supprimer)", onDate: today });
    const id = added.json?.task?.id || added.json?.id;
    check(added.status === 200 && id, "Créer une tâche", String(added.status));
    if (id) {
      const done = await call("POST", `/api/tasks/${id}/check`, { day: today, done: true });
      check(done.status === 200, "Cocher la tâche", String(done.status));
      const removed = await call("DELETE", `/api/tasks/${id}`);
      check(removed.status === 200, "Supprimer la tâche", String(removed.status));
    }
    const quote = await call("GET", "/api/quote");
    check(quote.status === 200 && quote.json?.short, "Citation du jour", `${quote.status}, ${quote.ms} ms`);
    const chat = await call("POST", "/api/chat", { message: "Test technique automatique : réponds juste OK.", stream: true });
    check(chat.status === 200 && chat.text.length > 20, "Discussion avec Buddy (IA Claude, en direct)",
      `${chat.status}, ${chat.ms} ms` + (chat.status !== 200 ? ", " + chat.text.slice(0, 120) : ""));
    if (chat.status === 200 && chat.ms > 20000) line("ATTENTION", "Buddy répond lentement", chat.ms + " ms");
  } finally {
    await sb.auth.signOut();
  }
}

(async () => {
  console.log("Bilan de santé de Buddy — " + new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" }));
  for (const [name, step] of [["Site", site], ["Base de données", database], ["Parcours compte de démo", demoAccount]]) {
    try { await step(); } catch (e) { line("PROBLÈME", name, "erreur : " + e.message); }
  }
  console.log(`\nRÉSULTAT : ${problems} problème(s), ${warnings} point(s) d'attention`);
})().finally(() => setTimeout(() => process.exit(0), 300));
