// shared.js – ce fichier est utilisé À LA FOIS par la page (app.js) et par le serveur (server.js).
// Comme ça, les catégories et les calculs de statistiques sont les mêmes partout :
// ce que tu vois à l'écran = ce que Buddy sait.

// =============================================================
// LES 7 CATÉGORIES (pour en ajouter une, il suffit d'ajouter une ligne ici)
// =============================================================
export const CATEGORIES = {
  sport:     { label: "Sport",     emoji: "🏋️", icon: "dumbbell",       color: "var(--orange)" },
  etudes:    { label: "Études",    emoji: "📚", icon: "book-open",      color: "var(--blue)" },
  religion:  { label: "Religion",  emoji: "🕌", icon: "moon-star",      color: "var(--green)" },
  finances:  { label: "Finances",  emoji: "💰", icon: "coins",          color: "var(--yellow)" },
  voyages:   { label: "Voyages",   emoji: "✈️", icon: "plane",          color: "var(--red)" },
  quotidien: { label: "Quotidien", emoji: "🏠", icon: "house",          color: "var(--violet)" },
  autre:     { label: "Autre",     emoji: "✨", icon: "sparkles",       color: "var(--teal)" },
};

// Maximum de tâches par jour. 10 pendant la phase de test ;
// on pourra le baisser (ou le lier à une offre payante) plus tard : il suffit de changer ce chiffre.
// La "version" du code. Le serveur et la page la comparent : si elles sont différentes,
// c'est que le serveur tourne encore avec un vieux code → la page demande de le redémarrer.
// (À changer à chaque grosse modification.)
export const APP_VERSION = "2026-09-26c";

export const MAX_TASKS = 10;

// GARDE-FOU SUR LES COÛTS : chaque message à Buddy coûte environ 1 centime (Claude).
// Maximum de messages qu'une personne peut envoyer à Buddy par jour. À ajuster librement.
export const MAX_MESSAGES_PER_DAY = 40;

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

export const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const DAY_LONG = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

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
export function scheduleLabel(task) {
  if (task.on_date) {
    return "Le " + keyToUTC(task.on_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  }
  if (task.days && task.days.length && task.days.length < 7) {
    return [...task.days].sort().map((d) => DAY_SHORT[d - 1]).join(", ");
  }
  return "Tous les jours";
}

// La tâche est-elle encore "vivante" ? (pas supprimée, et pas une date unique déjà passée)
export function isCurrent(task, today) {
  return !task.archived_at && (!task.on_date || task.on_date >= today);
}

// Vérifie la règle "MAX_TASKS tâches maximum par jour" avant d'ajouter ou de modifier une tâche.
// Renvoie un message d'erreur, ou null si tout va bien.
export function dailyLimitError(tasks, candidate, today) {
  const others = tasks.filter((t) => isCurrent(t, today) && t.id !== candidate.id);
  // Les jours à vérifier : la date unique, ou les 7 prochains jours (un de chaque jour de la semaine)
  const daysToCheck = candidate.on_date ? [candidate.on_date] : [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(today, n));
  for (const key of daysToCheck) {
    if (!occursOn(candidate, key)) continue;
    const count = others.filter((t) => occursOn(t, key)).length;
    if (count >= MAX_TASKS) {
      const when = candidate.on_date ? "Ce jour-là" : "Le " + DAY_LONG[isoDay(key) - 1];
      return `${when}, tu as déjà ${MAX_TASKS} tâches. Retire-en une ou choisis d'autres jours.`;
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
export function computeStats(tasks, logs, today) {
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

  return { today: dayResult(tasks, logs, today), week, streak, best, history, weeks, perTask, jokerUsedOn };
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
// Pour en ajouter un : ajoute une ligne ici.
// =============================================================
export const BADGES = [
  { id: "first_goal",   emoji: "🎯", name: "Cap fixé",           desc: "Créer ton premier objectif",                     test: (c) => c.goals >= 1 },
  { id: "first_task",   emoji: "👣", name: "Premier pas",        desc: "Cocher ta première tâche",                       test: (c) => c.totalDone >= 1 },
  { id: "perfect_day",  emoji: "✅", name: "Journée parfaite",   desc: "Faire toutes tes tâches d'une journée",          test: (c) => c.perfectDays >= 1 },
  { id: "streak_3",     emoji: "🔥", name: "Lancé",              desc: "3 jours actifs d'affilée",                       test: (c) => c.best >= 3 },
  { id: "streak_7",     emoji: "⚡", name: "Semaine de feu",     desc: "7 jours actifs d'affilée",                       test: (c) => c.best >= 7 },
  { id: "streak_30",    emoji: "🏆", name: "Inarrêtable",        desc: "30 jours actifs d'affilée",                      test: (c) => c.best >= 30 },
  { id: "tasks_50",     emoji: "💪", name: "50 actions",         desc: "Cocher 50 tâches",                               test: (c) => c.totalDone >= 50 },
  { id: "tasks_100",    emoji: "💯", name: "Centurion",          desc: "Cocher 100 tâches",                              test: (c) => c.totalDone >= 100 },
  { id: "perfect_week", emoji: "🌟", name: "Semaine parfaite",   desc: "Une semaine entière (lundi → dimanche) à 100 %", test: (c) => c.perfectWeeks >= 1 },
  { id: "joker_saved",  emoji: "🛡️", name: "Sauvé par le joker", desc: "Ton joker a protégé ta série",                   test: (c) => c.jokerSaves >= 1 },
  { id: "first_review", emoji: "🧭", name: "Introspection",      desc: "Faire ton premier bilan de la semaine avec Buddy", test: (c) => c.reviews >= 1 },
  { id: "goal_done",    emoji: "🏁", name: "Objectif atteint",   desc: "Amener un objectif à 100 %",                     test: (c) => c.goalsDone >= 1 },
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
