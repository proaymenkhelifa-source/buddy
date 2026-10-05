// shared.js – ce fichier est utilisé À LA FOIS par la page (app.js) et par le serveur (server.js).
// Comme ça, les catégories et les calculs de statistiques sont les mêmes partout :
// ce que tu vois à l'écran = ce que Buddy sait.

import { t, locale, dayShort, DAYS } from "./i18n.js";

// =============================================================
// LES 7 CATÉGORIES (pour en ajouter une : une ligne ici + son nom dans i18n.js, "cat.xxx")
// Le nom affiché ("label") est lu dans le dictionnaire, dans la langue en cours.
// =============================================================
const category = (id, emoji, icon, color) => ({ emoji, icon, color, get label() { return t("cat." + id); } });
export const CATEGORIES = {
  // l'icône = son nom dans la bibliothèque d'icônes Phosphor (le style de la marque)
  sport:     category("sport",     "🏋️", "barbell",       "var(--orange)"),
  etudes:    category("etudes",    "📚", "laptop",        "var(--blue)"),
  religion:  category("religion",  "🕌", "mosque",        "var(--green)"),
  finances:  category("finances",  "💰", "coins",         "var(--yellow)"),
  voyages:   category("voyages",   "✈️", "airplane-tilt", "var(--red)"),
  quotidien: category("quotidien", "🏠", "coffee",        "var(--violet)"),
  autre:     category("autre",     "✨", "sparkle",       "var(--teal)"),
};

// Maximum de tâches par jour. 10 pendant la phase de test ;
// on pourra le baisser (ou le lier à une offre payante) plus tard : il suffit de changer ce chiffre.
// La "version" du code. Le serveur et la page la comparent : si elles sont différentes,
// c'est que le serveur tourne encore avec un vieux code → la page demande de le redémarrer.
// (À changer à chaque grosse modification.)
export const APP_VERSION = "2026-10-05-install";

export const MAX_TASKS = 10;

// GARDE-FOU SUR LES COÛTS : chaque message à Buddy coûte environ 1 centime (Claude).
// Maximum de messages par jour en Premium ("sans limite" pour une personne normale : juste un anti-abus).
// En mode démo, tout le monde est à ce niveau. À ajuster librement.
export const MAX_MESSAGES_PER_DAY = 100;

// =============================================================
// L'OFFRE PREMIUM
// =============================================================
// ⭐ L'INTERRUPTEUR DU MODE DÉMO ⭐
//   true  = phase de test : TOUT LE MONDE a TOUT (Premium ou gratuit), aucune limite, aucun écran "passe Premium".
//   false = le vrai lancement : les limites de la version gratuite (ci-dessous) s'appliquent,
//           et l'écran Premium court s'affiche quand une personne gratuite atteint une limite.
// Pour changer : remplace true par false (ou l'inverse), enregistre, et mets en ligne. C'est tout.
export const DEMO_MODE = true;

// Les limites de la version GRATUITE (actives seulement quand DEMO_MODE = false).
// Premium = les limites "normales" ci-dessus (MAX_TASKS, MAX_MESSAGES_PER_DAY), sans limite de rappels.
export const FREE_LIMITS = {
  tasksPerDay: 5,         // 5 tâches par jour maximum
  messagesPerDay: 20,     // 20 messages par jour avec Buddy
  styles: ["balanced"],   // seulement le coaching "Équilibré"
  remindersPerDay: 3,     // 3 rappels (e-mails / notifications) par jour maximum
};
export const TRIAL_DAYS = 7;

// Premium : en plus du joker de la semaine (pour tout le monde), des jokers BONUS chaque mois
export const PREMIUM_BONUS_JOKERS = 3;

