// app.js – le "cerveau" de la page.
// Ici, PAS de clé secrète : la page parle seulement à notre serveur (server.js),
// et à Supabase avec la clé PUBLIQUE, uniquement pour gérer les comptes.
//
// Le principe, très simple :
//   1. on demande au serveur TOUTES les données de la personne (refresh) ;
//   2. on redessine toute la page avec (render) ;
//   3. après chaque action (cocher, ajouter, modifier…), on recommence 1 et 2.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CATEGORIES, MAX_TASKS, BADGES, APP_VERSION, dayKey, addDays, mondayOf, computeStats, occursOn, isCurrent, scheduleLabel, goalWeek, goalProgress } from "./shared.js";

// Raccourci : $("id") = document.getElementById("id")
const $ = (id) => document.getElementById(id);

// Protège un texte avant de l'insérer dans du HTML (évite qu'un titre "<b>" casse la page)
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Place le logo (défini une seule fois dans index.html) partout où il y a class="logo"
for (const logo of document.querySelectorAll(".logo")) {
  logo.append($("logo-template").content.cloneNode(true));
}
const drawIcons = () => window.lucide?.createIcons(); // dessine les icônes <i data-lucide="...">
drawIcons();

// Le maximum de tâches par jour (défini dans shared.js) écrit là où la page en parle
for (const el of document.querySelectorAll(".max-tasks")) el.textContent = MAX_TASKS;

// Le jour d'aujourd'hui, au format "AAAA-MM-JJ"
const today = () => dayKey(new Date());
const niceDate = (key, options = { weekday: "long", day: "numeric", month: "long" }) =>
  new Date(key + "T12:00:00").toLocaleDateString("fr-FR", options);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// On demande au serveur l'adresse Supabase et la clé PUBLIQUE.
const config = await (await fetch("/api/config")).json();
const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);

// Toutes les données de la personne connectée (remplies par refresh())
let state = null;
let session = null;

// =============================================================
// LE THÈME (sombre / clair)
// =============================================================
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("buddy-theme", theme); } catch (e) {}
  for (const b of document.querySelectorAll("[data-theme-choice]")) {
    b.classList.toggle("active", b.dataset.themeChoice === theme);
  }
}
for (const button of document.querySelectorAll(".theme-toggle")) {
  button.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
}
for (const button of document.querySelectorAll("[data-theme-choice]")) {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
}

// =============================================================
// LES PAGES (Accueil, Mes objectifs, Suivi, Outils, Paramètres)
// L'adresse change (#suivi, #objectifs…) : le bouton "retour" du navigateur marche aussi.
// =============================================================
const PAGES = ["accueil", "objectifs", "suivi", "outils", "parametres"];

function showPage() {
  const page = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "accueil";
  for (const p of PAGES) $("page-" + p).classList.toggle("hidden", p !== page);
  for (const link of document.querySelectorAll(".side-link")) {
    link.classList.toggle("active", link.dataset.page === page);
  }
  $("user-dropdown").classList.add("hidden");
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", showPage);

function showLanding() {
  $("landing").classList.remove("hidden");
  $("app").classList.add("hidden");
  $("buddy-fab").classList.add("hidden");
}
function showApp() {
  $("landing").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("buddy-fab").classList.remove("hidden");
  showPage();
}

// =============================================================
// LE COMPTE (inscription / connexion / déconnexion)
// =============================================================
let authMode = "signup"; // "signup" = créer un compte, "login" = se connecter

function openAuth(mode) {
  authMode = mode;
  $("auth-card").classList.remove("hidden");
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  }
  $("auth-submit").textContent = mode === "signup" ? "Créer mon compte" : "Me connecter";
  $("auth-info").textContent = "";
  $("email").focus();
}

$("hero-cta").addEventListener("click", () => openAuth("signup"));
$("nav-login").addEventListener("click", () => openAuth("login"));
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => openAuth(tab.dataset.mode));
}
// Appuyer sur Entrée dans le mot de passe = cliquer sur le bouton
$("password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("auth-submit").click(); });

$("auth-submit").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  const { data, error } =
    authMode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

  if (error) return ($("auth-info").textContent = "Erreur : " + error.message);
  if (!data.session) {
    // Si Supabase demande de confirmer l'e-mail, il n'y a pas encore de session.
    return ($("auth-info").textContent = "Compte créé ! Clique sur le lien reçu par e-mail, puis connecte-toi.");
  }
  loadMyBuddy(data.session);
});

// Le menu du compte (en haut à droite)
$("user-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("user-dropdown").classList.toggle("hidden");
});
document.addEventListener("click", () => $("user-dropdown").classList.add("hidden"));

async function logout() {
  // "local" : on oublie la connexion sur cet appareil (marche même si le compte vient d'être supprimé)
  try { await supabase.auth.signOut({ scope: "local" }); } catch (e) {}
  // On "débarrasse la table" : on efface tout ce que la personne précédente a laissé.
  state = null;
  session = null;
  currentTopic = null;
  topicsOffered = false;
  for (const id of ["email", "password", "message"]) $(id).value = "";
  closeChat();
  $("chat").innerHTML = "";
  $("auth-info").textContent = "";
  $("auth-card").classList.add("hidden");
  location.hash = "";
  showLanding();
}
$("logout-button").addEventListener("click", logout);
$("logout-button-2").addEventListener("click", logout);

// =============================================================
// PARLER AU SERVEUR (avec notre "badge" de connexion)
// =============================================================
async function api(method, url, body) {
  const { data } = await supabase.auth.getSession(); // badge à jour (renouvelé si besoin)
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + data.session.access_token,
    },
    body: body ? JSON.stringify({ ...body, today: today() }) : undefined,
  });
  return response.json();
}

// Recharge toutes les données, puis redessine la page
async function refresh() {
  const data = await api("GET", "/api/state?today=" + today());
  if (data.error) return toast(data.error, "error");
  // Le serveur tourne-t-il avec le même code que la page ? Sinon, des choses peuvent ne pas s'enregistrer.
  if (data.version !== APP_VERSION) {
    toast("Le serveur n'est pas à jour : redémarre-le (Ctrl+C puis npm.cmd start), puis recharge la page.", "error");
  }
  data.badges = data.badges || [];
  state = data;
  render();
  if (data.newBadges?.length) celebrateBadges(data.newBadges); // de nouveaux badges viennent d'être gagnés
}

