// emails.js – le "bureau de poste" de Buddy.
// Toutes les minutes, il regarde s'il faut envoyer un e-mail à quelqu'un :
//   🌅 le mot du matin, 🌙 le récap du soir, ⏰ un rappel 5 minutes avant une tâche.
// Chaque e-mail est écrit par Claude (jamais le même) puis envoyé avec Resend.

import { Resend } from "resend";
import {
  CATEGORIES, HISTORY_DAYS, DAY_LONG, dayKey, addDays, isoDay, occursOn, isCurrent, computeStats, religionRule, goalProgress,
  withTimeZone, timeHHMM, hasPremium, FREE_LIMITS, bonusJokersFor,
} from "./public/shared.js";
import { t, cleanLang } from "./public/i18n.js";
import { sendPush, pushReady } from "./push.js";

// La langue de la personne (choisie avec le bouton FR/EN, enregistrée dans son profil)
const langOf = (profile) => cleanLang(profile.language) || "fr";

// Le fuseau utilisé si la page ne nous a pas encore dit celui de la personne
const DEFAULT_TIMEZONE = "Europe/Paris";

// "2026-09-23" → "mercredi 23" (Claude se trompe moins de jour avec le nom écrit en toutes lettres)
const dayLabel = (key) => `${DAY_LONG[isoDay(key) - 1]} ${Number(key.slice(8))}`;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// L'adresse d'expédition. Réglable avec EMAIL_FROM (dans .env ou sur Vercel), par exemple
// "Buddy <buddy@buddycoach.app>" une fois le domaine vérifié chez Resend.
// Sans domaine vérifié, Resend oblige à utiliser son adresse de test :
const FROM = process.env.EMAIL_FROM || "Buddy <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// La fiche que Claude remplit pour chaque rappel : l'e-mail ET la notification du téléphone (en une seule fois)
const EMAIL_FORM = {
  type: "object",
  properties: {
    sujet: { type: "string", description: "Objet de l'e-mail : précis et personnel, 45 caractères max" },
    message: { type: "string", description: "Le texte de l'e-mail, 2 à 5 phrases, paragraphes séparés par une ligne vide" },
    notif_titre: { type: "string", description: "Titre de la notification du téléphone : 35 caractères max, précis (avec son prénom, s'il est connu et pas déjà dans le texte)" },
    notif_texte: { type: "string", description: "Texte de la notification : UNE phrase, 90 caractères max, qui donne envie d'ouvrir (avec son prénom, s'il est connu et pas déjà dans le titre)" },
  },
  required: ["sujet", "message", "notif_titre", "notif_texte"],
  additionalProperties: false,
};

const STYLE_NAMES = {
  military: "militaire : sec, exigeant, zéro excuse, phrases courtes",
  supportive: "bienveillant : chaleureux et rassurant, mais adulte (jamais gnangnan)",
  balanced: "équilibré : direct, exigeant quand il faut, reconnaît les vrais efforts",
};

// "08:30" → 510 (le nombre de minutes depuis minuit)
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Pour que les e-mails ne se ressemblent jamais : chaque e-mail reçoit un "angle" tiré au hasard.
const ANGLES = [
  "commence par une question directe et précise",
  "commence par un chiffre précis de sa semaine (série, tâches faites) et ce qu'il veut dire",
  "va droit à la tâche la plus importante du jour",
  "rappelle en une phrase POURQUOI son objectif compte pour lui (sa raison, s'il l'a donnée)",
  "sois ultra bref : 2 phrases, pas une de plus",
  "commence par une observation honnête sur sa régularité",
  "pose un petit défi concret et mesurable pour aujourd'hui",
];
const pickAngle = () => ANGLES[Math.floor(Math.random() * ANGLES.length)];

