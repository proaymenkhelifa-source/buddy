// server.js – la "cuisine" de Buddy.
// Ce programme tourne sur ton ordinateur (grâce à Node).
// Il fait trois choses :
//   1. Il affiche la page web (le dossier "public").
//   2. Il range les données de CHAQUE personne dans Supabase :
//      profil, objectifs, tâches du jour, coches, messages.
//   3. Quand la page lui envoie un message, il prépare tout pour Claude et renvoie la réponse de Buddy.
// Les clés secrètes restent ICI, jamais dans la page web.

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import {
  CATEGORIES, MAX_TASKS, MAX_MESSAGES_PER_DAY, HISTORY_DAYS, BADGES, APP_VERSION,
  dayKey, addDays, computeStats, occursOn, isCurrent, scheduleLabel, dailyLimitError, religionRule, badgeFacts,
  goalProgress, goalWeek, withTimeZone, isoDay, DAY_LONG,
} from "./public/shared.js";
import { t, cleanLang, dayLong } from "./public/i18n.js";
import { startEmailScheduler, sendTestEmail, runEmailTick } from "./emails.js";
import { sendPush, pushReady, vapidPublicKey } from "./push.js";

// Sommes-nous en ligne sur Vercel ? (Vercel remplit tout seul cette variable)
const ONLINE = Boolean(process.env.VERCEL);

// Le chemin de la fiche de personnalité, écrit "à côté de ce fichier" :
// comme ça Vercel voit qu'on en a besoin et l'emporte avec le serveur en ligne.
const PROMPT_FILE = new URL("./companion-prompt.md", import.meta.url);

const app = express();
const PORT = 3000;

// Vérifie que les clés Supabase sont bien dans .env avant de démarrer.
if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SECRET_KEY ||
  !process.env.SUPABASE_PUBLISHABLE_KEY
) {
  console.error("Il manque SUPABASE_URL, SUPABASE_SECRET_KEY ou SUPABASE_PUBLISHABLE_KEY dans le fichier .env.");
  process.exit(1);
}

// Le "téléphone" vers Claude. Il lit tout seul la clé ANTHROPIC_API_KEY du fichier .env.
// maxRetries : si Anthropic a un petit souci passager, on réessaie tout seul jusqu'à 4 fois.
const claude = new Anthropic({ maxRetries: 4 });

// Transforme une erreur de Claude en message clair pour la personne (le nom de la phrase dans i18n.js).
function claudeErrorMessage(error) {
  const status = error?.status;
  const text = String(error?.message || "");
  if (status === 401 || status === 403) return "err.claudeAuth";
  if (/credit balance/i.test(text)) return "err.claudeCredits";
  if (status === 429) return "err.claudeBusy";
  if (status >= 500 || status === 529) return "err.claudeDown";
  return null; // autre problème (Supabase, etc.)
}

// Le "passe-partout" du classeur Supabase (clé secrète : reste sur le serveur).
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// Permet de lire les messages envoyés par la page (au format JSON).
app.use(express.json());

// La langue de la page (envoyée par app.js dans "X-Lang") : on répond dans la même. Par défaut : français.
app.use((req, res, next) => {
  req.lang = cleanLang(req.headers["x-lang"]) || "fr";
  next();
});
// Raccourci pour écrire une phrase du dictionnaire dans la langue de la personne
const tr = (req, key, vars) => t(key, vars, req.lang);

// Sert la page web (tout ce qui est dans le dossier "public").
app.use(express.static("public"));

// L'adresse "racine" (buddy-….vercel.app/) → la page d'accueil.
// Sur ton ordinateur, la ligne du dessus s'en charge ; en ligne, Vercel l'ignore, donc on le fait ici.
const INDEX_FILE = new URL("./public/index.html", import.meta.url);
app.get("/", (req, res) => res.type("html").send(fs.readFileSync(INDEX_FILE, "utf-8")));

// La page a besoin de l'adresse Supabase et de la clé PUBLIQUE pour gérer les connexions.
// La clé publique ("publishable") est faite pour être visible : elle n'ouvre pas nos tableaux.
app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    vapidPublicKey, // la clé PUBLIQUE des notifications (faite pour être visible)
  });
});

// --- Le "videur" : vérifie qui fait la demande ---
// La page envoie un "badge" (un jeton) reçu de Supabase à la connexion.
// On demande à Supabase à qui appartient ce badge. S'il est faux ou expiré : on refuse.
async function requireUser(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: tr(req, "err.notLoggedIn") });
  }
  req.user = data.user; // on retient qui c'est pour la suite
  next();
}

// Petit raccourci : si Supabase renvoie une erreur, on l'arrête là.
function check({ data, error }) {
  if (error) throw error;
  return data;
}

// Le jour "aujourd'hui" selon l'ordinateur de la personne (envoyé par la page), sinon celui du serveur.
function todayFrom(req) {
  const t = req.body?.today || req.query?.today;
  return /^\d{4}-\d{2}-\d{2}$/.test(t || "") ? t : dayKey(new Date());
}

// =============================================================
// LIRE TOUTES LES DONNÉES D'UNE PERSONNE
// =============================================================
async function loadAll(userId, today) {
  const since = addDays(today, -(HISTORY_DAYS + 5)); // l'historique utile pour le suivi, le streak et les badges
  const [profile, allGoals, tasks, logs, messages] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle().then(check),
    supabase.from("goals").select("*").eq("user_id", userId).order("id").then(check),
    supabase.from("tasks").select("*").eq("user_id", userId)
      .or(`archived_at.is.null,archived_at.gte.${since}`).order("id").then(check),
    supabase.from("task_logs").select("task_id, day").eq("user_id", userId).gte("day", since).then(check),
    supabase.from("messages").select("role, content, emotion, created_at").eq("user_id", userId).order("id").then(check),
  ]);
  return {
    profile: {
      firstName: profile?.first_name || null,
      style: profile?.communication_style || null,
      // Les réglages des e-mails (avec leurs valeurs par défaut)
      notifyEmail: profile?.notify_email || "",
      emailMorning: profile?.email_morning ?? true, // activé par défaut
      morningTime: profile?.morning_time || "08:00",
      emailEvening: profile?.email_evening ?? true,
      eveningTime: profile?.evening_time || "21:00",
      emailTasks: profile?.email_tasks ?? true,
      emailWeekly: profile?.email_weekly ?? true,
      emailWithPush: profile?.email_with_push ?? false, // recevoir AUSSI les e-mails quand on a les notifications
      reviewsCount: profile?.reviews_count || 0,
      timezone: profile?.timezone || null, // ex : "Europe/Paris"
      language: profile?.language || null, // "fr" ou "en"
      source: profile?.source || null,     // d'où vient la personne (ex : "insta-fr"), null = inconnu / lien direct
    },
    // Les objectifs "brouillons" (en train d'être définis avec Buddy) sont rangés à part :
    // ils ne comptent nulle part (stats, e-mails, badges…), sauf sur la page Mes objectifs et pour Buddy.
    goals: allGoals.filter((g) => !g.draft),
    drafts: allGoals.filter((g) => g.draft),
    tasks,
    logs,
    messages,
  };
}

