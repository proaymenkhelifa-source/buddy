// emails.js – le "bureau de poste" de Buddy.
// Toutes les minutes, il regarde s'il faut envoyer un e-mail à quelqu'un :
//   🌅 le mot du matin, 🌙 le récap du soir, ⏰ un rappel 5 minutes avant une tâche.
// Chaque e-mail est écrit par Claude (jamais le même) puis envoyé avec Resend.

import { Resend } from "resend";
import {
  CATEGORIES, HISTORY_DAYS, DAY_LONG, dayKey, addDays, isoDay, occursOn, isCurrent, computeStats, religionRule, goalProgress,
  withTimeZone, timeHHMM,
} from "./public/shared.js";

// Le fuseau utilisé si la page ne nous a pas encore dit celui de la personne
const DEFAULT_TIMEZONE = "Europe/Paris";

// "2026-09-23" → "mercredi 23" (Claude se trompe moins de jour avec le nom écrit en toutes lettres)
const dayLabel = (key) => `${DAY_LONG[isoDay(key) - 1]} ${Number(key.slice(8))}`;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Sans nom de domaine vérifié, Resend oblige à envoyer depuis cette adresse de test :
const FROM = "Buddy <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// La fiche que Claude remplit pour chaque e-mail
const EMAIL_FORM = {
  type: "object",
  properties: {
    sujet: { type: "string", description: "Objet de l'e-mail, court et accrocheur (max 60 caractères)" },
    message: { type: "string", description: "Le texte de l'e-mail, 2 à 6 phrases, paragraphes séparés par une ligne vide" },
  },
  required: ["sujet", "message"],
  additionalProperties: false,
};

const STYLE_NAMES = {
  military: "militaire (sans excuses, très direct)",
  supportive: "bienveillant (chaleureux, rassurant)",
  balanced: "équilibré (encourage et challenge)",
};

// "08:30" → 510 (le nombre de minutes depuis minuit)
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Pour que les e-mails ne se ressemblent jamais : chaque e-mail reçoit un "angle" tiré au hasard.
const ANGLES = [
  "commence par une question directe",
  "utilise une image ou une métaphore tirée du domaine de ses objectifs",
  "appuie-toi sur un chiffre précis de sa semaine (streak, tâches faites)",
  "propose un mini-défi concret pour aujourd'hui",
  "rappelle pourquoi ses objectifs comptent vraiment",
  "sois ultra bref et percutant",
  "commence par une observation sur sa progression",
  "termine par une phrase courte qui claque",
];
const pickAngle = () => ANGLES[Math.floor(Math.random() * ANGLES.length)];