// =============================================================
// ÉCRIRE UN E-MAIL AVEC CLAUDE
// =============================================================
export async function writeEmail(claude, kind, info) {
  const { profile, goals, todays, stats, task, today } = info;
  const name = profile.first_name || "la personne";
  const en = langOf(profile) === "en";
  const goalsText = goals.length
    ? goals.map((g) => `- [${(CATEGORIES[g.category] || CATEGORIES.autre).label}] ${g.text} (${g.progress} %)${g.deadline ? ` — échéance : ${g.deadline}` : ""}${g.reason ? ` — sa raison : « ${g.reason} »` : ""}`).join("\n")
    : "Aucun objectif pour l'instant.";
  const tasksText = todays.length
    ? todays.map((t) => `- ${t.done ? "✓ FAITE" : "○ pas faite"} : ${t.title}${t.time ? " à " + t.time : ""}`).join("\n")
    : "Aucune tâche prévue aujourd'hui.";

  const instructions = {
    morning: `Écris le MOT DU MATIN : ce qui l'attend aujourd'hui (les tâches, la plus importante d'abord) et pourquoi ça compte, en lien avec UN de ses objectifs. Pas de « bonne journée ! » creux.`,
    evening: `Écris le POINT DU SOIR : le résultat exact de la journée (X tâches sur Y). Si tout est fait, reconnais-le en une phrase sobre. S'il manque quelque chose, nomme la tâche et pose UNE vraie question pour comprendre ce qui a bloqué. Invite à répondre à Buddy dans l'application.`,
    task: `Écris un RAPPEL : la tâche « ${task?.title} » commence à ${task?.time}, dans 5 minutes. 1 à 2 phrases, pas plus : ce qu'il faut faire maintenant, concrètement.`,
    weekly: `Écris le BILAN DE LA SEMAINE (c'est dimanche soir), droit au but : les chiffres de la semaine d'abord (tâches faites, jours actifs, série, joker), 1 vraie réussite précise, 1 point qui a coincé. Termine en invitant à faire le bilan complet avec Buddy pour ajuster la semaine prochaine.`,
  }[kind];
  // Pour le bilan de la semaine, Claude a besoin du détail des 7 derniers jours
  const weekDetail = stats.history.slice(-7)
    .map((d) => `${dayLabel(d.key)} : ${d.status === "rest" ? "repos" : `${d.done}/${d.planned}${d.status === "joker" ? " (sauvé par le joker)" : ""}`}`)
    .join(" · ");

  const response = await claude.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    system: `Tu es Buddy, le coach personnel de l'application Buddy. Tu écris à ${name} un e-mail ET le texte de la notification de son téléphone, ${en
      ? "en ANGLAIS (English) : tout est entièrement en anglais"
      : "en français, en tutoyant"}.
Style de coaching choisi : ${STYLE_NAMES[profile.communication_style] || STYLE_NAMES.balanced}.
${instructions}

LE TON (très important) :
- Tu parles comme un vrai coach qui connaît la personne, d'adulte à adulte. Direct, sobre, personnel. Pas comme une pub, pas comme un animateur de colonie.
- INTERDIT : l'enthousiasme forcé et les formules marketing (« Tu vas tout déchirer ! », « C'est ton moment ! », « Let's go ! », « Ne lâche rien ! », « Tu es incroyable »), les points d'exclamation à répétition, les MAJUSCULES pour crier, les métaphores clichés (montagne, sommet, marathon de la vie…), les questions rhétoriques creuses.
- 0 ou 1 emoji au maximum, et seulement s'il apporte quelque chose.
- Commence directement par le concret : la tâche, le chiffre, l'objectif. Pas d'introduction, pas de « J'espère que tu vas bien ».
- Sois spécifique : nomme SES tâches et SES objectifs avec leurs vrais mots. Un message qu'on pourrait envoyer à n'importe qui est raté.
- Même en style bienveillant : chaleureux mais adulte, jamais infantilisant.

L'OBJET ET LA NOTIFICATION (c'est ce qui décide si la personne ouvre) :
${profile.first_name
    ? `- OBLIGATOIRE : son prénom est ${profile.first_name}. Il apparaît TOUJOURS dans la notification (une seule fois : dans le titre OU dans le texte), et la première phrase de l'e-mail commence par lui (ex : « ${profile.first_name}, il te reste la lecture ce soir. »). C'est ce qui fait sentir que Buddy la connaît. Varie sa place d'un message à l'autre (début du titre, début ou fin du texte).`
    : "- Son prénom n'est pas connu : n'en invente pas, et ne mets pas de formule du type « Salut toi »."}
- Précis et personnel : ils contiennent un vrai élément de sa journée (le nom de la tâche, l'heure, un chiffre). Exemples de l'esprit attendu (ne les recopie pas) : « 18h : ta séance de course », « 2 sur 3 aujourd'hui. Et la lecture ? », « 5 jours d'affilée. On garde le rythme ».
- Donne envie d'ouvrir par la curiosité ou l'enjeu, jamais par le racolage (pas de « Tu ne devineras jamais », pas de « Urgent »).
- La notification se comprend seule, en un coup d'œil sur l'écran verrouillé.

RÈGLES :
- Chaque message doit être différent des précédents. Angle imposé pour celui-ci : ${pickAngle()}.
- Utilise le vocabulaire du domaine de ses objectifs (sport, études, finances, voyages…) quand c'est naturel.
${religionRule(goals)}
- N'invente aucune tâche ni aucun chiffre, et ne modifie JAMAIS un chiffre des objectifs (si l'objectif dit « 10 km », c'est 10 km) : utilise seulement les données ci-dessous, recopiées exactement.
- N'invente aucune durée ni date (« dans 2 mois », « plus que 3 semaines ») : parle d'une échéance seulement si elle est donnée ci-dessous.
- Tu ne sais pas si la personne est un homme ou une femme : pas de « champion », « prêt », « il », « frère »… Formule de façon neutre.
- E-mail court : 2 à 5 phrases, en 1 à 3 petits paragraphes. Pas de Markdown (pas de ** ni de #). Pas de signature (elle est ajoutée automatiquement).`,
    messages: [{
      role: "user",
      content: `Date : ${dayLabel(today)} (${today})\n\nSes objectifs :\n${goalsText}\n\nSes tâches d'aujourd'hui :\n${tasksText}\n\nSon streak : ${stats.streak} jour(s) d'affilée. Cette semaine : ${stats.week.done}/${stats.week.planned} tâches faites, ${stats.week.activeDays} jour(s) actif(s). Joker de la semaine : ${stats.jokerUsedOn ? "utilisé le " + dayLabel(stats.jokerUsedOn) : "pas utilisé"}.${stats.bonusJokers ? ` Jokers bonus Premium restants ce mois-ci : ${stats.bonusLeft}/${stats.bonusJokers}.` : ""}\nLes 7 derniers jours : ${weekDetail}`,
    }],
    output_config: { format: { type: "json_schema", schema: EMAIL_FORM } },
  });
  return JSON.parse(response.content.find((b) => b.type === "text").text);
}