// =============================================================
// LES PETITS RETOURS VISUELS
// =============================================================
// Un petit message en bas de l'écran, qui disparaît tout seul
let toastTimer;
function toast(text, type = "ok") {
  const box = $("toast");
  box.textContent = (type === "ok" ? "✓ " : "⚠️ ") + text;
  box.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.className = "toast " + type), 2600);
}

// Fait briller en doré les éléments qui viennent d'être ajoutés ou modifiés
function flash(selector) {
  for (const el of document.querySelectorAll(selector)) {
    const folded = el.closest("details");
    if (folded) folded.open = true; // si c'est dans "Autres jours", on déplie pour la montrer
    const target = el.closest("li, article") || el;
    target.classList.remove("flash");
    void target.offsetWidth; // petite astuce pour pouvoir rejouer l'animation
    target.classList.add("flash");
  }
}

// Buddy lève le pouce, puis reprend son expression
function buddyThumbsUp(status) {
  setBuddy("content", "pop", status);
  setTimeout(() => showEmotion(currentEmotion, false), 2500);
}

// =============================================================
// DESSINER LA PAGE À PARTIR DES DONNÉES
// =============================================================
const activeTasks = () => state.tasks.filter((t) => isCurrent(t, today())); // toutes les tâches "vivantes"
const todayTasks = () => activeTasks().filter((t) => occursOn(t, today())); // celles d'aujourd'hui
const goalById = (id) => state.goals.find((g) => g.id === id);
const catOf = (goal) => CATEGORIES[goal?.category] || CATEGORIES.quotidien;
const isDoneToday = (task) => state.logs.some((l) => l.task_id === task.id && l.day === today());
let stats = null;
let goalFilter = "toutes";

function render() {
  stats = computeStats(state.tasks, state.logs, today());
  // Chaque morceau de la page est dessiné séparément : si l'un plante, les autres s'affichent quand même.
  for (const part of [renderProfile, renderToday, renderGoalsSummary, renderWeek, renderCategories,
    renderGoalsPage, renderSuivi, renderSettings, renderTopic, renderResume, drawIcons]) {
    try {
      part();
    } catch (error) {
      console.error(`Erreur d'affichage dans ${part.name} :`, error);
    }
  }
}

function renderProfile() {
  const email = session.user.email;
  const name = state.profile.firstName || email.split("@")[0];
  $("user-name").textContent = name;
  $("greeting-name").textContent = capitalize(name);
  $("user-avatar").textContent = name.charAt(0);
  $("user-email").textContent = email;
  $("settings-email").textContent = "Connecté avec " + email;
  const STYLE_LABELS = { military: "Mode militaire", supportive: "Mode bienveillant", balanced: "Mode équilibré" };
  $("style-badge").textContent = STYLE_LABELS[state.profile.style] || "";
  $("style-badge").classList.toggle("hidden", !state.profile.style);

  // La petite phrase sous "Salut …" dépend de la journée
  const { planned, done } = stats.today;
  $("greeting-sub").innerHTML =
    planned === 0 ? "Choisis tes actions du jour.<br>Peu, mais concrètes." :
    done === planned ? "Journée bouclée ✅<br>Reviens demain, on continue." :
    `Il te reste ${planned - done} tâche${planned - done > 1 ? "s" : ""} aujourd'hui.<br>On continue ?`;
}

// --- Aujourd'hui ---
function renderToday() {
  $("today-date").textContent = capitalize(niceDate(today()));
  const tasks = todayTasks();

  $("today-list").innerHTML = tasks.length === 0
    ? `<li class="empty">Aucune tâche prévue aujourd'hui.<br>Ajoute jusqu'à ${MAX_TASKS} actions concrètes par jour.
         <br><button class="btn btn-primary" data-new-task><i data-lucide="plus"></i> Ajouter une tâche</button></li>`
    : tasks.map((t) => {
        const goal = goalById(t.goal_id);
        return `<li class="${isDoneToday(t) ? "done" : ""}">
          <button class="check" data-check="${t.id}" title="Cocher / décocher"></button>
          <button class="task-title" data-edit-task="${t.id}" title="Modifier">
            ${goal ? `<span class="cat-dot" style="--c:${catOf(goal).color}"></span>` : ""}<span>${esc(t.title)}</span>
          </button>
          <time>${esc(t.time || "")}</time>
          <button class="edit-btn" data-edit-task="${t.id}" title="Modifier la tâche"><i data-lucide="pencil"></i></button>
        </li>`;
      }).join("");

  const { planned, done } = stats.today;
  $("today-count").textContent = planned ? `${done}/${planned} tâche${planned > 1 ? "s" : ""} terminée${done > 1 ? "s" : ""}` : "";
  $("today-bar").style.width = planned ? (done / planned) * 100 + "%" : "0%";

  // Les tâches des autres jours, repliées sous la liste (clique pour les voir / modifier)
  const others = activeTasks().filter((t) => !occursOn(t, today()));
  $("other-days").classList.toggle("hidden", others.length === 0);
  $("other-days-summary").textContent = `Autres jours (${others.length} tâche${others.length > 1 ? "s" : ""})`;
  $("other-list").innerHTML = others.map((t) => {
    const goal = goalById(t.goal_id);
    return `<li><button data-edit-task="${t.id}">
      ${goal ? `<span class="cat-dot" style="--c:${catOf(goal).color}"></span>` : ""}${esc(t.title)}
      <span class="when">${esc(scheduleLabel(t))}${t.time ? " · " + esc(t.time) : ""}</span>
    </button></li>`;
  }).join("");
}

// --- Mes objectifs (carte de l'accueil) ---
// "Cette semaine : 3/6" pour un objectif, calculé automatiquement à partir des tâches cochées
function goalWeekText(g) {
  const w = goalWeek(state.tasks, state.logs, today(), g.id);
  return w.planned ? `Cette semaine : ${w.done}/${w.planned} tâche${w.planned > 1 ? "s" : ""} faite${w.done > 1 ? "s" : ""}` : "Aucune tâche liée cette semaine";
}

// Le % d'un objectif (automatique s'il a des tâches liées, sinon manuel)
const progressOf = (g) => goalProgress(state.tasks, state.logs, today(), g);