// =============================================================
// LES BADGES : on regarde si la personne vient d'en gagner de nouveaux
// =============================================================
async function updateBadges(userId, data, today) {
  const [earnedRows, doneCount] = await Promise.all([
    supabase.from("user_badges").select("badge_id, earned_at").eq("user_id", userId).then(check),
    supabase.from("task_logs").select("task_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const facts = withTimeZone(data.profile.timezone, () => badgeFacts({
    stats: computeStats(data.tasks, data.logs, today),
    goals: data.goals,
    totalDone: doneCount.count || 0,
    reviews: data.profile.reviewsCount,
    today,
  }));
  const already = new Set(earnedRows.map((r) => r.badge_id));
  const fresh = BADGES.filter((b) => !already.has(b.id) && b.test(facts)).map((b) => b.id);
  if (fresh.length) {
    check(await supabase.from("user_badges").insert(fresh.map((badge_id) => ({ user_id: userId, badge_id }))));
    console.log(`🏅 Nouveaux badges : ${fresh.join(", ")}`);
  }
  return {
    badges: [...earnedRows, ...fresh.map((badge_id) => ({ badge_id, earned_at: new Date().toISOString() }))],
    newBadges: fresh,
  };
}

// "upsert" = crée la ligne du profil si elle n'existe pas, sinon la met à jour.
async function saveProfile(userId, changes) {
  check(await supabase.from("profiles").upsert({ user_id: userId, ...changes, updated_at: new Date().toISOString() }));
}

// Quand quelque chose se passe mal, on l'écrit dans le Terminal et on prévient la page
// (key = le nom de la phrase à afficher, dans i18n.js).
function fail(res, error, key = "err.generic") {
  console.error("Erreur :", error.message);
  res.status(500).json({ error: tr(res.req, key) });
}

// =============================================================
// LES "GUICHETS" DE LA PAGE (tous protégés par le videur)
// =============================================================

// Tout ce que la page doit afficher (+ les badges, et ceux qui viennent d'être gagnés)
app.get("/api/state", requireUser, async (req, res) => {
  try {
    const today = todayFrom(req);
    const data = await loadAll(req.user.id, today);
    // D'où vient la personne : l'étiquette envoyée à l'inscription (?src=insta-fr…) est rangée une fois dans son profil.
    // Rangée à part : si la colonne "source" n'existe pas encore dans Supabase, le reste marche quand même.
    const source = String(req.user.user_metadata?.source || "").toLowerCase();
    if (/^[a-z0-9_-]{1,40}$/.test(source) && !data.profile.source) {
      try {
        await saveProfile(req.user.id, { source });
        data.profile.source = source;
      } catch (error) {
        console.error("Source non enregistrée (as-tu lancé supabase-source.sql ?) :", error.message);
      }
    }
    const { badges, newBadges } = await updateBadges(req.user.id, data, today);
    res.json({ ...data, badges, newBadges, maxMessages: MAX_MESSAGES_PER_DAY, version: APP_VERSION });
  } catch (error) {
    fail(res, error, "err.loadState");
  }
});

// --- Supprimer son compte et TOUTES ses données (définitif) ---
app.delete("/api/account", requireUser, async (req, res) => {
  const userId = req.user.id;
  try {
    // On vide chaque tableau (dans l'ordre : d'abord ce qui dépend des autres)…
    for (const table of ["task_logs", "email_log", "user_badges", "messages", "tasks", "goals", "profiles"]) {
      check(await supabase.from(table).delete().eq("user_id", userId));
    }
    // … puis on supprime le compte lui-même.
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    console.log("🗑️ Un compte et toutes ses données ont été supprimés.");
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, "err.deleteFailed");
  }
});