// =============================================================
// LA MISE EN PAGE DE L'E-MAIL (du HTML simple, aux couleurs de Buddy)
// =============================================================
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function emailHtml(kind, message, lang = "fr") {
  const badge = t("mail." + kind, {}, lang); // "🌅 Le mot du matin", "🌙 Evening recap"…
  // Le bouton du bilan ouvre directement le bilan avec Buddy ; celui de la fin d'essai, les Paramètres (l'abonnement)
  const link = kind === "weekly" ? APP_URL + "/#bilan" : kind === "trial" ? APP_URL + "/#parametres" : APP_URL;
  const button = t(kind === "weekly" ? "mail.btnWeekly" : kind === "trial" ? "mail.btnManage" : "mail.btnOpen", {}, lang);
  const paragraphs = message.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  // Les couleurs de Buddy : fond menthe très clair, carte blanche, texte navy, bouton menthe
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#eef6f3;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dbe8e3;border-radius:18px;padding:28px;color:#14284b">
    <div style="font-size:22px;font-weight:800;margin-bottom:8px;color:#14284b"><img src="${APP_URL}/icons/logo.png" width="34" height="34" alt="" style="vertical-align:middle;margin-right:8px">Buddy</div>
    <div style="display:inline-block;font-size:13px;font-weight:700;color:#0c8a70;background:#e8f4f0;border-radius:99px;padding:5px 12px;margin-bottom:20px">${badge}</div>
    <div style="font-size:16px;line-height:1.6;color:#14284b">${paragraphs}</div>
    <a href="${link}" style="display:inline-block;margin-top:10px;background:#5fe2c3;color:#14284b;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:99px">${button}</a>
    <p style="margin:24px 0 0;font-size:12px;color:#64748b">${t(kind === "trial" ? "mail.footerTrial" : "mail.footer", {}, lang)}</p>
  </div></body></html>`;
}

// =============================================================
// PRÉPARER ET ENVOYER UN E-MAIL À UNE PERSONNE
// =============================================================
// Rassemble ce qu'il faut savoir sur la personne aujourd'hui (calculé dans SON fuseau horaire)
async function gatherInfo(supabase, userId, today, timezone, bonusJokers = 0) {
  const since = addDays(today, -(HISTORY_DAYS + 5));
  const [goalsRes, tasksRes, logsRes] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", userId), // "*" : marche aussi avant/après l'ajout de la colonne "draft"
    supabase.from("tasks").select("*").eq("user_id", userId).or(`archived_at.is.null,archived_at.gte.${since}`),
    supabase.from("task_logs").select("task_id, day").eq("user_id", userId).gte("day", since),
  ]);
  for (const r of [goalsRes, tasksRes, logsRes]) if (r.error) throw r.error;
  const tasks = tasksRes.data;
  const logs = logsRes.data;
  return withTimeZone(timezone, () => {
    const todays = tasks
      .filter((t) => isCurrent(t, today) && occursOn(t, today))
      .map((t) => ({ ...t, done: logs.some((l) => l.task_id === t.id && l.day === today) }))
      .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    // Le % de chaque objectif, calculé comme dans l'application (automatique s'il a des tâches liées)
    const goals = goalsRes.data
      .filter((g) => !g.draft) // les brouillons (objectifs pas encore définis) ne comptent pas
      .map((g) => ({ ...g, progress: goalProgress(tasks, logs, today, g).value }));
    return { goals, todays, stats: computeStats(tasks, logs, today, bonusJokers) };
  });
}

// Envoie UN rappel (écrit une seule fois par Claude) :
//   1. en NOTIFICATION sur ses téléphones / ordinateurs, si la personne les a activées (gratuit) ;
//   2. par E-MAIL si elle n'a pas de notification, ou si elle a demandé les deux (et toujours pour l'e-mail de test).
async function sendOne(supabase, claude, { userId, to, profile, kind, task, today }) {
  const info = await gatherInfo(supabase, userId, today, profile.timezone || DEFAULT_TIMEZONE, bonusJokersFor(profile));
  const written = await writeEmail(claude, kind === "test" ? "morning" : kind, { ...info, profile, task, today });

  let pushed = 0;
  if (kind !== "test") {
    pushed = await sendPush(supabase, userId, {
      title: written.notif_titre,
      body: written.notif_texte,
      url: kind === "weekly" ? "/#bilan" : "/#accueil",
      tag: kind === "task" ? "task-" + task.id : kind, // une nouvelle notification du même genre remplace l'ancienne
      ttl: kind === "task" ? 600 : 4 * 3600,          // un rappel "dans 5 min" ne doit pas arriver des heures après
    });
    if (pushed) console.log(`🔔 Notification "${kind}" envoyée (${pushed} appareil(s)) : ${written.notif_titre}`);
  }

  if (resend && (kind === "test" || !pushed || profile.email_with_push)) {
    const { error } = await resend.emails.send({ from: FROM, to, subject: written.sujet, html: emailHtml(kind, written.message, langOf(profile)), text: written.message });
    if (error) throw new Error(error.message);
    console.log(`📧 E-mail "${kind}" envoyé à ${to} : ${written.sujet}`);
  } else if (!pushed) {
    throw new Error("ni notification ni e-mail possible");
  }
}

// Note dans le carnet qu'un e-mail part. Renvoie false s'il était déjà parti (on ne l'envoie pas 2 fois).
async function markSent(supabase, userId, kind, ref, day) {
  const { error } = await supabase.from("email_log").insert({ user_id: userId, kind, ref, day });
  return !error; // erreur = la ligne existait déjà
}

// Envoie un e-mail automatique UNE seule fois. S'il n'a pas pu partir (Resend, Claude…),
// on le raye du carnet : il sera réessayé à la minute suivante (tant qu'on est dans le bon créneau).
async function sendOnce(supabase, claude, base, kind, ref = "", task = null) {
  // Version gratuite (hors mode démo) : 3 rappels par jour maximum (e-mails et notifications confondus)
  if (!hasPremium(base.profile)) {
    const { count } = await supabase.from("email_log").select("user_id", { count: "exact", head: true })
      .eq("user_id", base.userId).eq("day", base.today);
    if (count >= FREE_LIMITS.remindersPerDay) return;
  }
  if (!(await markSent(supabase, base.userId, kind, ref, base.today))) return; // déjà parti
  try {
    await sendOne(supabase, claude, { ...base, kind, task });
  } catch (error) {
    await supabase.from("email_log").delete().match({ user_id: base.userId, kind, ref, day: base.today });
    throw error;
  }
}

// 💳 Fin de l'essai gratuit Premium : un e-mail 2 jours avant la fin (= le 5e jour d'un essai de 7 jours).
// Promis dans les conditions. Un seul e-mail par essai, et rien si la personne a déjà annulé.
// (Un texte fixe, pas écrit par Claude : c'est une information sur le paiement, elle doit être exacte.)
const TRIAL_NOTICE_HOURS = 48;
async function sendTrialReminder(supabase, { userId, to, profile, today }) {
  if (!resend || profile.subscription_status !== "trialing" || !profile.trial_ends_at || profile.cancel_at_period_end) return;
  const left = new Date(profile.trial_ends_at).getTime() - Date.now();
  if (left <= 0 || left > TRIAL_NOTICE_HOURS * 3600 * 1000) return;
  const ref = String(profile.trial_ends_at).slice(0, 10); // l'essai (sa date de fin)
  const { count } = await supabase.from("email_log").select("user_id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", "trial").eq("ref", ref);
  if (count) return; // déjà prévenu pour cet essai
  if (!(await markSent(supabase, userId, "trial", ref, today))) return;
  const lang = langOf(profile);
  const date = new Date(profile.trial_ends_at).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR",
    { weekday: "long", day: "numeric", month: "long", timeZone: profile.timezone || DEFAULT_TIMEZONE });
  const message = t("trial.body", { date }, lang);
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject: t("trial.subject", { date }, lang), html: emailHtml("trial", message, lang), text: message });
    if (error) throw new Error(error.message);
    console.log(`📧 Rappel de fin d'essai envoyé à ${to}`);
  } catch (error) {
    await supabase.from("email_log").delete().match({ user_id: userId, kind: "trial", ref, day: today });
    throw error;
  }
}