function goalLine(g) {
  const cat = catOf(g);
  const p = progressOf(g);
  return `<li class="clickable" style="--c:${cat.color}" data-edit-goal="${g.id}">
    <span class="goal-icon"><i data-lucide="${cat.icon}"></i></span>
    <span>${esc(g.text)}<small class="goal-week">${goalWeekText(g)}</small></span><strong title="${p.auto ? "Régularité sur 4 semaines, calculée avec tes tâches" : "Progression mise à jour à la main"}">${p.value}%</strong>
    <div class="bar"><div style="width:${p.value}%"></div></div>
  </li>`;
}

function renderGoalsSummary() {
  $("goals-summary").innerHTML = state.goals.length === 0
    ? `<li class="empty">Pas encore d'objectif.<br>
         <button class="btn btn-primary" data-new-goal><i data-lucide="plus"></i> Créer un objectif</button></li>`
    : state.goals.slice(0, 5).map(goalLine).join("");
}

// --- Cette semaine ---
function renderWeek() {
  const w = stats.week;
  $("week-ring").style.setProperty("--p", w.rate);
  $("week-rate").textContent = w.rate + "%";
  $("week-stats").innerHTML = `
    <li style="--c: var(--green)"><strong>${w.done}/${w.planned}</strong> tâches faites</li>
    <li style="--c: var(--blue)"><strong>${w.activeDays}/${w.daysSoFar}</strong> jours actifs</li>
    <li style="--c: var(--accent)"><strong>${stats.streak} 🔥</strong> jours de streak</li>
    <li style="--c: var(--violet)"><strong>🛡️</strong> ${jokerText()}</li>`;
}

// Le joker de la semaine : disponible, ou utilisé tel jour
function jokerText() {
  return stats.jokerUsedOn ? `joker utilisé ${niceDate(stats.jokerUsedOn, { weekday: "long" })}` : "joker disponible";
}

// --- Mes catégories ---
function renderCategories() {
  $("categories").innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
    const count = state.goals.filter((g) => g.category === key).length;
    return `<a class="cat" href="#objectifs" data-cat="${key}" style="--c:${cat.color}; --photo:url(images/${key}.jpg)">
      <span class="cat-icon"><i data-lucide="${cat.icon}"></i></span>
      <h4>${cat.label}</h4>
      <p>${count ? `${count} objectif${count > 1 ? "s" : ""}` : "Aucun objectif"} <i data-lucide="chevron-right"></i></p>
    </a>`;
  }).join("");
}