// =============================================================
// ÉCRIRE UN E-MAIL AVEC CLAUDE
// =============================================================
export async function writeEmail(claude, kind, info) {
  const { profile, goals, todays, stats, task, today } = info;
  const name = profile.first_name || "la personne";
  const goalsText = goals.length
    ? goals.map((g) => `- [${(CATEGORIES[g.category] || CATEGORIES.autre).label}] ${g.text} (${g.progress} %)`).join("\n")
    : "Aucun objectif pour l'instant.";
  const tasksText = todays.length
    ? todays.map((t) => `- ${t.done ? "✓ FAITE" : "○ pas faite"} : ${t.title}${t.time ? " à " + t.time : ""}`).join("\n")
    : "Aucune tâche prévue aujourd'hui.";

  const instructions = {
    morning: `Écris le MOT DU MATIN : souhaite une bonne journée et du courage, rappelle très brièvement 1 ou 2 objectifs, et annonce les tâches du jour. Termine par une phrase qui donne envie de s'y mettre.`,
    evening: `Écris le RÉCAP DU SOIR : fais le bilan des tâches du jour (faites / pas faites), félicite sincèrement ce qui a été fait, et pour ce qui n'a pas été fait, pose une question pour comprendre sans culpabiliser. Demande comment s'est passée la journée et invite à venir en parler à Buddy dans l'application.`,
    task: `Écris un RAPPEL : la tâche « ${task?.title} » commence à ${task?.time}, dans 5 minutes. Très court (2-3 phrases) : donne l'élan pour la commencer maintenant.`,
    weekly: `Écris le BILAN DE LA SEMAINE (c'est dimanche soir) : les chiffres clés de la semaine (tâches faites, jours actifs, streak, joker), 1 chose à féliciter précisément, 1 point qui a coincé. Termine en l'invitant à cliquer sur le bouton pour faire le bilan complet avec Buddy et ajuster son plan pour la semaine prochaine.`,
  }[kind];
  // Pour le bilan de la semaine, Claude a besoin du détail des 7 derniers jours
  const weekDetail = stats.history.slice(-7)
    .map((d) => `${dayLabel(d.key)} : ${d.status === "rest" ? "repos" : `${d.done}/${d.planned}${d.status === "joker" ? " (sauvé par le joker)" : ""}`}`)
    .join(" · ");

  const response = await claude.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    system: `Tu es Buddy, le coach personnel de l'application Buddy. Tu écris un e-mail à ${name}, en français, en la tutoyant, comme un ami coach.
Style de coaching choisi : ${STYLE_NAMES[profile.communication_style] || "équilibré (encourage et challenge)"}.
${instructions}
Règles :
- Chaque e-mail doit être différent : varie les formulations, les images, les angles. Jamais de formule toute faite.
- Utilise le vocabulaire du domaine de ses objectifs (sport, études, finances, voyages…).
${religionRule(goals)}
- Angle imposé pour CET e-mail (pour qu'il ne ressemble pas aux précédents) : ${pickAngle()}.
- N'invente aucune tâche ni aucun chiffre, et ne modifie JAMAIS un chiffre des objectifs (si l'objectif dit « 10 km », c'est 10 km) : utilise seulement les données ci-dessous, recopiées exactement.
- Tu ne sais pas si la personne est un homme ou une femme : pas de « champion », « prêt », « il », « frère »… Formule de façon neutre (« tu te sens d'attaque ? »).
- Court et percutant : 3 à 6 phrases au total, en 2 ou 3 petits paragraphes.
- Pas de Markdown (pas de ** ni de #). Pas de signature (elle est ajoutée automatiquement).`,
    messages: [{
      role: "user",
      content: `Date : ${dayLabel(today)} (${today})\n\nSes objectifs :\n${goalsText}\n\nSes tâches d'aujourd'hui :\n${tasksText}\n\nSon streak : ${stats.streak} jour(s) d'affilée. Cette semaine : ${stats.week.done}/${stats.week.planned} tâches faites, ${stats.week.activeDays} jour(s) actif(s). Joker de la semaine : ${stats.jokerUsedOn ? "utilisé le " + dayLabel(stats.jokerUsedOn) : "pas utilisé"}.\nLes 7 derniers jours : ${weekDetail}`,
    }],
    output_config: { format: { type: "json_schema", schema: EMAIL_FORM } },
  });
  return JSON.parse(response.content.find((b) => b.type === "text").text);
}