// La personne a-t-elle droit à tout ? (profile.plan : "premium", "free", ou vide si pas encore choisi)
// Plus tard, avec les vrais paiements (App Store / Google Play), c'est ICI qu'on vérifiera l'abonnement.
export function hasPremium(profile) {
  return DEMO_MODE || profile?.plan === "premium";
}
export const taskLimitFor = (profile) => (hasPremium(profile) ? MAX_TASKS : FREE_LIMITS.tasksPerDay);
export const messageLimitFor = (profile) => (hasPremium(profile) ? MAX_MESSAGES_PER_DAY : FREE_LIMITS.messagesPerDay);
export const styleAllowed = (profile, style) => hasPremium(profile) || FREE_LIMITS.styles.includes(style);
export const bonusJokersFor = (profile) => (hasPremium(profile) ? PREMIUM_BONUS_JOKERS : 0);

// La règle "religion" donnée à Claude (e-mails, phrases du jour), décidée par le CODE et non par Claude :
// pas d'objectif dans la catégorie Religion = aucune expression religieuse, jamais.
export function religionRule(goals) {
  const religious = goals.filter((g) => g.category === "religion").map((g) => `« ${g.text} »`);
  if (religious.length === 0) {
    return "- La personne n'a AUCUN objectif religieux : n'utilise AUCUNE expression ou référence religieuse (pas de « salam », « bismillah », « inshallah », « qu'Allah… », « amen », « Dieu », « prière »…). Reste sur ses vrais objectifs.";
  }
  return `- La personne a un objectif religieux : ${religious.join(", ")}. Tu peux utiliser avec mesure des expressions de SA religion, telle qu'elle apparaît dans cet objectif (par exemple pour l'islam : « bismillah », « qu'Allah te facilite »). Si sa religion n'est pas claire, reste neutre. Ne cite un texte sacré (verset, hadith…) que si tu es certain du texte exact et de sa source, et indique la source.`;
}

// =============================================================
// LES DATES
// On représente un jour par un texte "AAAA-MM-JJ" (ex : "2026-09-24"),
// c'est simple à comparer et à ranger.
//
// LE FUSEAU HORAIRE : un même instant n'est pas le même jour partout
// (23h30 à Paris, c'est déjà 00h30… non, 21h30 à Londres !). Dans le navigateur, on utilise
// l'heure de l'ordinateur. Sur le serveur (qui peut être à Londres), on calcule avec
// le fuseau de la personne, grâce à withTimeZone().
// =============================================================
let currentTimeZone = null; // null = l'heure de l'ordinateur

// Fait un calcul "comme si on était dans le fuseau tz" (ex : "Europe/Paris")
export function withTimeZone(tz, fn) {
  const previous = currentTimeZone;
  currentTimeZone = tz || null;
  try { return fn(); } finally { currentTimeZone = previous; }
}