// --- Page Mes objectifs ---
function renderGoalsPage() {
  const chips = [["toutes", "Toutes", state.goals.length]].concat(
    Object.entries(CATEGORIES).map(([key, cat]) => [key, `${cat.emoji} ${cat.label}`, state.goals.filter((g) => g.category === key).length])
  );
  $("goal-filters").innerHTML = chips
    .map(([key, label, count]) => `<button class="chip ${goalFilter === key ? "active" : ""}" data-filter="${key}">${label} <span class="muted">${count}</span></button>`)
    .join("");

  const goals = state.goals.filter((g) => goalFilter === "toutes" || g.category === goalFilter);
  if (goals.length === 0) {
    const cat = CATEGORIES[goalFilter];
    $("goal-grid").innerHTML = `<div class="card empty">
      ${cat ? `Pas encore d'objectif en ${cat.label}.` : "Pas encore d'objectif."}
      Crée-le toi-même, ou parles-en avec Buddy : il t'aidera à le formuler.<br>
      <button class="btn btn-primary" data-new-goal="${cat ? goalFilter : ""}"><i data-lucide="plus"></i> Nouvel objectif</button>
      <button class="btn btn-ghost" data-talk-category="${cat ? goalFilter : ""}"><i data-lucide="message-circle"></i> En parler à Buddy</button>
    </div>`;
    return;
  }

  $("goal-grid").innerHTML = goals.map((g) => {
    const cat = catOf(g);
    const tasks = activeTasks().filter((t) => t.goal_id === g.id);
    return `<article class="card goal-card" style="--c:${cat.color}">
      <div class="goal-card-head">
        <span class="cat-pill"><i data-lucide="${cat.icon}"></i> ${cat.label}</span>
        <button class="mini-btn" data-edit-goal="${g.id}" title="Modifier"><i data-lucide="pencil"></i></button>
      </div>
      <h3>${esc(g.text)}</h3>
      ${g.reason ? `<p class="reason">« ${esc(g.reason)} »</p>` : ""}
      <div class="goal-meta">
        ${g.deadline ? `<span><i data-lucide="calendar"></i> ${niceDate(g.deadline, { day: "numeric", month: "long", year: "numeric" })}</span>` : ""}
        <span><i data-lucide="list-checks"></i> ${goalWeekText(g)}</span>
        ${g.plan ? `<span><i data-lucide="map"></i> Plan défini avec Buddy</span>` : ""}
      </div>
      ${(() => {
        const p = progressOf(g);
        return `<div><div class="bar"><div style="width:${p.value}%"></div></div><p class="muted small">${p.auto
          ? `${p.value}% de régularité sur 4 semaines (${p.done}/${p.planned} tâches faites) · calculé automatiquement`
          : `${p.value}% atteint · pas de tâche liée : mets-le à jour avec ✏️ ou demande à Buddy`}</p></div>`;
      })()}
      ${tasks.length ? `<ul class="goal-tasks">${tasks.map((t) =>
        `<li class="${isDoneToday(t) ? "done" : ""}"><button class="task-link" data-edit-task="${t.id}" title="Modifier la tâche">
          <i data-lucide="${isDoneToday(t) ? "circle-check" : "circle"}"></i> ${esc(t.title)}
          <span class="task-when">· ${esc(scheduleLabel(t))}</span> <i class="pen" data-lucide="pencil"></i></button></li>`).join("")}</ul>` : ""}
      <div class="goal-actions">
        <button class="btn btn-primary" data-talk-goal="${g.id}"><i data-lucide="message-circle"></i> Parler à Buddy</button>
        <button class="btn btn-ghost" data-new-task="${g.id}"><i data-lucide="plus"></i> Tâche</button>
      </div>
    </article>`;
  }).join("");
}

// --- Page Suivi ---
function renderSuivi() {
  const w = stats.week;
  $("stat-tiles").innerHTML = [
    [`${w.done}/${w.planned}`, "tâches cette semaine"],
    [`${w.rate}%`, "de réussite"],
    [`${w.activeDays}/${w.daysSoFar}`, "jours actifs"],
    [`${stats.streak} 🔥`, "streak actuel"],
    [`${stats.best}`, "meilleur streak"],
    [stats.jokerUsedOn ? "Utilisé" : "Dispo", `🛡️ ${stats.jokerUsedOn ? "joker de la semaine, " + niceDate(stats.jokerUsedOn, { weekday: "long" }) : "joker de la semaine"}`],
  ].map(([value, label]) => `<div class="card stat-tile"><strong>${value}</strong><span>${label}</span></div>`).join("");

  // Les 7 derniers jours, tâche par tâche
  const last7 = [];
  for (let d = 6; d >= 0; d--) last7.push(addDays(today(), -d));
  const initials = last7.map((k) => niceDate(k, { weekday: "short" }).charAt(0).toUpperCase());
  const SYMBOL = { done: "✓", missed: "✗", todo: "·", none: "" };
  $("task-history").innerHTML = stats.perTask.length === 0
    ? `<p class="empty">Ajoute des tâches dans « Aujourd'hui » pour voir ton suivi ici.</p>`
    : `<div class="dots-legend">${initials.map((i) => `<span>${i}</span>`).join("")}</div>` +
      stats.perTask.map(({ task, days }) => {
        const goal = goalById(task.goal_id);
        return `<div class="task-row">
          <button class="task-row-title task-link" data-edit-task="${task.id}" title="Modifier la tâche">${goal ? `<span class="cat-dot" style="--c:${catOf(goal).color}"></span>` : ""}<span>${esc(task.title)}</span> <i class="pen" data-lucide="pencil"></i></button>
          <div class="dots">${days.map((d) => `<span class="dot" data-status="${d.status}" title="${niceDate(d.key)}">${SYMBOL[d.status]}</span>`).join("")}</div>
        </div>`;
      }).join("");

  // Les 4 dernières semaines en carrés (du lundi au dimanche)
  const start = addDays(mondayOf(today()), -21);
  const cells = ["L", "M", "M", "J", "V", "S", "D"].map((d) => `<span class="heat-head">${d}</span>`);
  for (let i = 0; i < 28; i++) {
    const key = addDays(start, i);
    const day = stats.history.find((h) => h.key === key);
    const rate = day && day.planned ? day.done / day.planned : 0;
    const level = rate === 0 ? 0 : rate < 0.5 ? 1 : rate < 1 ? 2 : 3;
    const cls = key === today() ? "today" : key > today() ? "future" : day?.status === "joker" ? "joker" : "";
    const tip = day ? `${niceDate(key)} : ${day.status === "rest" ? "repos" : `${day.done}/${day.planned}`}${day.status === "joker" ? " (sauvé par le joker 🛡️)" : ""}` : niceDate(key);
    cells.push(`<span class="heat-cell ${cls}" data-level="${key > today() ? 0 : level}" title="${tip}"></span>`);
  }
  $("heatmap").innerHTML = cells.join("");

  $("week-list").innerHTML = stats.weeks.map((wk) => `<li>
    <span>Sem. du ${niceDate(wk.start, { day: "numeric", month: "short" })}</span>
    <div class="bar"><div style="width:${wk.rate}%"></div></div>
    <strong>${wk.planned ? wk.rate + "%" : "–"}</strong>
  </li>`).join("");

  $("goals-progress").innerHTML = state.goals.length === 0
    ? `<li class="empty">Pas encore d'objectif.</li>`
    : state.goals.map(goalLine).join("");

  // Les badges : gagnés en couleur, les autres en gris avec la façon de les obtenir
  const earned = new Map(state.badges.map((b) => [b.badge_id, b.earned_at]));
  $("badge-count").textContent = `${earned.size}/${BADGES.length}`;
  $("badge-grid").innerHTML = BADGES.map((b) => `
    <div class="badge-item ${earned.has(b.id) ? "earned" : "locked"}" title="${esc(b.desc)}">
      <span class="badge-emoji">${b.emoji}</span>
      <strong>${esc(b.name)}</strong>
      <small>${earned.has(b.id) ? "Gagné le " + niceDate(dayKey(earned.get(b.id)), { day: "numeric", month: "short" }) : esc(b.desc)}</small>
    </div>`).join("");
}

// Un (ou plusieurs) nouveau(x) badge(s) : on fête ça !
function celebrateBadges(ids) {
  const won = BADGES.filter((b) => ids.includes(b.id));
  if (!won.length) return;
  $("badge-dialog-list").innerHTML = won.map((b) => `
    <div class="badge-won"><span class="badge-emoji big">${b.emoji}</span>
      <div><h2>${esc(b.name)}</h2><p class="muted">${esc(b.desc)}</p></div></div>`).join("");
  $("badge-dialog").showModal();
  setBuddy("bravo", "saute", "Nouveau badge !");
  setTimeout(() => showEmotion(currentEmotion, false), 3000);
}

// --- Page Paramètres ---
function renderSettings() {
  if (document.activeElement !== $("settings-name")) $("settings-name").value = state.profile.firstName || "";
  for (const b of document.querySelectorAll("[data-style]")) {
    b.classList.toggle("active", b.dataset.style === state.profile.style);
  }
  setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");

  // Les réglages des e-mails (on ne les réécrit pas si la personne est en train de les modifier)
  if (!$("page-parametres").contains(document.activeElement)) {
    const p = state.profile;
    $("notify-email").value = p.notifyEmail || session.user.email; // par défaut : l'adresse du compte
    $("notify-email").placeholder = session.user.email;
    $("email-morning").checked = p.emailMorning;
    $("morning-time").value = p.morningTime;
    $("email-evening").checked = p.emailEvening;
    $("evening-time").value = p.eveningTime;
    $("email-tasks").checked = p.emailTasks;
    $("email-weekly").checked = p.emailWeekly;
  }
}

// Supprimer son compte : on demande d'écrire SUPPRIMER pour être sûr que ce n'est pas un clic par erreur
$("delete-account").addEventListener("click", () => {
  $("delete-form").reset();
  $("delete-error").textContent = "";
  $("delete-dialog").showModal();
});
$("delete-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.confirm.value.trim().toUpperCase() !== "SUPPRIMER") {
    return ($("delete-error").textContent = "Écris SUPPRIMER pour confirmer.");
  }
  const result = await api("DELETE", "/api/account");
  if (result.error) return ($("delete-error").textContent = result.error);
  $("delete-dialog").close();
  await logout();
  toast("Ton compte et toutes tes données ont été supprimés. Merci d'avoir essayé Buddy 🙏");
});