// Un e-mail de test, envoyé tout de suite (bouton dans Paramètres)
export async function sendTestEmail(supabase, claude, { userId, to, profile, today }) {
  if (!resend) throw new Error("Il manque la clé RESEND_API_KEY dans .env.");
  await sendOne(supabase, claude, { userId, to, profile, kind: "test", today });
}

// =============================================================
// LE RÉVEIL : toutes les minutes, on regarde qui doit recevoir quoi
// Sur ton ordinateur : une minuterie le lance toutes les minutes.
// En ligne (Vercel) : un service extérieur "sonne" à l'adresse /api/cron/tick toutes les minutes.
// =============================================================
export async function runEmailTick(supabase, claude) {
  if (!resend && !pushReady) return;
  const { data: usersPage, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  // On lit tout ce qu'il faut en QUELQUES demandes groupées (et pas 3 demandes par personne et par minute) :
  // chaque demande à Supabase est notée dans ses journaux, et la version gratuite n'en accepte qu'1 Go par mois.
  const since = addDays(dayKey(new Date()), -1); // hier (le "aujourd'hui" de chacun dépend de son fuseau horaire)
  const [{ data: profiles }, { data: timedTasks }, { data: recentLogs }] = await Promise.all([
    supabase.from("profiles").select("*"),
    // seulement les tâches qui ont une heure (les seules qui ont un rappel "5 minutes avant")
    supabase.from("tasks").select("id, user_id, title, time, days, on_date, created_at, archived_at").is("archived_at", null).not("time", "is", null),
    supabase.from("task_logs").select("task_id, day").gte("day", since),
  ]);

  // Réglages par défaut (tout activé) pour quelqu'un qui n'a encore rien modifié
  const DEFAULTS = { email_morning: true, morning_time: "08:00", email_evening: true, evening_time: "21:00", email_tasks: true, email_weekly: true };

  // Seulement les comptes CONFIRMÉS : écrire à une adresse non vérifiée (ou fausse) fait "rebondir" l'e-mail,
  // et trop de rebonds abîment la réputation du domaine (les vrais e-mails finiraient dans les spams).
  const confirmed = usersPage.users.filter((u) => u.email_confirmed_at);

  // Tout le monde EN MÊME TEMPS (et pas l'un après l'autre) : la "sonnette" répond vite,
  // sinon le service qui sonne chaque minute croit à une panne et finit par se désactiver.
  await Promise.all(confirmed.map(async (user) => {
    const profile = { ...DEFAULTS, ...(profiles?.find((p) => p.user_id === user.id) || {}) };
    const to = profile.notify_email || user.email; // par défaut : l'adresse du compte
    // Le jour et l'heure… À L'HEURE DE LA PERSONNE (pas celle du serveur)
    const timezone = profile.timezone || DEFAULT_TIMEZONE;
    const today = withTimeZone(timezone, () => dayKey(new Date()));
    const now = toMinutes(withTimeZone(timezone, () => timeHHMM(new Date())));
    const isSunday = isoDay(today) === 7;
    const base = { userId: user.id, to, profile, today };

    try {
      // 💳 Fin d'essai Premium : à l'adresse du COMPTE (c'est elle qui est liée au paiement)
      await sendTrialReminder(supabase, { userId: user.id, to: user.email, profile, today });

      // 🌅 Le matin : dans l'heure qui suit l'heure choisie (si le serveur était éteint à 8h pile, ça part à 8h20)
      const morning = toMinutes(profile.morning_time || "08:00");
      if (profile.email_morning && now >= morning && now < morning + 60) {
        await sendOnce(supabase, claude, base, "morning");
      }

      // 🌙 Le soir. Le dimanche, le bilan de la semaine remplace le récap du jour (un seul e-mail).
      const evening = toMinutes(profile.evening_time || "21:00");
      const eveningKind = isSunday && profile.email_weekly ? "weekly" : profile.email_evening ? "evening" : null;
      if (eveningKind && now >= evening && now < evening + 60) {
        await sendOnce(supabase, claude, base, eveningKind);
      }

      // ⏰ 5 minutes avant chaque tâche du jour qui a une heure (et qui n'est pas déjà faite)
      if (profile.email_tasks) {
        const mine = withTimeZone(timezone, () =>
          (timedTasks || []).filter((task) => task.user_id === user.id && isCurrent(task, today) && occursOn(task, today)));
        for (const task of mine) {
          const start = toMinutes(task.time);
          if (now < start - 5 || now >= start) continue;
          const done = (recentLogs || []).some((l) => l.task_id === task.id && l.day === today);
          if (!done) await sendOnce(supabase, claude, base, "task", String(task.id), task);
        }
      }
    } catch (e) {
      console.error(`📧 Souci d'e-mail pour ${to} :`, e.message);
    }
  }));
}

// Sur ton ordinateur seulement : une minuterie qui lance le réveil toutes les minutes
export function startEmailScheduler(supabase, claude) {
  if (!resend) {
    console.log("📧 E-mails désactivés : ajoute RESEND_API_KEY dans .env pour les activer.");
    return;
  }
  console.log("📧 Le bureau de poste de Buddy est ouvert (vérification toutes les minutes).");
  const run = () => runEmailTick(supabase, claude).catch((e) => console.error("📧 Erreur du bureau de poste :", e.message));
  run();
  setInterval(run, 60 * 1000);
}