// =============================================================
// LA MISE EN PAGE DE L'E-MAIL (du HTML simple, aux couleurs de Buddy)
// =============================================================
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function emailHtml(kind, message) {
  const badge = { morning: "🌅 Le mot du matin", evening: "🌙 Le récap du soir", task: "⏰ C'est bientôt l'heure", weekly: "🧭 Le bilan de la semaine", test: "✉️ E-mail de test" }[kind];
  // Le bouton du bilan ouvre directement le bilan avec Buddy dans l'application
  const link = kind === "weekly" ? APP_URL + "/#bilan" : APP_URL;
  const button = kind === "weekly" ? "Faire mon bilan avec Buddy →" : "Ouvrir Buddy →";
  const paragraphs = message.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#07090f;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#121621;border:1px solid #232838;border-radius:18px;padding:28px;color:#f3efe8">
    <div style="font-size:22px;font-weight:800;margin-bottom:6px">Buddy<span style="color:#f6b73c">.</span></div>
    <div style="display:inline-block;font-size:13px;font-weight:700;color:#f6b73c;background:rgba(246,183,60,.14);border-radius:99px;padding:5px 12px;margin-bottom:20px">${badge}</div>
    <div style="font-size:16px;line-height:1.6">${paragraphs}</div>
    <a href="${link}" style="display:inline-block;margin-top:10px;background:#f6b73c;color:#1d1305;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:99px">${button}</a>
    <p style="margin:24px 0 0;font-size:12px;color:#9aa1b5">— Buddy, ton coach. Tu peux régler ces e-mails dans Paramètres.</p>
  </div></body></html>`;
}

// =============================================================
// PRÉPARER ET ENVOYER UN E-MAIL À UNE PERSONNE
// =============================================================
// Rassemble ce qu'il faut savoir sur la personne aujourd'hui (calculé dans SON fuseau horaire)
async function gatherInfo(supabase, userId, today, timezone) {
  const since = addDays(today, -(HISTORY_DAYS + 5));
  const [goalsRes, tasksRes, logsRes] = await Promise.all([
    supabase.from("goals").select("id, text, category, progress, created_at").eq("user_id", userId),
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
    const goals = goalsRes.data.map((g) => ({ ...g, progress: goalProgress(tasks, logs, today, g).value }));
    return { goals, todays, stats: computeStats(tasks, logs, today) };
  });
}

async function sendOne(supabase, claude, { userId, to, profile, kind, task, today }) {
  const info = await gatherInfo(supabase, userId, today, profile.timezone || DEFAULT_TIMEZONE);
  const { sujet, message } = await writeEmail(claude, kind === "test" ? "morning" : kind, { ...info, profile, task, today });
  const { error } = await resend.emails.send({ from: FROM, to, subject: sujet, html: emailHtml(kind, message), text: message });
  if (error) throw new Error(error.message);
  console.log(`📧 E-mail "${kind}" envoyé à ${to} : ${sujet}`);
}

// Note dans le carnet qu'un e-mail part. Renvoie false s'il était déjà parti (on ne l'envoie pas 2 fois).
async function markSent(supabase, userId, kind, ref, day) {
  const { error } = await supabase.from("email_log").insert({ user_id: userId, kind, ref, day });
  return !error; // erreur = la ligne existait déjà
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
  if (!resend) return;
  const { data: usersPage, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const { data: profiles } = await supabase.from("profiles").select("*");

  // Réglages par défaut (tout activé) pour quelqu'un qui n'a encore rien modifié
  const DEFAULTS = { email_morning: true, morning_time: "08:00", email_evening: true, evening_time: "21:00", email_tasks: true, email_weekly: true };

  for (const user of usersPage.users) {
    const profile = { ...DEFAULTS, ...(profiles?.find((p) => p.user_id === user.id) || {}) };
    const to = profile.notify_email || user.email; // par défaut : l'adresse du compte
    // Le jour et l'heure… À L'HEURE DE LA PERSONNE (pas celle du serveur)
    const timezone = profile.timezone || DEFAULT_TIMEZONE;
    const today = withTimeZone(timezone, () => dayKey(new Date()));
    const now = toMinutes(withTimeZone(timezone, () => timeHHMM(new Date())));
    const isSunday = isoDay(today) === 7;
    const base = { userId: user.id, to, profile, today };

    try {
      // 🌅 Le matin : dans l'heure qui suit l'heure choisie (si le serveur était éteint à 8h pile, ça part à 8h20)
      const morning = toMinutes(profile.morning_time || "08:00");
      if (profile.email_morning && now >= morning && now < morning + 60 && (await markSent(supabase, user.id, "morning", "", today))) {
        await sendOne(supabase, claude, { ...base, kind: "morning" });
      }

      // 🌙 Le soir. Le dimanche, le bilan de la semaine remplace le récap du jour (un seul e-mail).
      const evening = toMinutes(profile.evening_time || "21:00");
      const eveningKind = isSunday && profile.email_weekly ? "weekly" : profile.email_evening ? "evening" : null;
      if (eveningKind && now >= evening && now < evening + 60 && (await markSent(supabase, user.id, eveningKind, "", today))) {
        await sendOne(supabase, claude, { ...base, kind: eveningKind });
      }

      // ⏰ 5 minutes avant chaque tâche du jour qui a une heure (et qui n'est pas déjà faite)
      if (profile.email_tasks) {
        const { todays } = await gatherInfo(supabase, user.id, today, timezone);
        for (const task of todays) {
          if (!task.time || task.done) continue;
          const start = toMinutes(task.time);
          if (now >= start - 5 && now < start && (await markSent(supabase, user.id, "task", String(task.id), today))) {
            await sendOne(supabase, claude, { ...base, kind: "task", task });
          }
        }
      }
    } catch (e) {
      console.error(`📧 Souci d'e-mail pour ${to} :`, e.message);
    }
  }
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