$("save-emails").addEventListener("click", async () => {
  const address = $("notify-email").value.trim();
  const result = await api("PATCH", "/api/profile", {
    // Si c'est l'adresse du compte, on n'enregistre rien de spécial (elle suivra le compte)
    notifyEmail: address === session.user.email ? "" : address,
    emailMorning: $("email-morning").checked,
    morningTime: $("morning-time").value,
    emailEvening: $("email-evening").checked,
    eveningTime: $("evening-time").value,
    emailTasks: $("email-tasks").checked,
    emailWeekly: $("email-weekly").checked,
  });
  if (result.error) return toast(result.error, "error");
  document.activeElement.blur();
  await refresh();
  toast("Réglages des e-mails enregistrés");
});

$("test-email").addEventListener("click", async () => {
  const button = $("test-email");
  button.disabled = true;
  button.lastChild.textContent = " Buddy écrit l'e-mail…";
  const result = await api("POST", "/api/email/test", {});
  button.disabled = false;
  button.lastChild.textContent = " M'envoyer un e-mail de test";
  if (result.error) return toast(result.error, "error");
  toast("E-mail envoyé à " + result.to + " 📬");
});

$("save-name").addEventListener("click", async () => {
  await api("PATCH", "/api/profile", { firstName: $("settings-name").value });
  await refresh();
  toast("Prénom enregistré");
});
for (const b of document.querySelectorAll("[data-style]")) {
  b.addEventListener("click", async () => {
    await api("PATCH", "/api/profile", { style: b.dataset.style });
    await refresh();
    toast("Style de coaching mis à jour : " + b.querySelector("strong").textContent);
  });
}

// =============================================================
// LES CLICS DANS LA PAGE
// Un seul "écouteur" pour tous les boutons dessinés par render() :
// on regarde simplement quel bouton a été cliqué grâce à ses attributs data-…
// =============================================================
document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-check], [data-edit-task], [data-new-task], [data-edit-goal], [data-new-goal], [data-cat], [data-filter], [data-talk-goal], [data-talk-category], [data-review]");
  if (!el || !state) return;

  if ("review" in el.dataset) return startReview();
  if (el.dataset.check) return toggleTask(Number(el.dataset.check));
  if (el.dataset.editTask) return openTaskDialog(state.tasks.find((t) => t.id === Number(el.dataset.editTask)));
  if ("newTask" in el.dataset) return openTaskDialog(null, Number(el.dataset.newTask) || null);
  if (el.dataset.editGoal) return openGoalDialog(goalById(Number(el.dataset.editGoal)));
  if ("newGoal" in el.dataset) return openGoalDialog(null, el.dataset.newGoal);
  if (el.dataset.cat) { goalFilter = el.dataset.cat; return renderGoalsPage(), drawIcons(); }
  if (el.dataset.filter) { goalFilter = el.dataset.filter; return renderGoalsPage(), drawIcons(); }
  if (el.dataset.talkGoal) return talkAbout(goalById(Number(el.dataset.talkGoal)));
  if ("talkCategory" in el.dataset) {
    const cat = CATEGORIES[el.dataset.talkCategory];
    openChat(true);
    return sendToBuddy(cat ? `Je voudrais me fixer un objectif en ${cat.label}.` : "Je voudrais me fixer un nouvel objectif.");
  }
});
$("add-task").addEventListener("click", () => openTaskDialog(null));

// Cocher / décocher une tâche
async function toggleTask(taskId) {
  const done = !isDoneToday({ id: taskId });

  // 1. D'ABORD on enregistre (comme ça, rien ne peut empêcher la coche d'être sauvegardée)…
  const saving = api("POST", `/api/tasks/${taskId}/check`, { done });

  // 2. … pendant ce temps, on met à jour l'écran tout de suite (plus agréable).
  if (done) state.logs.push({ task_id: taskId, day: today() });
  else state.logs = state.logs.filter((l) => !(l.task_id === taskId && l.day === today()));
  render();
  if (done) {
    const allDone = stats.today.done === stats.today.planned;
    setBuddy(allDone ? "bravo" : "content", "saute", allDone ? "Journée bouclée !" : "Bien joué !");
    setTimeout(() => showEmotion(currentEmotion, false), 2500);
  }

  // 3. On vérifie que l'enregistrement a marché, puis on recharge tout (suivi, objectifs, badges…).
  const result = await saving;
  if (result.error) toast("La coche n'a pas été enregistrée : " + result.error, "error");
  await refresh();
}

// =============================================================
// LES FENÊTRES : OBJECTIF ET TÂCHE
// =============================================================
for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}

// --- Objectif ---
let editingGoal = null;
let pickedCategory = "sport";

function drawCategoryPicker() {
  $("cat-picker").innerHTML = Object.entries(CATEGORIES)
    .map(([key, cat]) => `<button type="button" class="chip ${key === pickedCategory ? "active" : ""}" data-pick="${key}">${cat.emoji} ${cat.label}</button>`)
    .join("");
}
$("cat-picker").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-pick]");
  if (chip) { pickedCategory = chip.dataset.pick; drawCategoryPicker(); }
});

function openGoalDialog(goal, category) {
  editingGoal = goal;
  const form = $("goal-form");
  form.reset();
  pickedCategory = goal?.category || (category in CATEGORIES ? category : goalFilter in CATEGORIES ? goalFilter : "sport");
  form.text.value = goal?.text || "";
  form.reason.value = goal?.reason || "";
  form.deadline.value = goal?.deadline || "";
  form.progress.value = goal?.progress || 0;
  $("progress-value").textContent = form.progress.value;
  // Le curseur manuel ne sert que si l'objectif n'a pas de tâches (sinon le % est automatique)
  const p = goal ? progressOf(goal) : null;
  $("progress-field").classList.toggle("hidden", !goal || p.auto);
  $("progress-auto").classList.toggle("hidden", !p?.auto);
  if (p?.auto) $("progress-auto").textContent = `📈 Progression automatique : ${p.value}% (${p.done}/${p.planned} tâches faites sur les 4 dernières semaines). Coche tes tâches pour la faire monter.`;
  $("goal-dialog-title").textContent = goal ? "Modifier l'objectif" : "Nouvel objectif";
  $("goal-delete").classList.toggle("hidden", !goal);
  $("goal-error").textContent = "";
  drawCategoryPicker();
  $("goal-dialog").showModal();
}
$("goal-form").progress.addEventListener("input", (e) => ($("progress-value").textContent = e.target.value));