// --- Profil (prénom, style de coaching) ---
app.patch("/api/profile", requireUser, async (req, res) => {
  try {
    const changes = {};
    if (typeof req.body.firstName === "string") changes.first_name = req.body.firstName.trim() || null;
    if (["military", "supportive", "balanced"].includes(req.body.style)) changes.communication_style = req.body.style;
    // Le fuseau horaire (envoyé automatiquement par la page) : on vérifie qu'il existe vraiment
    if (typeof req.body.timezone === "string") {
      try {
        new Intl.DateTimeFormat("fr-FR", { timeZone: req.body.timezone });
        changes.timezone = req.body.timezone;
      } catch (e) {
        return res.status(400).json({ error: tr(req, "err.timezone") });
      }
    }
    // La langue (choisie avec le bouton FR/EN) : Buddy et les e-mails parleront cette langue.
    // Enregistrée à part : si la colonne "language" n'existe pas encore dans Supabase, le reste marche quand même.
    const language = cleanLang(req.body.language);
    if (language) {
      try {
        // quote_day vide = les phrases du jour seront réécrites dans la nouvelle langue
        await saveProfile(req.user.id, { language, quote_day: null });
      } catch (error) {
        console.error("Langue non enregistrée (as-tu lancé supabase-phase8b.sql ?) :", error.message);
      }
    }
    // Réglages des e-mails
    if (typeof req.body.notifyEmail === "string") {
      const email = req.body.notifyEmail.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: tr(req, "err.emailInvalid") });
      changes.notify_email = email || null;
    }
    for (const [field, column] of [["emailMorning", "email_morning"], ["emailEvening", "email_evening"], ["emailTasks", "email_tasks"], ["emailWeekly", "email_weekly"], ["emailWithPush", "email_with_push"]]) {
      if (typeof req.body[field] === "boolean") changes[column] = req.body[field];
    }
    for (const [field, column] of [["morningTime", "morning_time"], ["eveningTime", "evening_time"]]) {
      if (/^\d{2}:\d{2}$/.test(req.body[field] || "")) changes[column] = req.body[field];
    }
    if (Object.keys(changes).length) await saveProfile(req.user.id, changes);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

// Envoie tout de suite un e-mail de test (bouton dans Paramètres)
app.post("/api/email/test", requireUser, async (req, res) => {
  try {
    // Sécurité / coûts : 5 e-mails de test maximum par jour et par personne
    const today = todayFrom(req);
    const { count } = await supabase.from("email_log").select("user_id", { count: "exact", head: true })
      .eq("user_id", req.user.id).eq("kind", "test").eq("day", today);
    if (count >= 5) return res.status(429).json({ error: tr(req, "err.testLimit") });
    check(await supabase.from("email_log").insert({ user_id: req.user.id, kind: "test", ref: String(Date.now()), day: today }));

    const profile = check(await supabase.from("profiles").select("*").eq("user_id", req.user.id).maybeSingle()) || {};
    const to = profile.notify_email || req.user.email;
    // L'e-mail de test est écrit dans la langue de la page
    await sendTestEmail(supabase, claude, { userId: req.user.id, to, profile: { ...profile, language: req.lang }, today: todayFrom(req) });
    res.json({ ok: true, to });
  } catch (error) {
    console.error("E-mail de test :", error.message);
    res.status(500).json({ error: tr(req, "err.emailNotSent", { msg: error.message }) });
  }
});

// --- Les notifications du téléphone ---
// La page nous donne l'"adresse" de l'appareil qui vient d'accepter les notifications : on la range.
app.post("/api/push/subscribe", requireUser, async (req, res) => {
  const s = req.body.subscription || {};
  const valid = typeof s.endpoint === "string" && s.endpoint.startsWith("https://") && s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === "string" && typeof s.keys?.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
  if (!valid) return res.status(400).json({ error: tr(req, "err.generic") });
  try {
    // upsert : si l'appareil était déjà connu (même sous un autre compte), il passe à la personne connectée
    check(await supabase.from("push_subscriptions").upsert(
      { user_id: req.user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth },
      { onConflict: "endpoint" },
    ));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, "err.pushSave");
  }
});