// Un instant (une date avec l'heure) → le jour "AAAA-MM-JJ" dans le bon fuseau
export function dayKey(date) {
  const d = new Date(date);
  if (currentTimeZone) {
    // "en-CA" écrit les dates au format AAAA-MM-JJ
    return new Intl.DateTimeFormat("en-CA", { timeZone: currentTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// L'heure "HH:MM" dans le bon fuseau (pour les rappels)
export function timeHHMM(date = new Date()) {
  // hourCycle "h23" : de 00:00 à 23:59 (jamais "24:05")
  return new Intl.DateTimeFormat("fr-FR", { timeZone: currentTimeZone || undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

// Les calculs sur les jours ("AAAA-MM-JJ" + 3 jours, quel jour de la semaine…) se font en "UTC" :
// comme ça ils donnent le même résultat partout dans le monde.
const keyToUTC = (key) => new Date(key + "T12:00:00Z");
const utcToKey = (d) => d.toISOString().slice(0, 10);

// Ajoute (ou retire) des jours à un "AAAA-MM-JJ"
export function addDays(key, n) {
  const d = keyToUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToKey(d);
}

// Le numéro du jour de la semaine : 1 = lundi … 7 = dimanche
export function isoDay(key) {
  return ((keyToUTC(key).getUTCDay() + 6) % 7) + 1;
}

// Le lundi de la semaine d'un jour donné
export function mondayOf(key) {
  return addDays(key, -(isoDay(key) - 1));
}

// Les noms des jours en français (pour les consignes données à Claude, écrites en français).
// Pour l'affichage, on utilise dayShort / dayLong de i18n.js, dans la langue choisie.
export const DAY_LONG = DAYS.fr.long;

// =============================================================
// QUAND UNE TÂCHE A-T-ELLE LIEU ?
// Une tâche peut avoir lieu : tous les jours / certains jours de la semaine (days) / une seule date (on_date).
// =============================================================
export function occursOn(task, key) {
  if (task.on_date) return task.on_date === key;
  if (task.days && task.days.length) return task.days.includes(isoDay(key));
  return true; // tous les jours
}

// Un petit texte lisible : "Tous les jours", "Lun, Mer, Sam", "Le jeudi 2 octobre"
// (dans la langue en cours ; lang permet d'en choisir une autre)
export function scheduleLabel(task, lang) {
  if (task.on_date) {
    const date = keyToUTC(task.on_date).toLocaleDateString(locale(lang), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    return t("sched.on", { date }, lang);
  }
  if (task.days && task.days.length && task.days.length < 7) {
    return [...task.days].sort().map((d) => dayShort(d, lang)).join(", ");
  }
  return t("sched.daily", {}, lang);
}

// La tâche est-elle encore "vivante" ? (pas supprimée, et pas une date unique déjà passée)
export function isCurrent(task, today) {
  return !task.archived_at && (!task.on_date || task.on_date >= today);
}

// Vérifie la règle "MAX_TASKS tâches maximum par jour" avant d'ajouter ou de modifier une tâche.
// Renvoie l'erreur à afficher ({ key, vars } : le nom de la phrase dans i18n.js), ou null si tout va bien.
// max : la limite de la personne (taskLimitFor : 10 en Premium, 5 en gratuit hors mode démo).
export function dailyLimitError(tasks, candidate, today, max = MAX_TASKS) {
  const others = tasks.filter((t) => isCurrent(t, today) && t.id !== candidate.id);
  // Les jours à vérifier : la date unique, ou les 7 prochains jours (un de chaque jour de la semaine)
  const daysToCheck = candidate.on_date ? [candidate.on_date] : [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(today, n));
  for (const key of daysToCheck) {
    if (!occursOn(candidate, key)) continue;
    const count = others.filter((t) => occursOn(t, key)).length;
    if (count >= max) {
      return candidate.on_date
        ? { key: "err.limitDate", vars: { max } }
        : { key: "err.limitDay", vars: { max, day: isoDay(key) } };
    }
  }
  return null;
}

// =============================================================
// LES STATISTIQUES
// tasks : toutes les tâches (y compris supprimées récemment)
// logs  : les coches [{ task_id, day }]
// today : le jour d'aujourd'hui "AAAA-MM-JJ"
// =============================================================

// Une tâche était-elle "prévue" ce jour-là ?
// (créée avant ou ce jour-là, pas encore supprimée, et c'est un de ses jours)
export function isPlanned(task, key) {
  const created = dayKey(task.created_at);
  const archived = task.archived_at ? dayKey(task.archived_at) : null;
  return (created <= key || task.on_date === key) && (!archived || archived > key) && occursOn(task, key);
}

// Une tâche a-t-elle été faite ce jour-là ?
export function isDone(logs, taskId, key) {
  return logs.some((l) => l.task_id === taskId && l.day === key);
}

// Le bilan d'un jour : combien de tâches prévues, combien faites
export function dayResult(tasks, logs, key) {
  const planned = tasks.filter((t) => isPlanned(t, key));
  const done = planned.filter((t) => isDone(logs, t.id, key));
  return { key, planned: planned.length, done: done.length };
}

// Combien de jours d'historique on regarde (pour le streak, les badges, le suivi)
export const HISTORY_DAYS = 90;

// Tout le suivi en un seul appel
// bonusJokers = combien de jokers bonus par mois (Premium : 3, gratuit : 0)
export function computeStats(tasks, logs, today, bonusJokers = 0) {
  // Les 90 derniers jours (du plus ancien au plus récent), avec l'état de chaque jour :
  //   "active" = au moins une tâche faite · "rest" = rien de prévu (jour de repos)
  //   "missed" = des tâches prévues, aucune faite · "joker" = raté, mais pardonné par le joker
  //   "todo"   = aujourd'hui, pas encore fini
  const history = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const day = dayResult(tasks, logs, addDays(today, -i));
    day.status = day.planned === 0 ? "rest" : day.done > 0 ? "active" : day.key === today ? "todo" : "missed";
    history.push(day);
  }

  // Le JOKER : chaque semaine (lundi → dimanche), le premier jour raté est pardonné automatiquement.
  const jokerWeeks = new Map(); // lundi de la semaine → jour où le joker a servi
  for (const day of history) {
    if (day.status !== "missed") continue;
    const week = mondayOf(day.key);
    if (!jokerWeeks.has(week)) {
      jokerWeeks.set(week, day.key);
      day.status = "joker";
    }
  }
  const jokerUsedOn = jokerWeeks.get(mondayOf(today)) || null; // null = joker encore disponible cette semaine

  // Les jokers BONUS (Premium) : chaque mois, les jours ratés qui restent sont pardonnés aussi,
  // jusqu'à "bonusJokers" jours par mois. Ils servent tout seuls, dans l'ordre des jours.
  const bonusUsed = new Map(); // mois "AAAA-MM" → nombre de jokers bonus utilisés
  for (const day of history) {
    if (day.status !== "missed" || !bonusJokers) continue;
    const month = day.key.slice(0, 7);
    const used = bonusUsed.get(month) || 0;
    if (used < bonusJokers) {
      bonusUsed.set(month, used + 1);
      day.status = "joker";
      day.bonus = true;
    }
  }
  const bonusLeft = bonusJokers - (bonusUsed.get(today.slice(0, 7)) || 0); // jokers bonus qui restent ce mois-ci

  // Cette semaine : du lundi à aujourd'hui
  const monday = mondayOf(today);
  const weekDays = history.filter((d) => d.key >= monday);
  const week = {
    planned: weekDays.reduce((sum, d) => sum + d.planned, 0),
    done: weekDays.reduce((sum, d) => sum + d.done, 0),
    activeDays: weekDays.filter((d) => d.done > 0).length,
    daysSoFar: weekDays.length,
  };
  week.rate = week.planned ? Math.round((week.done / week.planned) * 100) : 0;

  // Le STREAK : le nombre de jours actifs d'affilée, en remontant depuis aujourd'hui.
  // Un jour de repos, un jour sauvé par le joker ou la journée pas encore finie ne cassent pas la série ;
  // seul un jour vraiment raté la casse.
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const status = history[i].status;
    if (status === "active") streak++;
    else if (status === "missed") break;
  }

  // Le meilleur streak sur la période (même règle)
  let best = 0, run = 0;
  for (const d of history) {
    if (d.status === "active") { run++; best = Math.max(best, run); }
    else if (d.status === "missed") run = 0;
  }

  // Les 4 dernières semaines (de la plus ancienne à la plus récente)
  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    const start = addDays(monday, -7 * w);
    const days = history.filter((d) => d.key >= start && d.key <= addDays(start, 6));
    const planned = days.reduce((s, d) => s + d.planned, 0);
    const done = days.reduce((s, d) => s + d.done, 0);
    weeks.push({ start, planned, done, rate: planned ? Math.round((done / planned) * 100) : 0 });
  }

  // Le détail des 7 derniers jours pour chaque tâche active
  const last7 = [];
  for (let d = 6; d >= 0; d--) last7.push(addDays(today, -d));
  const perTask = tasks
    .filter((t) => !t.archived_at && (!t.on_date || (t.on_date >= last7[0] && t.on_date <= today)))
    .map((t) => ({
      task: t,
      days: last7.map((key) => ({
        key,
        status: !isPlanned(t, key) ? "none" : isDone(logs, t.id, key) ? "done" : key === today ? "todo" : "missed",
      })),
    }));

  return { today: dayResult(tasks, logs, today), week, streak, best, history, weeks, perTask, jokerUsedOn, bonusJokers, bonusLeft };
}

// La régularité d'UN objectif cette semaine (lundi → aujourd'hui) :
// combien de ses tâches étaient prévues, combien ont été faites. Calculé tout seul à partir des coches.
export function goalWeek(tasks, logs, today, goalId) {
  const goalTasks = tasks.filter((t) => t.goal_id === goalId);
  let planned = 0, done = 0;
  for (let key = mondayOf(today); key <= today; key = addDays(key, 1)) {
    for (const t of goalTasks) {
      if (!isPlanned(t, key)) continue;
      planned++;
      if (isDone(logs, t.id, key)) done++;
    }
  }
  return { planned, done };
}

// LE % D'UN OBJECTIF
// - S'il a des tâches liées : calculé AUTOMATIQUEMENT = sa régularité sur les 4 dernières semaines
//   (tâches faites / tâches prévues), depuis la création de l'objectif si elle est plus récente.
// - Sinon : le % mis à la main (ou par Buddy), pour les objectifs sans tâche (ex : "Économiser 5 000 €").
export function goalProgress(tasks, logs, today, goal) {
  const goalTasks = tasks.filter((t) => t.goal_id === goal.id);
  const created = goal.created_at ? dayKey(goal.created_at) : addDays(today, -27);
  const start = created > addDays(today, -27) ? created : addDays(today, -27);
  let planned = 0, done = 0;
  for (let key = start; key <= today; key = addDays(key, 1)) {
    for (const t of goalTasks) {
      if (!isPlanned(t, key)) continue;
      // Aujourd'hui ne compte que si c'est déjà fait (la journée n'est pas finie)
      if (key === today && !isDone(logs, t.id, key)) continue;
      planned++;
      if (isDone(logs, t.id, key)) done++;
    }
  }
  if (planned === 0) return { auto: false, value: goal.progress || 0 };
  return { auto: true, value: Math.round((done / planned) * 100), done, planned };
}

// =============================================================
// LES BADGES
// Chaque badge a une condition ("test"). Une fois gagné, il est enregistré pour toujours.
// Pour en ajouter un : ajoute une ligne ici + son nom et sa description dans i18n.js ("badge.xxx").
// =============================================================
const badge = (id, emoji, test) => ({
  id, emoji, test,
  get name() { return t("badge." + id); },
  get desc() { return t("badge." + id + ".desc"); },
});
export const BADGES = [
  badge("first_goal",   "🎯", (c) => c.goals >= 1),
  badge("first_task",   "👣", (c) => c.totalDone >= 1),
  badge("perfect_day",  "✅", (c) => c.perfectDays >= 1),
  badge("streak_3",     "🔥", (c) => c.best >= 3),
  badge("streak_7",     "⚡", (c) => c.best >= 7),
  badge("streak_30",    "🏆", (c) => c.best >= 30),
  badge("tasks_50",     "💪", (c) => c.totalDone >= 50),
  badge("tasks_100",    "💯", (c) => c.totalDone >= 100),
  badge("perfect_week", "🌟", (c) => c.perfectWeeks >= 1),
  badge("joker_saved",  "🛡️", (c) => c.jokerSaves >= 1),
  badge("first_review", "🧭", (c) => c.reviews >= 1),
  badge("goal_done",    "🏁", (c) => c.goalsDone >= 1),
];

// Rassemble les chiffres dont les badges ont besoin
export function badgeFacts({ stats, goals, totalDone, reviews, today }) {
  const h = stats.history;
  // Un joker "sauve" une série s'il y a un jour actif avant ET après lui
  const jokerSaves = h.filter((d, i) =>
    d.status === "joker" && h.slice(0, i).some((x) => x.status === "active") && h.slice(i + 1).some((x) => x.status === "active")).length;
  // Semaines complètes (déjà finies) où tout ce qui était prévu a été fait
  const perfectWeeks = stats.weeks.filter((w) => w.planned > 0 && w.done === w.planned && addDays(w.start, 6) < today).length;
  return {
    goals: goals.length,
    goalsDone: goals.filter((g) => g.progress >= 100).length,
    totalDone,
    reviews,
    best: stats.best,
    perfectDays: h.filter((d) => d.planned > 0 && d.done === d.planned).length,
    perfectWeeks,
    jokerSaves,
  };
}