$("goal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const body = {
    text: form.text.value,
    category: pickedCategory,
    reason: form.reason.value,
    deadline: form.deadline.value,
    progress: form.progress.value,
  };
  const result = editingGoal
    ? await api("PATCH", `/api/goals/${editingGoal.id}`, body)
    : await api("POST", "/api/goals", body);
  if (result.error) return ($("goal-error").textContent = result.error);
  $("goal-dialog").close();
  await refresh();
  const id = editingGoal ? editingGoal.id : result.id;
  flash(`[data-edit-goal="${id}"]`);
  toast(editingGoal ? "Objectif mis à jour" : "Objectif enregistré");
  if (!editingGoal) buddyThumbsUp("Nouvel objectif !");
});

$("goal-delete").addEventListener("click", async () => {
  if (!confirm(`Supprimer l'objectif « ${editingGoal.text} » ? Ses tâches resteront, sans objectif lié.`)) return;
  await api("DELETE", `/api/goals/${editingGoal.id}`);
  $("goal-dialog").close();
  await refresh();
  toast("Objectif supprimé");
});

// --- Tâche ---
let editingTask = null;

// "Quand ?" : tous les jours (daily), certains jours (days) ou une date (date)
let repeatMode = "daily";
let pickedDays = [];

function drawRepeat() {
  for (const b of document.querySelectorAll("[data-repeat]")) b.classList.toggle("active", b.dataset.repeat === repeatMode);
  $("day-picker").classList.toggle("hidden", repeatMode !== "days");
  $("date-field").classList.toggle("hidden", repeatMode !== "date");
  for (const b of document.querySelectorAll("[data-day]")) b.classList.toggle("active", pickedDays.includes(Number(b.dataset.day)));
}
$("repeat-choice").addEventListener("click", (e) => {
  const b = e.target.closest("[data-repeat]");
  if (b) { repeatMode = b.dataset.repeat; drawRepeat(); }
});
$("day-picker").addEventListener("click", (e) => {
  const b = e.target.closest("[data-day]");
  if (!b) return;
  const day = Number(b.dataset.day);
  pickedDays = pickedDays.includes(day) ? pickedDays.filter((d) => d !== day) : [...pickedDays, day];
  drawRepeat();
});

function openTaskDialog(task, goalId = null) {
  editingTask = task;
  const form = $("task-form");
  form.reset();
  $("task-goal-select").innerHTML = `<option value="">Aucun</option>` +
    state.goals.map((g) => `<option value="${g.id}">${catOf(g).emoji} ${esc(g.text)}</option>`).join("");
  form.title.value = task?.title || "";
  form.time.value = task?.time || "";
  form.goalId.value = String(task?.goal_id || goalId || "");
  // Le "Quand ?" de la tâche (ou "tous les jours" pour une nouvelle)
  repeatMode = task?.on_date ? "date" : task?.days?.length ? "days" : "daily";
  pickedDays = task?.days ? [...task.days] : [];
  form.onDate.value = task?.on_date || today();
  form.onDate.min = today();
  drawRepeat();
  $("task-dialog-title").textContent = task ? "Modifier la tâche" : "Nouvelle tâche";
  $("task-delete").classList.toggle("hidden", !task);
  $("task-error").textContent = "";
  $("task-dialog").showModal();
}

$("task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (repeatMode === "days" && pickedDays.length === 0) return ($("task-error").textContent = "Choisis au moins un jour.");
  const body = {
    title: form.title.value,
    time: form.time.value,
    goalId: Number(form.goalId.value) || null,
    days: repeatMode === "days" ? pickedDays : [],
    onDate: repeatMode === "date" ? form.onDate.value : null,
  };
  const result = editingTask
    ? await api("PATCH", `/api/tasks/${editingTask.id}`, body)
    : await api("POST", "/api/tasks", body);
  if (result.error) return ($("task-error").textContent = result.error);
  $("task-dialog").close();
  await refresh();
  const id = editingTask ? editingTask.id : result.id;
  flash(`[data-edit-task="${id}"]`);
  const when = repeatMode === "daily" ? "tous les jours" : repeatMode === "days" ? scheduleLabel({ days: pickedDays }) : scheduleLabel({ on_date: body.onDate }).toLowerCase();
  toast(editingTask ? "Tâche mise à jour" : `Tâche ajoutée (${when})`);
  if (!editingTask) buddyThumbsUp("C'est noté !");
});

$("task-delete").addEventListener("click", async () => {
  if (!confirm(`Supprimer la tâche « ${editingTask.title} » ? Son historique reste dans le suivi.`)) return;
  await api("DELETE", `/api/tasks/${editingTask.id}`);
  $("task-dialog").close();
  await refresh();
  toast("Tâche supprimée");
});

// =============================================================
// LE BONHOMME BUDDY ET SES ÉMOTIONS
// =============================================================
// Chaque émotion choisie par Buddy = une pose (image), un petit mouvement et une phrase.
const EMOTIONS = {
  neutral:       { pose: "repos",      mouvement: "",      status: "Buddy t'écoute" },
  happy:         { pose: "content",    mouvement: "pop",   status: "Buddy est content" },
  celebrating:   { pose: "bravo",      mouvement: "saute", status: "Buddy célèbre !" },
  understanding: { pose: "idee",       mouvement: "pop",   status: "Buddy a compris" },
  strict:        { pose: "fache",      mouvement: "pop",   status: "Buddy est sérieux" },
  motivational:  { pose: "motivation", mouvement: "pop",   status: "Buddy te pousse à agir" },
};
// On précharge les images, pour qu'il n'y ait pas de "flash" quand il change de pose.
for (const e of Object.values(EMOTIONS)) new Image().src = "buddy/" + e.pose + ".png";

let currentEmotion = "motivational"; // l'émotion "de fond", gardée jusqu'à la prochaine réponse

// Change la pose, le mouvement et la petite phrase de Buddy (bannière, discussion, bulle flottante)
function setBuddy(pose, mouvement, status) {
  const img = $("buddy-img");
  for (const other of [img, $("drawer-buddy"), $("fab-buddy")]) other.src = "buddy/" + pose + ".png";
  img.className = "buddy-img";
  void img.offsetWidth; // petite astuce pour pouvoir rejouer la même animation
  if (mouvement) img.classList.add(mouvement);
  $("buddy-status").textContent = status;
}