// L'appareil ne veut plus de notifications (ou on se déconnecte) : on oublie son adresse
app.post("/api/push/unsubscribe", requireUser, async (req, res) => {
  try {
    if (typeof req.body.endpoint === "string") {
      check(await supabase.from("push_subscriptions").delete().eq("endpoint", req.body.endpoint).eq("user_id", req.user.id));
    }
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

// "Envoie-moi une notification de test" (texte fixe : ça ne coûte rien)
app.post("/api/push/test", requireUser, async (req, res) => {
  if (!pushReady) return res.status(500).json({ error: tr(req, "err.pushOff") });
  try {
    const sent = await sendPush(supabase, req.user.id, { title: "Buddy", body: tr(req, "push.testBody"), url: "/#accueil", tag: "test", ttl: 600 });
    if (!sent) return res.status(400).json({ error: tr(req, "err.pushNone") });
    res.json({ ok: true, sent });
  } catch (error) {
    fail(res, error);
  }
});

// --- Objectifs ---
// On ne garde que les champs autorisés (on ne fait jamais confiance aveuglément à ce qui arrive).
function goalFields(body) {
  const fields = {};
  // Les longueurs sont limitées ici aussi (pas seulement dans la page, qu'on peut contourner)
  if (typeof body.text === "string" && body.text.trim()) fields.text = body.text.trim().slice(0, 120);
  if (typeof body.reason === "string") body.reason = body.reason.slice(0, 500);
  if (body.category in CATEGORIES) fields.category = body.category;
  if (typeof body.reason === "string") fields.reason = body.reason.trim() || null;
  if ("deadline" in body) fields.deadline = /^\d{4}-\d{2}-\d{2}$/.test(body.deadline || "") ? body.deadline : null;
  if ("progress" in body) fields.progress = Math.max(0, Math.min(100, Math.round(Number(body.progress) || 0)));
  return fields;
}

app.post("/api/goals", requireUser, async (req, res) => {
  const fields = goalFields(req.body);
  if (!fields.text || !fields.category) return res.status(400).json({ error: tr(req, "err.goalFields") });
  try {
    const created = check(await supabase.from("goals").insert({ ...fields, user_id: req.user.id }).select("id").single());
    res.json({ ok: true, id: created.id }); // on renvoie le numéro du nouvel objectif
  } catch (error) {
    fail(res, error);
  }
});

app.patch("/api/goals/:id", requireUser, async (req, res) => {
  try {
    check(await supabase.from("goals").update(goalFields(req.body)).eq("id", req.params.id).eq("user_id", req.user.id));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

app.delete("/api/goals/:id", requireUser, async (req, res) => {
  try {
    check(await supabase.from("goals").delete().eq("id", req.params.id).eq("user_id", req.user.id));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

// --- Tâches du jour ---
// Vérifie qu'un objectif appartient bien à la personne avant d'y lier une tâche.
async function ownGoalId(userId, goalId) {
  if (!goalId) return null;
  const goal = check(await supabase.from("goals").select("id").eq("id", goalId).eq("user_id", userId).maybeSingle());
  return goal ? goal.id : null;
}

function taskTime(time) {
  return /^\d{2}:\d{2}$/.test(time || "") ? time : null;
}

// QUAND la tâche a lieu : tous les jours (rien), certains jours (days = [1, 3, 6]) ou une date (on_date).
function taskSchedule(body, today) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(body.onDate || "")) {
    if (body.onDate < today) return { error: "err.pastDate" };
    return { days: null, on_date: body.onDate };
  }
  const days = [...new Set((body.days || []).map(Number).filter((d) => d >= 1 && d <= 7))].sort();
  if (Array.isArray(body.days) && body.days.length > 0 && days.length === 0) return { error: "err.badDays" };
  return { days: days.length > 0 && days.length < 7 ? days : null, on_date: null }; // 7 jours cochés = tous les jours
}

// Toutes les tâches "vivantes" de la personne (pour vérifier la règle des 4 par jour)
async function currentTasks(userId, today) {
  const tasks = check(await supabase.from("tasks").select("*").eq("user_id", userId).is("archived_at", null));
  return tasks.filter((t) => isCurrent(t, today));
}

// --- La "machinerie" des tâches ---
// Ces fonctions sont utilisées par les boutons de la page ET par Buddy quand il agit :
// les mêmes règles s'appliquent toujours (10 par jour, seulement SES tâches, etc.).

// Une erreur "normale" (la personne a demandé quelque chose d'impossible) : on la lui explique.
// key = le nom de la phrase dans i18n.js (traduite au moment de répondre, dans la langue de la personne).
class UserError extends Error {
  constructor(key, vars = {}) {
    super(key);
    this.key = key;
    this.vars = vars;
  }
  text(lang) { return t(this.key, this.vars, lang); }
}

async function ownTask(userId, taskId) {
  const task = check(await supabase.from("tasks").select("*").eq("id", taskId).eq("user_id", userId).maybeSingle());
  if (!task || task.archived_at) throw new UserError("err.taskNotFound");
  return task;
}

async function createTask(userId, { title, time, goalId, days, onDate }, today) {
  title = (title || "").trim().slice(0, 80);
  if (!title) throw new UserError("err.taskTitle");
  const schedule = taskSchedule({ days, onDate }, today);
  if (schedule.error) throw new UserError(schedule.error);
  // La règle d'or : MAX_TASKS tâches maximum le même jour (voir shared.js).
  const limitError = dailyLimitError(await currentTasks(userId, today), { id: null, ...schedule }, today);
  if (limitError) throw new UserError(limitError.key, limitError.vars);
  return check(await supabase.from("tasks").insert({
    user_id: userId, title, time: taskTime(time), goal_id: await ownGoalId(userId, goalId), ...schedule,
  }).select("*").single());
}

async function updateTask(userId, taskId, changes, today) {
  await ownTask(userId, taskId);
  const fields = {};
  if ((changes.title || "").trim()) fields.title = changes.title.trim();
  if ("time" in changes) fields.time = taskTime(changes.time);
  if ("goalId" in changes) fields.goal_id = await ownGoalId(userId, changes.goalId);
  if ("days" in changes || "onDate" in changes) {
    const schedule = taskSchedule(changes, today);
    if (schedule.error) throw new UserError(schedule.error);
    const limitError = dailyLimitError(await currentTasks(userId, today), { id: Number(taskId), ...schedule }, today);
    if (limitError) throw new UserError(limitError.key, limitError.vars);
    Object.assign(fields, schedule);
  }
  return check(await supabase.from("tasks").update(fields).eq("id", taskId).eq("user_id", userId).select("*").single());
}

// Supprimer = "archiver" : la tâche disparaît, mais son historique reste dans le suivi.
async function archiveTask(userId, taskId) {
  const task = await ownTask(userId, taskId);
  check(await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", taskId).eq("user_id", userId));
  return task;
}

// Cocher / décocher une tâche pour un jour donné
async function setTaskDone(userId, taskId, done, day) {
  const task = await ownTask(userId, taskId);
  if (done) check(await supabase.from("task_logs").upsert({ task_id: task.id, user_id: userId, day }));
  else check(await supabase.from("task_logs").delete().eq("task_id", task.id).eq("day", day));
  return task;
}

// Transforme une erreur en réponse pour la page
function sendError(res, error) {
  if (error instanceof UserError) return res.status(400).json({ error: error.text(res.req.lang) });
  fail(res, error);
}

app.post("/api/tasks", requireUser, async (req, res) => {
  try {
    const created = await createTask(req.user.id, req.body, todayFrom(req));
    res.json({ ok: true, id: created.id }); // on renvoie le numéro de la nouvelle tâche
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/tasks/:id", requireUser, async (req, res) => {
  try {
    await updateTask(req.user.id, req.params.id, req.body, todayFrom(req));
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/tasks/:id", requireUser, async (req, res) => {
  try {
    await archiveTask(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/tasks/:id/check", requireUser, async (req, res) => {
  try {
    await setTaskDone(req.user.id, req.params.id, Boolean(req.body.done), todayFrom(req));
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

// =============================================================
// BUDDY
// =============================================================

// La fiche que Buddy doit remplir à chaque réponse.
// C'est un "formulaire" : Claude est obligé de répondre en remplissant exactement ces cases.
const BUDDY_FORM = {
  type: "object",
  properties: {
    analyse: { type: "string", description: "1 phrase : ce que la personne exprime et ce dont elle a besoin" },
    emotion: {
      type: "string",
      enum: ["neutral", "happy", "celebrating", "understanding", "strict", "motivational",
        "hello", "empathy", "encouraging", "worried", "proud", "impressed", "laughing"],
    },
    // Le thème dont on parle EN CE MOMENT : l'application habille Buddy en conséquence (et le rhabille normalement après)
    theme: { type: "string", enum: ["aucun", "sport", "etudes", "islam", "religion", "finances", "voyages"] },
    message: { type: "string", description: "La réponse de Buddy, affichée à la personne" },
    prenom: { type: "string", description: "Prénom tout juste donné par la personne, ou vide" },
    style: { type: "string", enum: ["unchanged", "military", "supportive", "balanced"] },
    objectif_id: { type: "integer", description: "Numéro de l'objectif dont on parle, ou 0" },
    nouvel_objectif: {
      type: "object",
      properties: {
        titre: { type: "string", description: "Titre du nouvel objectif, ou vide" },
        categorie: { type: "string", enum: ["aucune", ...Object.keys(CATEGORIES)] },
        raison: { type: "string" },
      },
      required: ["titre", "categorie", "raison"],
      additionalProperties: false,
    },
    // Un objectif qu'on est EN TRAIN de définir (pas encore validé) : il apparaît en "brouillon" sur la page Mes objectifs
    objectif_en_cours: {
      type: "object",
      properties: {
        titre: { type: "string", description: "Titre provisoire de l'objectif en cours de définition, ou vide" },
        categorie: { type: "string", enum: ["aucune", ...Object.keys(CATEGORIES)] },
      },
      required: ["titre", "categorie"],
      additionalProperties: false,
    },
    plan: { type: "string", description: "Plan validé pour l'objectif, ou vide" },
    difficulte: { type: "string", description: "Nouvelle difficulté à retenir, ou vide" },
    // Ce que Buddy FAIT dans l'application (vide la plupart du temps)
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["creer_tache", "cocher_tache", "decocher_tache", "modifier_tache", "supprimer_tache", "progression_objectif"] },
          tache_id: { type: "integer", description: "Numéro de la tâche (0 pour creer_tache)" },
          objectif_id: { type: "integer", description: "Numéro de l'objectif lié, ou 0" },
          titre: { type: "string", description: "Titre de la tâche (creer/modifier), ou vide" },
          jours: { type: "array", items: { type: "integer" }, description: "1=lundi … 7=dimanche ; vide = tous les jours" },
          date: { type: "string", description: "AAAA-MM-JJ : tâche unique, ou jour à cocher ; vide sinon" },
          heure: { type: "string", description: "HH:MM, ou vide" },
          progression: { type: "integer", description: "0 à 100 pour progression_objectif, sinon -1" },
        },
        required: ["type", "tache_id", "objectif_id", "titre", "jours", "date", "heure", "progression"],
        additionalProperties: false,
      },
    },
  },
  required: ["analyse", "emotion", "theme", "message", "prenom", "style", "objectif_id", "nouvel_objectif", "objectif_en_cours", "plan", "difficulte", "actions"],
  additionalProperties: false,
};

const STYLE_NAMES = {
  military: "militaire (sans excuses)",
  supportive: "bienveillant (encourageant)",
  balanced: "équilibré (coach)",
};

const dayName = (key) => DAY_LONG[isoDay(key) - 1]; // "2026-09-24" → "jeudi"

// Écrit le bloc "Ce que tu sais sur la personne" : Buddy lit ça avant chaque réponse.
const LANGUAGE_NAMES = { fr: "français", en: "ANGLAIS (English) : tu écris tous tes messages en anglais" };

function buildContext(data, today, topicId, { badgeIds = [], review = false, lang = "fr" } = {}) {
  const { profile, goals, tasks, logs, messages } = data;
  const stats = computeStats(tasks, logs, today);
  const dateText = new Date(today + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const lines = [
    `- Langue de l'application : ${LANGUAGE_NAMES[lang]}`,
    `- Date du jour : ${dateText} (${today})`,
    `- Début de la conversation : ${messages.length === 0 ? "OUI, c'est votre toute première rencontre" : "non"}`,
    `- Prénom : ${profile.firstName || "pas encore connu"}`,
    `- Style de coaching : ${STYLE_NAMES[profile.style] || "pas encore choisi"}`,
    "",
    "## Ses objectifs",
  ];

  if (goals.length === 0) lines.push("Aucun objectif pour l'instant.");
  for (const g of goals) {
    const cat = CATEGORIES[g.category] || CATEGORIES.quotidien;
    const p = goalProgress(tasks, logs, today, g);
    const w = goalWeek(tasks, logs, today, g.id);
    lines.push(`- Objectif n°${g.id} [${cat.label}] « ${g.text} » — ` +
      (p.auto ? `régularité ${p.value} % sur 4 semaines (${p.done}/${p.planned} tâches faites), cette semaine ${w.done}/${w.planned}` : `progression ${p.value} % (mise à jour à la main)`) +
      (g.deadline ? ` — échéance ${g.deadline}` : ""));
    if (g.reason) lines.push(`  Pourquoi : ${g.reason}`);
    if (g.plan) lines.push(`  Plan validé : ${g.plan}`);
    if (g.difficulties) lines.push(`  Difficultés déjà rencontrées : ${g.difficulties.replace(/\n/g, " / ")}`);
  }

  // Les objectifs qu'on avait commencé à définir ensemble sans finir (brouillons)
  const drafts = data.drafts || [];
  if (drafts.length) {
    lines.push("", "## Objectifs en cours de définition (brouillons, pas encore validés)");
    for (const d of drafts) {
      const cat = CATEGORIES[d.category] || CATEGORIES.autre;
      lines.push(`- Brouillon n°${d.id} [${cat.label}] « ${d.text} »${topicId === d.id ? " ← la personne veut le reprendre MAINTENANT" : ""}`);
      if (d.plan) lines.push(`  Plan en discussion : ${d.plan}`);
      if (d.difficulties) lines.push(`  Difficultés évoquées : ${d.difficulties.replace(/\n/g, " / ")}`);
    }
  }

  // Décrit une tâche : titre, quand, heure, objectif, et ce qui s'est passé ces 7 derniers jours
  const describe = (task) => {
    const goal = goals.find((g) => g.id === task.goal_id);
    const history = stats.perTask.find((p) => p.task.id === task.id);
    const week = (history?.days || [])
      .filter((d) => d.status !== "none")
      .map((d) => `${dayName(d.key)} ${d.status === "done" ? "✓" : d.status === "missed" ? "✗ ratée" : "(aujourd'hui, pas encore)"}`)
      .join(", ");
    return `tâche n°${task.id} « ${task.title} » (${scheduleLabel(task)}${task.time ? ", à " + task.time : ""}${goal ? `, objectif n°${goal.id}` : ""}) — 7 derniers jours : ${week || "rien de prévu encore"}`;
  };

  const current = tasks.filter((t) => isCurrent(t, today));
  const todays = current.filter((t) => occursOn(t, today));
  lines.push("", `## Ses tâches d'aujourd'hui (${stats.today.done}/${stats.today.planned} faites, ${MAX_TASKS} maximum par jour)`);
  if (todays.length === 0) lines.push("Aucune tâche prévue aujourd'hui.");
  for (const task of todays) {
    const done = logs.some((l) => l.task_id === task.id && l.day === today);
    lines.push(`- ${done ? "FAITE" : "PAS ENCORE FAITE"} : ${describe(task)}`);
  }
  const others = current.filter((t) => !occursOn(t, today));
  if (others.length) {
    lines.push("", "## Ses tâches des autres jours");
    for (const task of others) lines.push(`- ${describe(task)}`);
  }

  lines.push(
    "",
    "## Son suivi",
    `- Cette semaine (depuis lundi) : ${stats.week.done}/${stats.week.planned} tâches faites (${stats.week.rate} %), ${stats.week.activeDays} jour(s) actif(s) sur ${stats.week.daysSoFar}`,
    `- Streak actuel : ${stats.streak} jour(s) actif(s) d'affilée (meilleur : ${stats.best}). Les jours de repos (rien de prévu) ne cassent pas la série.`,
    `- Joker de la semaine : ${stats.jokerUsedOn ? `déjà utilisé le ${dayName(stats.jokerUsedOn)} (il a protégé la série ce jour-là)` : "encore disponible (1 jour raté par semaine est pardonné)"}`,
    `- Les 7 derniers jours : ${stats.history.slice(-7).map((d) =>
      `${dayName(d.key)} ${d.status === "rest" ? "repos" : `${d.done}/${d.planned}${d.status === "joker" ? " (joker)" : d.status === "todo" ? " (en cours)" : ""}`}`).join(", ")}`,
    `- Badges gagnés : ${badgeIds.length ? BADGES.filter((b) => badgeIds.includes(b.id)).map((b) => `${b.emoji} ${b.name}`).join(", ") : "aucun pour l'instant"}`,
  );

  const topic = goals.find((g) => g.id === topicId);
  lines.push("", "## Sujet choisi pour cette conversation",
    topic ? `La personne veut parler de l'objectif n°${topic.id} « ${topic.text} ». Appuie-toi sur ses tâches et son suivi ci-dessus.` : "Aucun sujet précis choisi.");

  if (review) {
    lines.push("", "## DEMANDE SPÉCIALE : LE BILAN DE LA SEMAINE",
      "La personne te demande son bilan de la semaine. Fais-le en un seul message clair (tu peux faire un peu plus long que d'habitude) :",
      "1. Les chiffres clés de ses 7 derniers jours (tâches faites, jours actifs, streak, joker).",
      "2. Ce qui a bien marché : félicite sincèrement 1 ou 2 choses précises.",
      "3. Ce qui a coincé : la tâche ou l'objectif le moins tenu, et une hypothèse sur la cause (appuie-toi sur ses difficultés déjà notées).",
      "4. UN seul ajustement concret pour la semaine prochaine (changer un jour, une heure, réduire une tâche, en ajouter une…).",
      "5. Termine en demandant si elle valide cet ajustement. Si elle valide un changement de plan, enregistre-le (champ « plan »).");
  }
  return lines.join("\n");
}

// =============================================================
// QUAND BUDDY AGIT
// Chaque action passe par la même "machinerie" que les boutons de la page (mêmes règles, mêmes vérifications).
// Renvoie une ligne de résultat par action (✅ fait, ⚠️ pas possible).
// =============================================================
// (lang : la langue dans laquelle écrire ces lignes)
async function runBuddyActions(userId, actions, today, fallbackGoalId, lang) {
  const lines = [];
  const say = (key, vars) => lines.push(t(key, vars, lang));
  const whenOf = (task) => scheduleLabel(task, lang) + (task.time ? " · " + task.time : "");
  for (const a of actions.slice(0, 6)) { // 6 actions maximum par message, par sécurité
    try {
      if (a.type === "creer_tache") {
        const task = await createTask(userId, {
          title: a.titre, time: a.heure, goalId: a.objectif_id || fallbackGoalId || null,
          days: a.jours, onDate: a.date || null,
        }, today);
        say("act.added", { title: task.title, when: whenOf(task) });
      } else if (a.type === "cocher_tache" || a.type === "decocher_tache") {
        // Le jour à cocher : aujourd'hui, ou un des 7 derniers jours ("j'ai fait ma séance hier")
        const day = /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.date <= today && a.date >= addDays(today, -7) ? a.date : today;
        const done = a.type === "cocher_tache";
        const task = await setTaskDone(userId, a.tache_id, done, day);
        const when = day === today ? "" : ` (${dayLong(isoDay(day), lang)})`;
        say(done ? "act.checked" : "act.unchecked", { title: task.title, when });
      } else if (a.type === "modifier_tache") {
        const changes = {};
        if (a.titre.trim()) changes.title = a.titre;
        if (a.heure) changes.time = a.heure;
        if (a.jours.length || a.date) Object.assign(changes, { days: a.jours, onDate: a.date || null });
        if (a.objectif_id) changes.goalId = a.objectif_id;
        const task = await updateTask(userId, a.tache_id, changes, today);
        say("act.edited", { title: task.title, when: whenOf(task) });
      } else if (a.type === "supprimer_tache") {
        const task = await archiveTask(userId, a.tache_id);
        say("act.deleted", { title: task.title });
      } else if (a.type === "progression_objectif") {
        const goal = check(await supabase.from("goals").select("id, text").eq("id", a.objectif_id).eq("user_id", userId).maybeSingle());
        if (!goal) throw new UserError("err.goalNotFound");
        const linked = (await currentTasks(userId, today)).filter((task) => task.goal_id === goal.id).length;
        if (linked > 0) {
          say("act.autoProgress", { goal: goal.text });
        } else {
          const progress = Math.max(0, Math.min(100, a.progression));
          check(await supabase.from("goals").update({ progress }).eq("id", goal.id).eq("user_id", userId));
          say("act.progress", { goal: goal.text, p: progress });
        }
      }
      console.log(`🤖 Buddy agit : ${a.type} ${a.titre || a.tache_id || a.objectif_id || ""}`);
    } catch (error) {
      if (!(error instanceof UserError)) console.error("Action de Buddy :", error.message);
      say("act.failed", { type: t("act." + a.type, {}, lang), reason: error instanceof UserError ? error.text(lang) : t("act.techIssue", {}, lang) });
    }
  }
  return lines;
}

// Quand on envoie un message à Buddy.
// Si "message" est vide, c'est la toute première visite : Buddy parle en premier.
app.post("/api/chat", requireUser, async (req, res) => {
  const userId = req.user.id;
  const review = req.body.review === true; // la personne demande son bilan de la semaine
  const text = (req.body.message || "").trim() || (review ? tr(req, "say.review") : "");
  // Sécurité / coûts : un message de 2 000 caractères maximum (environ une page)
  if (text.length > 2000) return res.status(400).json({ error: tr(req, "err.tooLong") });
  const today = todayFrom(req);
  const topicId = Number(req.body.goalId) || 0;

  try {
    // GARDE-FOU SUR LES COÛTS : un nombre maximum de messages sur les dernières 24 heures, par personne.
    // (On compte sur 24 h plutôt que "depuis minuit" : ça marche pareil quel que soit le fuseau horaire.)
    if (text) {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase.from("messages").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("role", "user").gte("created_at", since24h);
      if (count >= MAX_MESSAGES_PER_DAY) {
        return res.status(429).json({
          error: tr(req, "err.messageLimit", { max: MAX_MESSAGES_PER_DAY }),
        });
      }
    }

    const data = await loadAll(userId, today);
    const badgeIds = check(await supabase.from("user_badges").select("badge_id").eq("user_id", userId)).map((b) => b.badge_id);
    if (review) await saveProfile(userId, { reviews_count: data.profile.reviewsCount + 1 });

    // La fiche de personnalité (relue à chaque fois : tu peux la modifier sans redémarrer).
    // On la coupe en 2 : la partie FIXE (la personnalité), puis ce que Buddy sait sur la personne.
    // La partie fixe est mise "en cache" chez Anthropic : relue depuis le cache, elle coûte 10 fois moins cher
    // (valable 5 minutes : parfait pendant une conversation).
    const [fixedPart, afterContext = ""] = fs.readFileSync(PROMPT_FILE, "utf-8").split("{{CONTEXTE}}");
    const system = [
      { type: "text", text: fixedPart, cache_control: { type: "ephemeral" } },
      // Ce que Buddy sait, calculé dans le fuseau horaire de la personne
      { type: "text", text: withTimeZone(data.profile.timezone, () => buildContext(data, today, topicId, { badgeIds, review, lang: req.lang })) + afterContext },
    ];

    // La conversation envoyée à Claude (les 40 derniers messages suffisent :
    // la mémoire longue de Buddy, ce sont les objectifs, plans et difficultés enregistrés).
    // Claude exige qu'une conversation commence par un message de la personne :
    // si Buddy a parlé en premier, on ajoute une petite ligne invisible au début.
    const conversation = data.messages.slice(-40).map((m) => ({ role: m.role, content: m.content }));
    if (conversation.length === 0 || conversation[0].role === "assistant") {
      conversation.unshift({ role: "user", content: req.lang === "en" ? "[The person opens the Buddy app.]" : "[La personne ouvre l'application Buddy.]" });
    }
    if (text) conversation.push({ role: "user", content: text });

    const response = await claude.messages.create({
      model: "claude-haiku-4-5", // le modèle Haiku 4.5 : rapide et pas cher
      max_tokens: 2000,
      system,
      messages: conversation,
      output_config: { format: { type: "json_schema", schema: BUDDY_FORM } }, // "remplis ce formulaire"
    });
    const u = response.usage;
    console.log(`💰 Tokens : ${u.input_tokens} normaux + ${u.cache_read_input_tokens || 0} lus en cache + ${u.cache_creation_input_tokens || 0} mis en cache, ${u.output_tokens} écrits`);

    if (response.stop_reason !== "end_turn") {
      throw new Error("Réponse incomplète de Claude (" + response.stop_reason + ")");
    }

    // La fiche remplie arrive sous forme de texte JSON : on la "déplie".
    const buddy = JSON.parse(response.content.find((block) => block.type === "text").text);
    console.log(`🧠 Buddy pense : ${buddy.analyse}  →  émotion : ${buddy.emotion}, thème : ${buddy.theme}`);

    // Buddy a peut-être noté un prénom ou un nouveau style.
    const profileChanges = {};
    if (buddy.prenom.trim()) profileChanges.first_name = buddy.prenom.trim();
    if (buddy.style !== "unchanged") profileChanges.communication_style = buddy.style;
    if (Object.keys(profileChanges).length > 0) await saveProfile(userId, profileChanges);

    // Buddy a peut-être créé un nouvel objectif…
    let goalId = data.goals.some((g) => g.id === buddy.objectif_id) ? buddy.objectif_id : topicId;
    // … le brouillon dont on parle en ce moment (s'il y en a un)
    const draft = data.drafts.find((d) => d.id === topicId) || data.drafts.find((d) => d.id === buddy.objectif_id);
    const newGoal = buddy.nouvel_objectif;
    const pending = buddy.objectif_en_cours;
    if (newGoal.titre.trim() && newGoal.categorie in CATEGORIES) {
      const fields = { text: newGoal.titre.trim(), category: newGoal.categorie, reason: newGoal.raison.trim() || null };
      if (draft) {
        // Le brouillon devient un vrai objectif (même numéro : son plan et ses difficultés sont gardés)
        check(await supabase.from("goals").update({ ...fields, draft: false }).eq("id", draft.id).eq("user_id", userId));
        goalId = draft.id;
      } else {
        const created = check(await supabase.from("goals").insert({ user_id: userId, ...fields }).select("id").single());
        goalId = created.id;
      }
      console.log(`🎯 Nouvel objectif créé par Buddy : ${newGoal.titre}`);
    } else if (pending.titre.trim()) {
      // Un objectif en cours de définition : on le range en brouillon (visible sur la page Mes objectifs,
      // avec "Continuer" / "Abandonner"). Rangé à part : si la colonne "draft" n'existe pas encore
      // dans Supabase (supabase-drafts.sql pas lancé), la discussion marche quand même.
      const fields = { text: pending.titre.trim().slice(0, 120), category: pending.categorie in CATEGORIES ? pending.categorie : "autre" };
      try {
        if (draft) {
          check(await supabase.from("goals").update(fields).eq("id", draft.id).eq("user_id", userId));
          goalId = draft.id;
        } else if (!data.goals.some((g) => g.id === goalId)) {
          const created = check(await supabase.from("goals").insert({ user_id: userId, ...fields, draft: true }).select("id").single());
          goalId = created.id;
          console.log(`📝 Objectif en brouillon : ${fields.text}`);
        }
      } catch (error) {
        console.error("Brouillon d'objectif non enregistré (as-tu lancé supabase-drafts.sql ?) :", error.message);
      }
    }

    // … ou noté un plan / une difficulté pour l'objectif dont on parle.
    const goal = goalId && (data.goals.find((g) => g.id === goalId) || data.drafts.find((g) => g.id === goalId) || { id: goalId, difficulties: null });
    if (goal && buddy.plan.trim()) {
      check(await supabase.from("goals").update({ plan: buddy.plan.trim() }).eq("id", goal.id).eq("user_id", userId));
    }
    if (goal && buddy.difficulte.trim()) {
      const difficulties = [goal.difficulties, `${today} : ${buddy.difficulte.trim()}`].filter(Boolean).join("\n");
      check(await supabase.from("goals").update({ difficulties }).eq("id", goal.id).eq("user_id", userId));
    }

    // Buddy AGIT dans l'application (créer, cocher, modifier… des tâches). Le résultat de chaque action
    // est ajouté sous son message : la personne voit ce qui a été fait, et Buddy s'en souviendra.
    const results = await runBuddyActions(userId, buddy.actions || [], today, goalId, req.lang);
    const reply = results.length ? `${buddy.message}\n\n${results.join("\n")}` : buddy.message;

    // On range les messages (le tien, s'il y en a un, puis celui de Buddy avec son émotion).
    const rows = [];
    if (text) rows.push({ role: "user", content: text, user_id: userId });
    rows.push({ role: "assistant", content: reply, emotion: buddy.emotion, user_id: userId });
    check(await supabase.from("messages").insert(rows));

    res.json({ reply, emotion: buddy.emotion, theme: buddy.theme, goalId: goalId || null, userText: text, acted: results.length > 0 });
  } catch (error) {
    fail(res, error, claudeErrorMessage(error) || "err.buddyFailed");
  }
});

// =============================================================
// LES PHRASES DE MOTIVATION DU JOUR
// Écrites par Buddy une fois par jour et par personne, adaptées à ses objectifs.
// =============================================================
const QUOTE_FORM = {
  type: "object",
  properties: {
    courte: { type: "string", description: "Phrase très courte (6 à 10 mots) pour le menu" },
    longue: { type: "string", description: "Phrase de motivation (12 à 25 mots, 2 phrases maximum) pour la grande carte" },
  },
  required: ["courte", "longue"],
  additionalProperties: false,
};

app.get("/api/quote", requireUser, async (req, res) => {
  const userId = req.user.id;
  const today = todayFrom(req);
  const en = req.lang === "en";
  try {
    const profile = check(await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle());

    // Déjà écrites aujourd'hui (et dans cette langue) ? On les renvoie telles quelles.
    if (profile?.quote_day === today && profile.quote_short && (profile.language || "fr") === req.lang) {
      return res.json({ short: profile.quote_short, long: profile.quote_long });
    }

    const goals = check(await supabase.from("goals").select("*").eq("user_id", userId)).filter((g) => !g.draft);
    const goalsText = goals.length
      ? goals.map((g) => `- [${(CATEGORIES[g.category] || CATEGORIES.autre).label}] ${g.text}`).join("\n")
      : "Pas encore d'objectif : parle de discipline, de progression et de passage à l'action en général.";

    const response = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: `Tu écris les 2 phrases de motivation du jour de l'application Buddy (coaching personnel), ${en ? "en ANGLAIS (English), sur un ton direct et amical" : "en français, en tutoyant"}.
Adapte-les aux objectifs de la personne et à leur domaine (sport, études, finances, commerce, voyages…) : ce jour, choisis UN de ses objectifs ou domaines et parle son langage.
Style de coaching choisi : ${STYLE_NAMES[profile?.communication_style] || "non précisé"}.
Règles :
- Des phrases originales, concrètes et fortes, pas de clichés. Chaque jour doit être différent des phrases d'hier.
- COURTES : la courte fait 10 mots maximum, la longue 25 mots maximum (2 phrases au plus). Une idée forte, pas un paragraphe.
- Pas de nom d'auteur inventé. Tu peux citer une citation célèbre UNIQUEMENT si tu es certain de l'auteur et du texte exact.
${religionRule(goals)}
- La courte ne met pas de guillemets. La longue est entre ${en ? "“ ”" : "« »"}.`,
      messages: [{
        role: "user",
        content: `Date : ${today}\nSes objectifs :\n${goalsText}\n\nPhrases d'hier (à ne pas répéter) :\n- ${profile?.quote_short || "aucune"}\n- ${profile?.quote_long || "aucune"}`,
      }],
      output_config: { format: { type: "json_schema", schema: QUOTE_FORM } },
    });
    const quotes = JSON.parse(response.content.find((b) => b.type === "text").text);

    await saveProfile(userId, { quote_day: today, quote_short: quotes.courte.trim(), quote_long: quotes.longue.trim() });
    console.log(`💬 Phrases du jour écrites : ${quotes.courte}`);
    res.json({ short: quotes.courte.trim(), long: quotes.longue.trim() });
  } catch (error) {
    console.error("Phrases du jour :", error.message);
    res.json({ short: tr(req, "quote.short"), long: tr(req, "quote.long") }); // en cas de souci : les phrases par défaut
  }
});

// =============================================================
// LA "SONNETTE" DES RAPPELS (pour la version en ligne)
// En ligne, le serveur ne tourne pas en continu : un service extérieur appelle cette adresse
// toutes les minutes, et Buddy vérifie alors qui doit recevoir un e-mail.
// Protégée par un mot de passe (CRON_SECRET dans les réglages) pour que personne d'autre ne sonne.
// =============================================================
app.all("/api/cron/tick", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.authorization || "").replace("Bearer ", "") || req.query.key;
  if (!secret || given !== secret) return res.status(403).json({ error: "Accès refusé." });
  try {
    await runEmailTick(supabase, claude);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

// Sur ton ordinateur : on démarre le serveur nous-mêmes, avec sa minuterie d'e-mails.
// En ligne (Vercel) : c'est Vercel qui démarre le serveur à chaque visite, et la "sonnette" remplace la minuterie.
if (!ONLINE) {
  app.listen(PORT, (error) => {
    if (error) {
      // Le plus souvent : un autre serveur Buddy tourne déjà et occupe la "porte" 3000.
      console.error(`❌ Impossible de démarrer : la porte ${PORT} est déjà occupée (un autre serveur Buddy tourne sans doute déjà).`);
      process.exit(1);
    }
    console.log(`Buddy est prêt ! Ouvre http://localhost:${PORT} dans ton navigateur.`);
    // Les e-mails automatiques sont envoyés par le site EN LIGNE. Sur l'ordinateur, on ne les envoie pas
    // (sinon les deux se marchent dessus), sauf si on le demande avec LOCAL_EMAILS=1 dans .env.
    if (process.env.LOCAL_EMAILS === "1") startEmailScheduler(supabase, claude);
    else console.log("📧 E-mails automatiques : envoyés par le site en ligne (pas depuis cet ordinateur).");
  });
}

export default app; // pour Vercel