// Affiche une émotion (et la retient comme émotion "de fond")
function showEmotion(emotion, animate = true) {
  currentEmotion = emotion in EMOTIONS ? emotion : "neutral";
  const e = EMOTIONS[currentEmotion];
  setBuddy(e.pose, animate ? e.mouvement : "", e.status);
}

// =============================================================
// "ON REPREND OÙ ON S'ÉTAIT ARRÊTÉS ?" : l'aperçu de la dernière vraie conversation
// =============================================================
// Enlève les lignes "✅ Tâche ajoutée…" que Buddy ajoute sous ses messages, et raccourcit
const cleanText = (text, max) => {
  const clean = String(text).split("\n").filter((l) => !/^\s*(✅|⚠️|✏️|🗑️|↩️|📈|ℹ️)/.test(l)).join(" ").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
};

// "il y a 2 jours", "hier", "il y a 5 min"…
function timeAgo(date) {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return capitalize(rtf.format(-minutes, "minute"));
  if (minutes < 60 * 24) return capitalize(rtf.format(-Math.round(minutes / 60), "hour"));
  return capitalize(rtf.format(-Math.round(minutes / (60 * 24)), "day"));
}

function renderResume() {
  const messages = state.messages;
  // Le message le plus récent de la personne qui a du sens (on saute les "ok", "oui", "merci"…)
  const userIndexes = messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  const meaningful = userIndexes.filter((i) => messages[i].content.trim().split(/\s+/).length >= 3);
  const index = meaningful.length ? meaningful[meaningful.length - 1] : userIndexes[userIndexes.length - 1];

  if (index === undefined) {
    // Pas encore de vraie conversation : on n'invente rien, on invite à commencer
    $("resume-title").textContent = "👋 On commence ?";
    $("resume-quote").textContent = "« Parle-moi d'un objectif que tu veux vraiment atteindre. »";
    $("resume-reply").textContent = "";
    $("resume-when").textContent = "";
    $("resume-btn").textContent = "Parler à Buddy →";
    return;
  }
  const said = messages[index];
  const reply = messages.slice(index + 1).find((m) => m.role === "assistant");
  $("resume-title").textContent = "💬 On reprend où on s'était arrêtés ?";
  $("resume-quote").textContent = `Tu m'avais dit : « ${cleanText(said.content, 90)} »`;
  $("resume-reply").textContent = reply ? `Buddy : « ${cleanText(reply.content, 80)} »` : "";
  $("resume-when").textContent = timeAgo(said.created_at);
  $("resume-btn").textContent = "Reprendre →";
}

// =============================================================
// LE PANNEAU DE DISCUSSION (s'ouvre depuis la droite)
// =============================================================
let currentTopic = null;     // l'objectif dont on parle (ou null)
let topicsOffered = false;   // a-t-on déjà proposé les sujets depuis l'ouverture de l'app ?

function openChat(skipTopics = false) {
  $("chat-drawer").classList.add("open");
  $("chat-drawer").setAttribute("aria-hidden", "false");
  $("drawer-backdrop").classList.remove("hidden");
  $("buddy-fab").classList.add("hidden");
  if (!skipTopics && shouldOfferTopics()) offerTopics();
  $("chat").scrollTop = $("chat").scrollHeight;
  setTimeout(() => $("message").focus(), 300);
}
function closeChat() {
  $("chat-drawer").classList.remove("open");
  $("chat-drawer").setAttribute("aria-hidden", "true");
  $("drawer-backdrop").classList.add("hidden");
  if (state) $("buddy-fab").classList.remove("hidden");
}
$("open-chat").addEventListener("click", () => openChat());
$("resume-card").addEventListener("click", () => openChat()); // toute la carte (et son bouton) ouvre la discussion
$("buddy-fab").addEventListener("click", () => openChat());
$("close-chat").addEventListener("click", closeChat);
$("drawer-backdrop").addEventListener("click", closeChat);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); });

// --- "Alors, on travaille sur quoi aujourd'hui ?" ---
// Proposé quand on revient après une pause (plus de 2 h sans message), une fois par visite.
function shouldOfferTopics() {
  if (topicsOffered || !state || state.messages.length === 0 || !state.profile.style) return false;
  const last = state.messages[state.messages.length - 1];
  return Date.now() - new Date(last.created_at).getTime() > 2 * 60 * 60 * 1000;
}

function offerTopics() {
  topicsOffered = true;
  removeChoices();
  const name = state.profile.firstName ? " " + state.profile.firstName : "";
  showMessage(`Alors${name}, on travaille sur quoi aujourd'hui ?`, "buddy");
  const box = document.createElement("div");
  box.className = "choices";
  box.innerHTML = state.goals.length
    ? state.goals.slice(0, 6).map((g) => `<button class="chip" data-topic="${g.id}">${catOf(g).emoji} ${esc(g.text)}</button>`).join("") +
      `<button class="chip" data-topic="review">🧭 Bilan de la semaine</button>` +
      `<button class="chip" data-topic="new">➕ Nouvel objectif</button>`
    : Object.entries(CATEGORIES).map(([key, cat]) => `<button class="chip" data-topic-cat="${key}">${cat.emoji} ${cat.label}</button>`).join("");
  $("chat").appendChild(box);
  $("chat").scrollTop = $("chat").scrollHeight;
  showEmotion("neutral", false);
}

function removeChoices() {
  for (const box of document.querySelectorAll(".choices")) box.remove();
}

$("chat").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-topic], [data-topic-cat]");
  if (!chip || sendButton.disabled) return;
  removeChoices();
  if (chip.dataset.topic === "review") return startReview();
  if (chip.dataset.topic === "new") return sendToBuddy("Je voudrais me fixer un nouvel objectif.");
  if (chip.dataset.topicCat) return sendToBuddy(`Je voudrais me fixer un objectif en ${CATEGORIES[chip.dataset.topicCat].label}.`);
  talkAbout(goalById(Number(chip.dataset.topic)));
});

// Le bilan de la semaine avec Buddy
function startReview() {
  removeChoices();
  currentTopic = null;
  renderTopic();
  openChat(true);
  sendToBuddy("Faisons le bilan de ma semaine.", { review: true });
}

// Parler d'un objectif précis
function talkAbout(goal) {
  if (!goal) return;
  removeChoices();
  currentTopic = goal.id;
  renderTopic();
  openChat(true);
  sendToBuddy(`On parle de mon objectif « ${goal.text} ».`);
}

$("new-topic").addEventListener("click", () => {
  currentTopic = null;
  renderTopic();
  offerTopics();
});

function renderTopic() {
  const goal = currentTopic && state && goalById(currentTopic);
  $("topic-chip").classList.toggle("hidden", !goal);
  if (goal) $("topic-text").textContent = `${catOf(goal).emoji} ${goal.text}`;
}

// =============================================================
// LA DISCUSSION
// =============================================================
const chat = $("chat");
const sendButton = $("send-button");

function showMessage(text, type) {
  const bubble = document.createElement("div");
  bubble.className = "message " + type;
  bubble.textContent = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight; // descend en bas automatiquement
  return bubble;
}

// Les "..." pendant que Buddy écrit
function showTyping() {
  const bubble = document.createElement("div");
  bubble.className = "message buddy typing";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

// Pendant que tu écris : Buddy t'écoute calmement (une seule fois, pas à chaque touche).
let listening = false;
$("message").addEventListener("input", () => {
  if (!listening && $("message").value.trim() && !sendButton.disabled) {
    listening = true;
    setBuddy("repos", "", "Buddy t'écoute…");
  }
});

// Envoie un message à Buddy (ou rien du tout : Buddy parle alors en premier).
// extra : des informations en plus pour le serveur (ex : { review: true } pour le bilan de la semaine)
async function sendToBuddy(text, extra = {}) {
  if (text) showMessage(text, "user");
  listening = false;
  sendButton.disabled = true;
  setBuddy("repos", "reflechit", "Buddy réfléchit…");
  const typing = showTyping();

  try {
    const data = await api("POST", "/api/chat", { message: text, goalId: currentTopic, ...extra });
    typing.remove();
    if (data.error) {
      showMessage(data.error, "error");
      showEmotion(currentEmotion, false);
    } else {
      showMessage(data.reply, "buddy");
      showEmotion(data.emotion); // Buddy prend l'expression qu'il a choisie
      if (data.goalId) currentTopic = data.goalId;
      // Buddy a peut-être créé un objectif, noté un plan, un prénom… ou AGI (tâches) : on recharge tout
      refresh()
        .then(() => { if (data.acted) toast("Buddy a mis à jour ton application"); })
        .catch((e) => console.error("Rechargement impossible :", e));
    }
  } catch (e) {
    typing.remove();
    showMessage("Impossible de joindre le serveur. Est-il bien lancé ?", "error");
    showEmotion(currentEmotion, false);
  }
  sendButton.disabled = false;
  $("message").focus();
}

$("chat-form").addEventListener("submit", (event) => {
  event.preventDefault(); // empêche la page de se recharger
  const text = $("message").value.trim();
  if (!text || sendButton.disabled) return;
  $("message").value = "";
  removeChoices();
  sendToBuddy(text);
});

// =============================================================
// OUTILS : LE MINUTEUR DE FOCUS
// =============================================================
let focusSeconds = 25 * 60;
let focusLength = 25 * 60;
let focusTimer = null;

function drawFocus() {
  const m = String(Math.floor(focusSeconds / 60)).padStart(2, "0");
  const s = String(focusSeconds % 60).padStart(2, "0");
  $("focus-time").textContent = `${m}:${s}`;
  $("focus-time").classList.toggle("running", !!focusTimer);
  $("focus-start").querySelector("span").textContent = focusTimer ? "Pause" : focusSeconds < focusLength ? "Reprendre" : "Lancer";
  document.title = focusTimer ? `${m}:${s} – Focus` : "Buddy – Ton coach personnel";
}

function stopFocus() {
  clearInterval(focusTimer);
  focusTimer = null;
}

$("focus-start").addEventListener("click", () => {
  if (focusTimer) return stopFocus(), drawFocus();
  focusTimer = setInterval(() => {
    focusSeconds--;
    if (focusSeconds <= 0) {
      stopFocus();
      focusSeconds = focusLength;
      setBuddy("bravo", "saute", "Session terminée !");
      setTimeout(() => showEmotion(currentEmotion, false), 3000);
      alert("Session terminée 💪 Bravo, tu as tenu !");
    }
    drawFocus();
  }, 1000);
  drawFocus();
});
$("focus-reset").addEventListener("click", () => { stopFocus(); focusSeconds = focusLength; drawFocus(); });
for (const chip of document.querySelectorAll("[data-minutes]")) {
  chip.addEventListener("click", () => {
    stopFocus();
    focusLength = focusSeconds = Number(chip.dataset.minutes) * 60;
    drawFocus();
  });
}

// =============================================================
// UNE FOIS CONNECTÉ : on charge le Buddy de CETTE personne
// =============================================================
// Les 2 phrases de motivation du jour (écrites par Buddy, différentes chaque jour)
async function loadQuotes() {
  const quotes = await api("GET", "/api/quote?today=" + today());
  if (quotes.short) $("quote-short").textContent = quotes.short;
  if (quotes.long) $("quote-long").textContent = quotes.long;
}

async function loadMyBuddy(newSession) {
  session = newSession;
  $("password").value = ""; // on ne laisse pas traîner le mot de passe
  chat.innerHTML = "";
  showApp();
  await refresh();
  loadQuotes().catch((e) => console.error("Phrases du jour :", e)); // sans bloquer le reste

  // Le fuseau horaire de cet ordinateur (ex : "Europe/Paris") : on le donne au serveur
  // pour que les rappels arrivent à la bonne heure, même si le serveur est à l'autre bout du monde.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone && state.profile.timezone !== timezone) {
    api("PATCH", "/api/profile", { timezone }).catch((e) => console.error("Fuseau horaire :", e));
  }

  for (const m of state.messages) showMessage(m.content, m.role === "user" ? "user" : "buddy");

  const lastReply = state.messages.filter((m) => m.role === "assistant").pop();
  if (lastReply) {
    // Buddy reprend l'expression de son dernier message
    showEmotion(lastReply.emotion || "motivational", false);
    // On arrive depuis le bouton "Faire mon bilan" de l'e-mail du dimanche ? On lance le bilan.
    if (location.hash === "#bilan") {
      history.replaceState(null, "", "#accueil");
      showPage();
      startReview();
    }
  } else {
    // Toute première visite : on ouvre la discussion et Buddy se présente
    openChat(true);
    sendToBuddy("");
  }
}

// Au chargement : déjà connecté ? (Supabase se souvient de la connexion)
const { data } = await supabase.auth.getSession();
if (data.session) {
  loadMyBuddy(data.session);
} else {
  showLanding();
}
