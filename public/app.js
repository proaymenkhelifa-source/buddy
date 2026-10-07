// app.js – le "cerveau" de la page.
// Ici, PAS de clé secrète : la page parle seulement à notre serveur (server.js),
// et à Supabase avec la clé PUBLIQUE, uniquement pour gérer les comptes.
//
// Le principe, très simple :
//   1. on demande au serveur TOUTES les données de la personne (refresh) ;
//   2. on redessine toute la page avec (render) ;
//   3. après chaque action (cocher, ajouter, modifier…), on recommence 1 et 2.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { DEMO_MODE, FREE_LIMITS, hasPremium, taskLimitFor, styleAllowed, bonusJokersFor, giftUntil, isSubscribed } from "./shared.js";
import { CATEGORIES, MAX_TASKS, BADGES, APP_VERSION, HISTORY_DAYS, dayKey, addDays, mondayOf, computeStats, occursOn, isCurrent, isPlanned, isDone, scheduleLabel, goalWeek, goalProgress } from "./shared.js";
import { t, getLang, setLang, cleanLang, locale, dayLong, dayInitials, LANGUAGES } from "./i18n.js";

// Raccourci : $("id") = document.getElementById("id")
const $ = (id) => document.getElementById(id);

// Protège un texte avant de l'insérer dans du HTML (évite qu'un titre "<b>" casse la page)
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Place le logo (défini une seule fois dans index.html) partout où il y a class="logo"
for (const logo of document.querySelectorAll(".logo")) {
  logo.append($("logo-template").content.cloneNode(true));
}
// Les icônes : chaque <i data-lucide="nom"> devient une icône Phosphor (style plein et arrondi de la marque).
// Les noms viennent de l'ancienne bibliothèque (Lucide) : on les traduit ici ; un nom absent = même nom chez Phosphor.
const ICONS = {
  "circle-check-big": "check-circle", "circle-check": "check-circle", circle: "circle-dashed",
  "calendar-days": "calendar-dots", calendar: "calendar-blank", "chart-column": "chart-bar", settings: "gear-six",
  "chevron-down": "caret-down", "chevron-left": "caret-left", "chevron-right": "caret-right", "log-out": "sign-out",
  "layout-grid": "squares-four", "rotate-ccw": "arrow-counter-clockwise", send: "paper-plane-tilt", map: "map-trifold",
  "trash-2": "trash", "message-square-plus": "chat-circle-dots", pencil: "pencil-simple", "message-circle": "chat-circle",
};
// Les icônes "de trait" (coche, +, ×, flèches) : en style plein, elles seraient dans un carré plein → style gras
const LINE_ICONS = new Set(["plus", "x", "check", "arrow-right", "arrow-left", "caret-down", "caret-left", "caret-right", "arrow-counter-clockwise"]);
function drawIcons() {
  for (const el of document.querySelectorAll("i[data-lucide]")) {
    const name = el.dataset.lucide;
    if (el.dataset.drawn === name) continue; // déjà dessinée
    el.dataset.drawn = name;
    for (const c of [...el.classList]) if (c.startsWith("ph") || c === "lucide" || c.startsWith("lucide-")) el.classList.remove(c);
    const icon = ICONS[name] || name;
    // "lucide" et "lucide-nom" : les anciens noms, que la feuille de style utilise encore
    el.classList.add(LINE_ICONS.has(icon) ? "ph-bold" : "ph-fill", "ph-" + icon, "lucide", "lucide-" + name);
    el.setAttribute("aria-hidden", "true");
  }
}
drawIcons();

// =============================================================
// LA LANGUE (français / anglais)
// 1. Si la personne a déjà choisi (bouton FR/EN), on garde son choix (retenu dans le navigateur).
// 2. Sinon, on regarde la langue du téléphone / de l'ordinateur : français → français, sinon anglais.
// =============================================================
function savedLang() {
  try { return cleanLang(localStorage.getItem("buddy-lang")); } catch (e) { return null; }
}
function deviceLang() {
  return (navigator.languages || [navigator.language]).some((l) => cleanLang(l) === "fr") ? "fr" : "en";
}
setLang(savedLang() || deviceLang());

// Écrit tous les textes "fixes" de la page dans la langue en cours (voir les data-i18n dans index.html)
function translatePage() {
  const lang = getLang();
  document.documentElement.lang = lang;
  if (!focusTimer) document.title = t("page.title");
  const vars = { max: MAX_TASKS, word: t("delete.word"), ...FREE_LIMITS };
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n, vars);
  // Les images qui existent en 2 langues (ex : "images/app-desktop-{lang}.jpg")
  for (const el of document.querySelectorAll("[data-src-lang]")) el.src = el.dataset.srcLang.replace("{lang}", lang);
  for (const el of document.querySelectorAll("[data-i18n-alt]")) el.alt = t(el.dataset.i18nAlt);
  for (const el of document.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml, vars);
  for (const el of document.querySelectorAll("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh, vars);
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute("aria-label", el.title);
  }
  for (const el of document.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
  // Les boutons FR/EN : ils affichent l'AUTRE langue (celle vers laquelle on passe)
  const other = Object.keys(LANGUAGES).find((l) => l !== lang);
  for (const b of document.querySelectorAll(".lang-toggle")) b.textContent = other.toUpperCase();
  for (const b of document.querySelectorAll("[data-lang-choice]")) b.classList.toggle("active", b.dataset.langChoice === lang);
  // Les jours dans la fenêtre "tâche" (L M M J V S D / M T W T F S S)
  for (const b of document.querySelectorAll("[data-day]")) {
    b.textContent = dayInitials()[b.dataset.day - 1];
    b.title = capitalize(dayLong(Number(b.dataset.day)));
  }
  // Le minuteur de focus (son bouton change de texte)
  drawFocus();
  // Les textes des écrans ouverts
  if (!$("auth-screen").classList.contains("hidden")) openAuth(authMode, false);
}

// Change de langue : on retient le choix, on retraduit tout, et on prévient le serveur (Buddy + e-mails)
async function changeLang(lang) {
  setLang(lang);
  try { localStorage.setItem("buddy-lang", lang); } catch (e) {}
  translatePage();
  if (!state) return;
  render();
  showEmotion(currentEmotion, false);
  toast(t("toast.language"));
  await api("PATCH", "/api/profile", { language: lang });
  state.profile.language = lang;
  loadQuotes().catch((e) => console.error("Phrases du jour :", e)); // les phrases du jour, dans la nouvelle langue
}
for (const b of document.querySelectorAll(".lang-toggle")) {
  b.addEventListener("click", () => changeLang(Object.keys(LANGUAGES).find((l) => l !== getLang())));
}
for (const b of document.querySelectorAll("[data-lang-choice]")) {
  b.addEventListener("click", () => changeLang(b.dataset.langChoice));
}

// Le jour d'aujourd'hui, au format "AAAA-MM-JJ"
const today = () => dayKey(new Date());
const niceDate = (key, options = { weekday: "long", day: "numeric", month: "long" }) =>
  new Date(key + "T12:00:00").toLocaleDateString(locale(), options);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// =============================================================
// LES BROUILLONS (idée d'un ami testeur)
// Ce qu'on est en train d'écrire est gardé dans le navigateur (jamais sur Internet) :
// si la page se recharge par accident, rien n'est perdu. Le brouillon s'efface une fois envoyé,
// et tous les brouillons s'effacent à la déconnexion. Jamais de mot de passe dedans.
// =============================================================
const DRAFT_PREFIX = "buddy-draft-";
// Un brouillon par personne (si deux comptes utilisent le même téléphone, chacun a les siens)
const draftKey = (name) => DRAFT_PREFIX + (session?.user?.id || "visiteur") + "-" + name;
function saveDraft(name, value) {
  try { localStorage.setItem(draftKey(name), JSON.stringify(value)); } catch (e) {}
}
function readDraft(name) {
  try { return JSON.parse(localStorage.getItem(draftKey(name))); } catch (e) { return null; }
}
function clearDraft(name) {
  try { localStorage.removeItem(draftKey(name)); } catch (e) {}
}
function clearAllDrafts() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k); } catch (e) {}
}

// L'APPLI ANDROID (Google Play) : Buddy y est ouvert par l'appli du store, avec ?src=play.
// Là-bas, Google interdit de vendre un abonnement autrement qu'avec son propre système : dans ce "mode store",
// on n'affiche ni prix ni bouton de paiement. Les abonnés du site gardent bien sûr Premium en se connectant.
// Lu AVANT que l'étiquette ?src= soit retirée de l'adresse (juste en dessous).
// (Mémorisé pour la session seulement : le site ouvert dans Chrome, lui, n'est jamais concerné.)
const STORE_MODE = (() => {
  try {
    if (new URLSearchParams(location.search).get("src") === "play" || document.referrer.startsWith("android-app://")) {
      sessionStorage.setItem("buddy-store", "play");
    }
    return sessionStorage.getItem("buddy-store") === "play";
  } catch (e) { return false; }
})();
document.documentElement.classList.toggle("store-mode", STORE_MODE);

// =============================================================
// D'OÙ VIENT LA PERSONNE ? (pour savoir quel réseau social amène des inscrits)
// Chaque réseau a son lien : buddycoach.app/?src=insta-fr, ?src=tiktok-en…
// On retient la PREMIÈRE étiquette vue, puis elle est envoyée avec l'inscription
// et rangée dans le profil (colonne "source" dans Supabase).
// =============================================================
const SOURCE_KEY = "buddy-source";
const cleanSource = (v) => { const s = String(v || "").toLowerCase().trim(); return /^[a-z0-9_-]{1,40}$/.test(s) ? s : null; };
{
  const params = new URLSearchParams(location.search);
  const src = cleanSource(params.get("src") || params.get("utm_source"));
  if (src) {
    try { if (!localStorage.getItem(SOURCE_KEY)) localStorage.setItem(SOURCE_KEY, src); } catch (e) {}
    // On enlève l'étiquette de l'adresse (plus propre si la personne la partage)
    params.delete("src");
    params.delete("utm_source");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
  }
}
const visitorSource = () => { try { return localStorage.getItem(SOURCE_KEY); } catch (e) { return null; } };

// On arrive depuis le lien "choisir un nouveau mot de passe" reçu par e-mail ?
// (on le regarde MAINTENANT : Supabase efface ces informations de l'adresse une fois lues)
const RECOVERY_LINK = /type=recovery/.test(location.hash);
const EXPIRED_LINK = /error_code=otp_expired|error=access_denied/.test(location.hash);
// On revient de Google / Apple ? (pour bien expliquer une éventuelle erreur au retour)
const OAUTH_RETURN = (() => {
  try { const v = sessionStorage.getItem("buddy-oauth"); sessionStorage.removeItem("buddy-oauth"); return v === "1"; } catch (e) { return false; }
})();

// On demande au serveur l'adresse Supabase et la clé PUBLIQUE.
const config = await (await fetch("/api/config")).json();
const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);

// Toutes les données de la personne connectée (remplies par refresh())
let state = null;
let session = null;

// =============================================================
// LE THÈME (clair par défaut / sombre)
// =============================================================
// remember = true seulement quand la personne CHOISIT (bouton) : sinon on ne retient rien,
// et le thème clair (celui de la marque) reste la règle.
function setTheme(theme, remember = false) {
  document.documentElement.dataset.theme = theme;
  if (remember) try { localStorage.setItem("buddy-theme-choice", theme); } catch (e) {}
  for (const b of document.querySelectorAll("[data-theme-choice]")) {
    b.classList.toggle("active", b.dataset.themeChoice === theme);
  }
}
for (const button of document.querySelectorAll(".theme-toggle")) {
  button.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
}
for (const button of document.querySelectorAll("[data-theme-choice]")) {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice, true));
}

// =============================================================
// LES PAGES (Accueil, Mes objectifs, Suivi, Outils, Paramètres)
// L'adresse change (#suivi, #objectifs…) : le bouton "retour" du navigateur marche aussi.
// =============================================================
const PAGES = ["accueil", "objectifs", "calendrier", "suivi", "outils", "parametres"];

function showPage() {
  const page = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "accueil";
  for (const p of PAGES) $("page-" + p).classList.toggle("hidden", p !== page);
  for (const link of document.querySelectorAll(".side-link")) {
    link.classList.toggle("active", link.dataset.page === page);
  }
  $("user-dropdown").classList.add("hidden");
  window.scrollTo(0, 0);
  // La frise du jour se mesure à l'écran : on la redessine quand l'accueil réapparaît
  if (page === "accueil") setTimeout(redrawTimeline);
}
window.addEventListener("hashchange", showPage);

function showLanding() {
  $("landing").classList.remove("hidden");
  replayReveal();
  $("auth-screen").classList.add("hidden");
  $("app").classList.add("hidden");
  $("buddy-fab").classList.add("hidden");
}
function showApp() {
  $("landing").classList.add("hidden");
  $("auth-screen").classList.add("hidden");
  // Si on vient de la page de connexion, on arrive sur l'accueil de l'appli
  if (["#inscription", "#connexion"].includes(location.hash)) history.replaceState(null, "", "#accueil");
  $("app").classList.remove("hidden");
  $("buddy-fab").classList.remove("hidden");
  showPage();
}

// =============================================================
// LE COMPTE (inscription / connexion / déconnexion)
// =============================================================
// Les 4 écrans possibles :
//   "signup" = créer un compte · "login" = se connecter
//   "forgot" = mot de passe oublié (on reçoit un lien par e-mail) · "reset" = choisir un nouveau mot de passe
let authMode = "signup";

// --- Se connecter avec Google / Apple ---
// On demande à Supabase quels services sont activés (Authentication → Providers) : seuls leurs boutons s'affichent.
let oauthProviders = [];
fetch(config.supabaseUrl + "/auth/v1/settings", { headers: { apikey: config.supabasePublishableKey } })
  .then((r) => r.json())
  .then((settings) => { oauthProviders = ["google", "apple"].filter((p) => settings.external?.[p]); showProviders(); })
  .catch(() => {});
function showProviders() {
  for (const b of document.querySelectorAll("[data-provider]")) b.classList.toggle("hidden", !oauthProviders.includes(b.dataset.provider));
  $("auth-providers").classList.toggle("hidden", !oauthProviders.length || !["signup", "login"].includes(authMode));
}
for (const button of document.querySelectorAll("[data-provider]")) {
  button.addEventListener("click", async () => {
    try { sessionStorage.setItem("buddy-oauth", "1"); } catch (e) {}
    authInfo("…");
    // On part chez Google / Apple, qui nous renvoie ici une fois connecté (la session est lue automatiquement)
    const { error } = await supabase.auth.signInWithOAuth({ provider: button.dataset.provider, options: { redirectTo: location.origin + "/" } });
    if (error) authInfo(authErrorText(error));
  });
}
const AUTH_SCREENS = {
  signup: { hash: "#inscription",          title: "auth.titleSignup", sub: "auth.subSignup", submit: "auth.submitSignup" },
  login:  { hash: "#connexion",            title: "auth.titleLogin",  sub: "auth.subLogin",  submit: "auth.submitLogin" },
  forgot: { hash: "#mot-de-passe-oublie",  title: "auth.titleForgot", sub: "auth.subForgot", submit: "auth.submitForgot" },
  reset:  { hash: "#nouveau-mot-de-passe", title: "auth.titleReset",  sub: "auth.subReset",  submit: "auth.submitReset" },
};

// Montre un petit message sous le bouton (en rouge, ou en vert si c'est une bonne nouvelle)
function authInfo(text, ok = false) {
  $("auth-info").textContent = text;
  $("auth-info").classList.toggle("ok", ok);
}

// La page de connexion / inscription est une page à part entière (#inscription, #connexion… dans l'adresse) :
// le bouton "retour" du téléphone ramène à l'accueil.
// fresh = false : on ne fait que retraduire l'écran déjà ouvert (changement de langue)
function openAuth(mode, fresh = true) {
  authMode = mode;
  const screen = AUTH_SCREENS[mode];
  $("landing").classList.add("hidden");
  $("auth-screen").classList.remove("hidden");
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  }
  $("auth-title").textContent = t(screen.title);
  $("auth-subtitle").textContent = t(screen.sub);
  $("auth-submit").textContent = t(screen.submit);
  // Ce qu'on affiche selon l'écran
  document.querySelector(".auth-card .tabs").classList.toggle("hidden", mode === "forgot" || mode === "reset");
  $("auth-legal").classList.toggle("hidden", mode !== "signup"); // "En créant ton compte, tu acceptes…"
  showProviders(); // "Continuer avec Google / Apple" (inscription et connexion seulement)
  $("email").classList.toggle("hidden", mode === "reset");
  $("password").classList.toggle("hidden", mode === "forgot");
  $("password2").classList.toggle("hidden", mode !== "reset");
  $("auth-forgot").classList.toggle("hidden", mode !== "login");
  $("password").placeholder = t(mode === "reset" ? "auth.newPasswordPh" : "auth.passwordPh");
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("auth-switch").innerHTML =
    mode === "signup" ? `${t("auth.haveAccount")} <button type="button" data-mode-switch="login">${t("auth.tabLogin")}</button>` :
    mode === "login" ? `${t("auth.noAccount")} <button type="button" data-mode-switch="signup">${t("auth.tabSignup")}</button>` :
    mode === "forgot" ? `${t("auth.remember")} <button type="button" data-mode-switch="login">${t("auth.tabLogin")}</button>` : "";
  if (!fresh) return;
  $("auth-card").classList.remove("hidden"); // le formulaire (et pas l'écran "Bienvenue dans l'équipe")
  $("auth-done").classList.add("hidden");
  window.scrollTo(0, 0);
  authInfo("");
  if (location.hash !== screen.hash) history.pushState(null, "", screen.hash);
  setTimeout(() => $(mode === "reset" ? "password" : "email").focus(), 50);
}
$("auth-forgot").addEventListener("click", () => openAuth("forgot"));

// L'écran qui correspond à l'adresse (#connexion…), pour le bouton "retour" du téléphone
const authModeFromHash = () => Object.keys(AUTH_SCREENS).find((m) => AUTH_SCREENS[m].hash === location.hash && m !== "reset");

function closeAuth() {
  $("auth-screen").classList.add("hidden");
  if (!session) {
    $("landing").classList.remove("hidden");
    replayReveal(); // de retour sur l'accueil : les éléments réapparaissent en mouvement
  }
}

// "C'est parti" : on descend en douceur vers la suite (les captures, puis les offres).
$("hero-cta").addEventListener("click", () => $("showcase").scrollIntoView({ behavior: "smooth", block: "start" }));
// La pastille "7 jours de Premium offerts" : on descend en douceur jusqu'aux offres
$("trial-pill").addEventListener("click", (e) => { e.preventDefault(); $("plans").scrollIntoView({ behavior: "smooth", block: "start" }); });
// Les boutons des offres : la personne choisit Gratuit ou Premium AVANT de créer son compte.
// Le choix est gardé dans le navigateur, puis enregistré juste après l'inscription (l'écran Premium ne redemande pas).
for (const b of document.querySelectorAll("[data-plan-choice]")) {
  b.addEventListener("click", () => {
    try { localStorage.setItem("buddy-plan-wish", b.dataset.planChoice); } catch (e) {}
    openAuth("signup");
  });
}

// Les éléments de la page d'accueil apparaissent petit à petit quand on fait défiler (class="reveal").
// --d = un petit retard, pour qu'ils arrivent les uns après les autres.
// Ils rejouent leur apparition à chaque fois : quand on remonte puis redescend, et quand on revient sur l'accueil.
let revealWatcher = null;
function replayReveal() {
  if (!revealWatcher) return;
  for (const el of document.querySelectorAll(".reveal")) {
    el.classList.remove("in");
    revealWatcher.unobserve(el);
    revealWatcher.observe(el); // regardé à nouveau : il réapparaîtra quand on arrivera dessus
  }
}
function setupReveal() {
  // Chaque ligne des offres arrive l'une après l'autre
  document.querySelectorAll(".plan-card").forEach((card, c) => {
    card.querySelectorAll(".plan-list li").forEach((li, i) => {
      li.classList.add("reveal");
      li.style.setProperty("--d", (0.3 + c * 0.15 + i * 0.07).toFixed(2) + "s");
    });
  });
  const items = document.querySelectorAll(".reveal");
  // Pas d'animation pour ceux qui l'ont demandé (ou un vieux navigateur) : tout est visible tout de suite
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach((el) => el.classList.add("in"));
    return;
  }
  revealWatcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add("in"); // il apparaît
      // Il est reparti SOUS l'écran (on est remonté) : il rejouera son apparition en redescendant
      else if (entry.boundingClientRect.top > innerHeight) entry.target.classList.remove("in");
    }
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  items.forEach((el) => revealWatcher.observe(el));
}
setupReveal();
$("nav-login").addEventListener("click", () => openAuth("login"));
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => openAuth(tab.dataset.mode));
}
$("auth-switch").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode-switch]");
  if (b) openAuth(b.dataset.modeSwitch);
});
$("auth-back").addEventListener("click", () => {
  history.pushState(null, "", location.pathname); // on retire #inscription / #connexion de l'adresse
  closeAuth();
});
// Le bouton "retour" du navigateur ou du téléphone
for (const event of ["hashchange", "popstate"]) {
  window.addEventListener(event, () => {
    if (session || authMode === "reset") return;
    const mode = authModeFromHash();
    if (mode) { if (mode !== authMode || $("auth-screen").classList.contains("hidden")) openAuth(mode); }
    else closeAuth();
  });
}
// Appuyer sur Entrée dans un champ = cliquer sur le bouton
for (const id of ["email", "password", "password2"]) {
  $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") $("auth-submit").click(); });
}
// L'e-mail tapé sur la page de connexion est gardé en brouillon (le mot de passe, JAMAIS)
$("email").addEventListener("input", () => saveDraft("auth-email", $("email").value));

// Les erreurs de Supabase (en anglais technique) → un message clair, dans la langue de la page
function authErrorText(error) {
  const m = String(error.message || "");
  console.error("Connexion / inscription :", error.status, m); // le message exact, pour chercher la cause
  if (/rate limit|too many|only request this after/i.test(m)) return t("auth.errRate");
  if (/sending.*email|confirmation email/i.test(m)) return t("auth.errEmailSend");
  if (/already registered|already exists/i.test(m)) return t("auth.errExists");
  if (/invalid login credentials/i.test(m)) return t("auth.errCredentials");
  if (/email not confirmed/i.test(m)) return t("auth.errNotConfirmed");
  if (/different from the old/i.test(m)) return t("auth.errSamePassword");
  if (/session|expired|jwt/i.test(m)) return t("auth.linkExpired");
  if (/password/i.test(m)) return t("auth.errPassword");
  if (/email/i.test(m) && /invalid|validate/i.test(m)) return t("auth.errEmail");
  return t("auth.error") + m;
}

$("auth-submit").addEventListener("click", async () => {
  const button = $("auth-submit");
  if (button.disabled) return; // pas de double clic (Supabase bloquerait les tentatives répétées)
  const email = $("email").value.trim();
  const password = $("password").value;
  // Vérifications simples avant de demander quoi que ce soit à Supabase
  if (authMode !== "reset" && !email) return authInfo(t("auth.errEmailMissing"));
  if (authMode === "reset" && password.length < 6) return authInfo(t("auth.errPassword"));
  if (authMode === "reset" && password !== $("password2").value) return authInfo(t("auth.errMismatch"));
  button.disabled = true;
  authInfo("…");
  let result;
  try {
    // L'étiquette "d'où vient la personne" part avec l'inscription (elle suit le compte, même si
    // l'e-mail de confirmation est ouvert dans un autre navigateur)
    if (authMode === "signup") result = await supabase.auth.signUp({ email, password, options: { data: visitorSource() ? { source: visitorSource() } : {} } });
    else if (authMode === "login") result = await supabase.auth.signInWithPassword({ email, password });
    // Mot de passe oublié : Supabase envoie un e-mail avec un lien qui ramène ici
    else if (authMode === "forgot") result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/" });
    // Le nouveau mot de passe (on est connecté grâce au lien de l'e-mail)
    else result = await supabase.auth.updateUser({ password });
  } catch (e) {
    result = { data: {}, error: e };
  }
  button.disabled = false;
  const { data, error } = result;

  if (error) return authInfo(authErrorText(error));
  if (authMode === "forgot") {
    // On ne dit jamais si l'adresse a un compte ou pas (sinon n'importe qui pourrait le vérifier)
    return authInfo(t("auth.forgotSent"), true);
  }
  if (authMode === "reset") {
    for (const id of ["password", "password2"]) $(id).value = "";
    authMode = "login";
    history.replaceState(null, "", "#accueil");
    const { data: current } = await supabase.auth.getSession();
    await loadMyBuddy(current.session);
    return toast(t("toast.passwordChanged"));
  }
  if (!data.session) {
    // Si Supabase demande de confirmer l'e-mail, il n'y a pas encore de session :
    // on affiche l'écran "Bienvenue dans l'équipe ! Va voir tes e-mails".
    authInfo("");
    $("auth-done-email").textContent = email;
    $("auth-card").classList.add("hidden");
    $("auth-done").classList.remove("hidden");
    window.scrollTo(0, 0);
    return;
  }
  clearDraft("auth-email"); // connecté : plus besoin de garder l'e-mail en brouillon
  loadMyBuddy(data.session);
});

// "C'est fait, je me connecte" : on passe à la connexion (l'e-mail est déjà rempli)
$("auth-done-login").addEventListener("click", () => {
  $("password").value = "";
  openAuth("login");
});

// Le menu du compte (en haut à droite)
$("user-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("user-dropdown").classList.toggle("hidden");
});
document.addEventListener("click", () => $("user-dropdown").classList.add("hidden"));

async function logout() {
  // Ce téléphone ne doit plus recevoir les notifications de la personne qui se déconnecte
  try {
    const sub = await currentSubscription();
    if (sub && session) await api("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint });
  } catch (e) {}
  // "local" : on oublie la connexion sur cet appareil (marche même si le compte vient d'être supprimé)
  try { await supabase.auth.signOut({ scope: "local" }); } catch (e) {}
  // On "débarrasse la table" : on efface tout ce que la personne précédente a laissé (brouillons compris).
  clearAllDrafts();
  try { localStorage.removeItem("buddy-plan-asked"); } catch (e) {}
  state = null;
  session = null;
  currentTopic = null;
  setChatTheme(null);
  topicsOffered = false;
  for (const id of ["email", "password", "message"]) $(id).value = "";
  closeChat();
  $("chat").innerHTML = "";
  $("auth-info").textContent = "";
  $("auth-screen").classList.add("hidden");
  history.replaceState(null, "", location.pathname);
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
      "X-Lang": getLang(), // la langue de la page : le serveur répond dans la même
    },
    body: body ? JSON.stringify({ ...body, today: today() }) : undefined,
  });
  return response.json();
}

// On revient de Stripe ? (?checkout=success / ?checkout=cancel après le paiement, ?portal=1 après "Gérer mon abonnement")
const returnParams = new URLSearchParams(location.search);
let stripeReturn = returnParams.get("checkout") || (returnParams.has("portal") ? "portal" : null);

// Recharge toutes les données, puis redessine la page
async function refresh() {
  // sync=1 : le serveur redemande tout de suite à Stripe où en est l'abonnement
  const src = visitorSource();
  const data = await api("GET", "/api/state?today=" + today() + (stripeReturn ? "&sync=1" : "") + (src ? "&src=" + encodeURIComponent(src) : ""));
  if (data.error) return toast(data.error, "error");
  // Le serveur tourne-t-il avec le même code que la page ? Sinon, des choses peuvent ne pas s'enregistrer.
  if (data.version !== APP_VERSION) {
    toast(t("toast.serverOld"), "error");
  }
  data.badges = data.badges || [];
  data.drafts = data.drafts || []; // les objectifs pas encore finis de définir avec Buddy
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
// L'icône d'une catégorie (la même que sur l'accueil), à la place des emojis
const catIcon = (cat) => `<i data-lucide="${cat.icon}" class="chip-ico" style="--c:${cat.color}"></i>`;
const isDoneToday = (task) => state.logs.some((l) => l.task_id === task.id && l.day === today());
let stats = null;
let goalFilter = "toutes";

function render() {
  stats = computeStats(state.tasks, state.logs, today(), bonusJokersFor(state.profile));
  // Chaque morceau de la page est dessiné séparément : si l'un plante, les autres s'affichent quand même.
  for (const part of [renderProfile, renderToday, renderTimeline, renderGoalsSummary, renderWeek, renderCategories,
    renderGoalsPage, renderCalendar, renderSuivi, renderTools, renderSettings, renderTopic, renderResume, renderPushLater, drawIcons]) {
    try {
      part();
    } catch (error) {
      console.error(`Erreur d'affichage dans ${part.name} :`, error);
    }
  }
}

// La carte des notifications se dessine "à côté" (elle doit demander l'état au navigateur, ce qui prend un instant)
function renderPushLater() {
  renderPush().then(drawIcons).catch((e) => console.error("Notifications :", e));
}

function renderProfile() {
  const email = session.user.email;
  const name = state.profile.firstName || email.split("@")[0];
  $("user-name").textContent = name;
  $("greeting-name").textContent = capitalize(name);
  $("user-avatar").textContent = name.charAt(0);
  $("user-email").textContent = email;
  $("settings-email").textContent = t("settings.connectedAs", { email });
  $("style-badge").textContent = state.profile.style ? t("styleBadge." + state.profile.style) : "";
  $("style-badge").classList.toggle("hidden", !state.profile.style);

  // La petite phrase sous "Salut …" dépend de la journée
  const { planned, done } = stats.today;
  $("greeting-sub").innerHTML =
    state.tasks.length === 0 ? t("greet.firstDay") : // tout nouveau compte : une invitation à écrire son premier défi
    planned === 0 ? t("greet.noTasks") :
    done === planned ? t("greet.allDone") :
    t("greet.left", { n: planned - done });
}

// --- Aujourd'hui ---
function renderToday() {
  $("today-date").textContent = capitalize(niceDate(today()));
  const tasks = todayTasks();

  $("today-list").innerHTML = tasks.length === 0
    ? `<li class="empty">${t("today.empty", { max: taskLimitFor(state.profile) })}
         <br><button class="btn btn-primary" data-new-task><i data-lucide="plus"></i> ${t("today.add")}</button></li>`
    : tasks.map((task) => {
        const goal = goalById(task.goal_id);
        return `<li class="${isDoneToday(task) ? "done" : ""}">
          <button class="check" data-check="${task.id}" title="${t("task.checkTip")}"></button>
          <button class="task-title" data-edit-task="${task.id}" title="${t("common.edit")}">
            ${goal ? `<span class="cat-dot" style="--c:${catOf(goal).color}"></span>` : ""}<span>${esc(task.title)}</span>
          </button>
          <time>${esc(task.time || "")}</time>
          <button class="edit-btn" data-edit-task="${task.id}" title="${t("task.edit")}"><i data-lucide="pencil"></i></button>
        </li>`;
      }).join("");

  const { planned, done } = stats.today;
  $("today-count").textContent = planned ? t("today.count", { done, planned }) : "";
  $("today-bar").style.width = planned ? (done / planned) * 100 + "%" : "0%";

  // Les tâches des autres jours, repliées sous la liste (clique pour les voir / modifier)
  const others = activeTasks().filter((task) => !occursOn(task, today()));
  $("other-days").classList.toggle("hidden", others.length === 0);
  $("other-days-summary").textContent = t("today.others", { n: others.length });
  $("other-list").innerHTML = others.map((task) => {
    const goal = goalById(task.goal_id);
    return `<li><button data-edit-task="${task.id}">
      ${goal ? `<span class="cat-dot" style="--c:${catOf(goal).color}"></span>` : ""}${esc(task.title)}
      <span class="when">${esc(scheduleLabel(task))}${task.time ? " · " + esc(task.time) : ""}</span>
    </button></li>`;
  }).join("");
}

// --- La frise du jour (dans la bannière) ---
// Les tâches d'aujourd'hui dans l'ordre de la journée, reliées par une courbe. Chaque tâche cochée
// fait avancer la courbe jusqu'à l'étape suivante ; quand tout est fait, elle arrive sur Buddy qui félicite.
// Le dessin n'est refait que si la LISTE change : sinon on met seulement à jour les coches et la courbe,
// pour que le mouvement soit animé (la courbe "glisse" d'une étape à l'autre).
let tlKey = "";   // la liste dessinée (pour savoir s'il faut tout redessiner)
let tlDone = -1;  // combien de tâches étaient faites au dernier dessin (-1 = premier dessin : pas d'animation)
let tlWonText = null; // le mot de Buddy quand tout est fait (tiré au hasard : un différent à chaque fois)

function renderTimeline() {
  const box = $("timeline");
  // Par heure ; les tâches sans heure à la fin, dans leur ordre habituel
  const tasks = todayTasks().slice().sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  const key = getLang() + "|" + tasks.map((task) => `${task.id}:${task.title}:${task.time || ""}:${task.goal_id || ""}`).join(",");
  if (key !== tlKey) {
    tlKey = key;
    tlDone = -1;
    tlWonText = null;
    box.innerHTML = tasks.length === 0
      ? `<div class="tl-empty"><img src="buddy/relax.webp" alt=""><p>${t("timeline.empty")}</p>
           <button class="btn btn-primary" data-new-task><i data-lucide="plus"></i> ${t("today.add")}</button></div>`
      : `<div class="tl-scroll"><div class="tl-track">
          <svg class="tl-svg" aria-hidden="true"><path class="tl-path-bg"/><path class="tl-path-done"/></svg>
          ${tasks.map((task) => {
            const goal = goalById(task.goal_id);
            return `<button class="tl-node" data-check="${task.id}" data-task="${task.id}" title="${esc(task.title)}">
              <span class="tl-dot"><i data-lucide="${goal ? catOf(goal).icon : "check-square"}"></i><span class="tl-check"><i data-lucide="check"></i></span></span>
              <span class="tl-label">${esc(task.title)}</span>
              <span class="tl-time">${esc(task.time || "")}</span>
            </button>`;
          }).join("")}
          <div class="tl-node tl-end">
            <span class="tl-dot"><img src="buddy/relax.webp" alt=""><span class="tl-stars"><i></i><i></i><i></i></span></span>
            <span class="tl-label"></span><span class="tl-time"></span>
          </div>
        </div></div>`;
    drawIcons();
  }
  if (!tasks.length) return;

  // Les coches, la prochaine tâche à faire, et Buddy au bout
  const nodes = [...box.querySelectorAll(".tl-node:not(.tl-end)")];
  let done = 0, next = null;
  for (const node of nodes) {
    const isDone = isDoneToday({ id: Number(node.dataset.task) });
    node.classList.toggle("done", isDone);
    node.classList.remove("next");
    if (isDone) done++;
    else if (!next) next = node;
    node.setAttribute("aria-label", `${node.title} — ${t(isDone ? "timeline.done" : "timeline.todo")}`);
  }
  next?.classList.add("next");
  const end = box.querySelector(".tl-end");
  const won = done === nodes.length;
  end.classList.toggle("won", won);
  end.querySelector("img").src = "buddy/" + (won ? "bravo" : "relax") + ".webp";
  if (won && !tlWonText) {
    const words = t("timeline.won").split("|");
    tlWonText = words[Math.floor(Math.random() * words.length)];
  }
  if (!won) tlWonText = null; // une tâche décochée : au prochain "tout fait", un nouveau mot
  end.querySelector(".tl-label").textContent = won ? tlWonText : t("timeline.end");

  const before = tlDone;
  tlDone = done;
  drawTimelinePath(before < 0 || before === done ? null : before);

  // L'étape que la courbe vient d'atteindre fait un petit "pop" en arrivant
  if (before >= 0 && done > before) {
    const reached = done < nodes.length ? nodes[done] : end;
    reached.classList.remove("reached");
    void reached.offsetWidth;
    reached.classList.add("reached");
  }
  // On fait défiler la frise jusqu'à l'étape en cours (utile quand il y a beaucoup de tâches)
  const scroller = box.querySelector(".tl-scroll");
  const focus = next || end;
  if (scroller.scrollWidth > scroller.clientWidth) {
    scroller.scrollTo({ left: focus.offsetLeft - scroller.clientWidth / 2 + focus.offsetWidth / 2, behavior: before < 0 ? "auto" : "smooth" });
  }
}

// La courbe : une ligne ondulée qui passe par le centre de chaque rond. La partie "faite" (menthe)
// va jusqu'à l'étape n° tlDone. from = l'ancienne position (pour animer), null = pas d'animation.
function drawTimelinePath(from) {
  const box = $("timeline");
  const svg = box.querySelector(".tl-svg");
  if (!svg || !box.offsetParent) return; // pas de frise, ou page cachée : on redessinera plus tard
  const points = [...box.querySelectorAll(".tl-node")].map((node) => {
    const dot = node.querySelector(".tl-dot");
    return [node.offsetLeft + node.offsetWidth / 2, node.offsetTop + dot.offsetTop + dot.offsetHeight / 2];
  });
  // Chaque morceau est une courbe douce, un coup vers le bas, un coup vers le haut
  const parts = points.slice(1).map(([x, y], i) => {
    const [x0, y0] = points[i], dx = x - x0, wave = i % 2 ? -12 : 12;
    return `C ${x0 + dx / 2} ${y0 + wave}, ${x - dx / 2} ${y - wave}, ${x} ${y}`;
  });
  const d = `M ${points[0][0]} ${points[0][1]} ` + parts.join(" ");
  const [bg, fill] = svg.querySelectorAll("path");
  bg.setAttribute("d", d);
  fill.setAttribute("d", d);
  // La longueur de la courbe jusqu'à chaque étape
  const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.append(probe);
  const lengthTo = (n) => {
    if (n <= 0) return 0;
    probe.setAttribute("d", `M ${points[0][0]} ${points[0][1]} ` + parts.slice(0, n).join(" "));
    return probe.getTotalLength();
  };
  const total = fill.getTotalLength();
  const target = lengthTo(tlDone);
  const start = from === null ? target : lengthTo(from);
  probe.remove();
  fill.style.strokeDasharray = `${total} ${total}`;
  // On place la courbe à son ancienne position SANS animation, puis on la laisse glisser jusqu'à la nouvelle
  fill.style.transition = "none";
  fill.style.strokeDashoffset = total - start;
  void fill.getBoundingClientRect();
  fill.style.transition = "";
  fill.style.strokeDashoffset = total - target;
}
// Recalcule la courbe sans animation : quand la taille de l'écran change, quand l'accueil réapparaît,
// et quand les polices ont fini de charger (les étiquettes changent un peu de taille)
function redrawTimeline() {
  if (tlDone >= 0) drawTimelinePath(null);
}
let tlResize;
addEventListener("resize", () => {
  clearTimeout(tlResize);
  tlResize = setTimeout(redrawTimeline, 150);
});
document.fonts?.ready.then(() => redrawTimeline());

// --- Mes objectifs (carte de l'accueil) ---
// "Cette semaine : 3/6" pour un objectif, calculé automatiquement à partir des tâches cochées
function goalWeekText(g) {
  const w = goalWeek(state.tasks, state.logs, today(), g.id);
  return w.planned ? t("goal.week", w) : t("goal.weekNone");
}

// Le % d'un objectif (automatique s'il a des tâches liées, sinon manuel)
const progressOf = (g) => goalProgress(state.tasks, state.logs, today(), g);

function goalLine(g) {
  const cat = catOf(g);
  const p = progressOf(g);
  return `<li class="clickable" style="--c:${cat.color}" data-edit-goal="${g.id}">
    <span class="goal-icon"><i data-lucide="${cat.icon}"></i></span>
    <span>${esc(g.text)}<small class="goal-week">${goalWeekText(g)}</small></span>${p.value
      ? `<strong title="${t(p.auto ? "goal.autoTip" : "goal.manualTip")}">${p.value}%</strong>`
      : `<strong class="goal-start">${t("goal.start")}</strong>` /* 0 % : "À lancer", pas un zéro qui décourage */}
    <div class="bar"><div style="width:${p.value}%"></div></div>
  </li>`;
}

function renderGoalsSummary() {
  $("goals-summary").innerHTML = state.goals.length === 0
    ? `<li class="empty">${t("goals.empty")}<br>
         <button class="btn btn-primary" data-new-goal><i data-lucide="plus"></i> ${t("goals.create")}</button></li>`
    : state.goals.slice(0, 5).map(goalLine).join("");
}

// --- Cette semaine ---
function renderWeek() {
  const w = stats.week;
  $("week-ring").style.setProperty("--p", w.rate);
  // Rien de coché cette semaine : jamais "0 % de réussite", une invitation à commencer
  if (w.done === 0) {
    $("week-rate").textContent = "💪";
    $("week-ring-label").textContent = t("week.go");
    const key = state.tasks.length === 0 ? "first" : state.logs.length === 0 ? "firstWeek" : "fresh";
    $("week-stats").innerHTML = `<li class="week-hello"><strong>${t("week." + key + "Title")}</strong><span>${t("week." + key + "Text")}</span></li>`;
    return;
  }
  $("week-rate").textContent = w.rate + "%";
  $("week-ring-label").textContent = t("week.success");
  $("week-stats").innerHTML = `
    <li style="--c: var(--green)"><strong>${w.done}/${w.planned}</strong> ${t("week.tasksDone")}</li>
    <li style="--c: var(--blue)"><strong>${w.activeDays}/${w.daysSoFar}</strong> ${t("week.activeDays")}</li>
    ${stats.streak ? `<li style="--c: var(--accent)"><strong>${stats.streak} 🔥</strong> ${t("week.streak")}</li>`
      : `<li style="--c: var(--accent)">${t("week.streakZero")}</li>`}
    <li style="--c: var(--violet)"><strong>🛡️</strong> ${jokerText()}</li>`;
}

// Le joker de la semaine : disponible, ou utilisé tel jour (+ les jokers bonus du mois, avec Premium)
function jokerText() {
  const week = stats.jokerUsedOn ? t("joker.used", { day: niceDate(stats.jokerUsedOn, { weekday: "long" }) }) : t("joker.available");
  return week + bonusText();
}
function bonusText() {
  if (!stats.bonusJokers) return "";
  return " · " + (stats.bonusLeft ? t("joker.bonus", { n: stats.bonusLeft }) : t("joker.bonusNone"));
}

// --- Mes catégories ---
const CATEGORY_ART = ["sport", "etudes", "religion", "finances", "voyages", "quotidien"]; // images/<nom>.jpg
function renderCategories() {
  $("categories").innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
    const count = state.goals.filter((g) => g.category === key).length;
    // L'illustration de la catégorie ("Autre" n'en a pas : une grande étincelle sur fond menthe)
    const art = CATEGORY_ART.includes(key);
    return `<a class="cat ${art ? "" : "no-art"}" href="#objectifs" data-cat="${key}" style="--c:${cat.color};${art ? ` --photo:url(images/${key}.jpg)` : ""}">
      <span class="cat-art">${art ? "" : `<i data-lucide="${cat.icon}"></i>`}</span>
      <span class="cat-foot">
        <span class="cat-icon"><i data-lucide="${cat.icon}"></i></span>
        <span><h4>${cat.label}</h4><p>${t("cats.count", { n: count })} <i data-lucide="chevron-right"></i></p></span>
      </span>
    </a>`;
  }).join("");
}

// --- Page Mes objectifs ---
function renderGoalsPage() {
  // Les compteurs des filtres comptent aussi les brouillons (ils sont sur cette page)
  const all = state.goals.concat(state.drafts);
  const chips = [["toutes", t("filter.all"), all.length]].concat(
    Object.entries(CATEGORIES).map(([key, cat]) => [key, `${catIcon(cat)}${cat.label}`, all.filter((g) => g.category === key).length])
  );
  $("goal-filters").innerHTML = chips
    .map(([key, label, count]) => `<button class="chip ${goalFilter === key ? "active" : ""}" data-filter="${key}">${label} <span class="muted">${count}</span></button>`)
    .join("");

  const goals = state.goals.filter((g) => goalFilter === "toutes" || g.category === goalFilter);
  // Les brouillons (objectifs pas finis de définir avec Buddy) : en haut, marqués "Incomplet"
  const drafts = state.drafts.filter((g) => goalFilter === "toutes" || g.category === goalFilter);
  const draftCards = drafts.map((g) => {
    const cat = catOf(g);
    return `<article class="card goal-card draft" style="--c:${cat.color}">
      <div class="goal-card-head">
        <span class="cat-pill"><i data-lucide="${cat.icon}"></i> ${cat.label}</span>
        <span class="draft-badge"><i data-lucide="hourglass-medium"></i> ${t("draft.badge")}</span>
      </div>
      <h3>${esc(g.text)}</h3>
      <p class="reason">${t("draft.hint")}</p>
      <div class="goal-actions">
        <button class="btn btn-primary" data-continue-draft="${g.id}"><i data-lucide="chat-circle"></i> ${t("draft.continue")}</button>
        <button class="btn btn-ghost" data-drop-draft="${g.id}"><i data-lucide="x"></i> ${t("draft.drop")}</button>
      </div>
    </article>`;
  }).join("");
  if (goals.length === 0 && drafts.length) {
    $("goal-grid").innerHTML = draftCards;
    return;
  }
  if (goals.length === 0) {
    const cat = CATEGORIES[goalFilter];
    $("goal-grid").innerHTML = `<div class="card empty">
      ${cat ? t("goals.emptyCat", { cat: cat.label }) : t("goals.empty")}
      ${t("goals.emptyHelp")}<br>
      <button class="btn btn-primary" data-new-goal="${cat ? goalFilter : ""}"><i data-lucide="plus"></i> ${t("goals.new")}</button>
      <button class="btn btn-ghost" data-talk-category="${cat ? goalFilter : ""}"><i data-lucide="message-circle"></i> ${t("goals.talkAbout")}</button>
    </div>`;
    return;
  }

  $("goal-grid").innerHTML = draftCards + goals.map((g) => {
    const cat = catOf(g);
    const tasks = activeTasks().filter((t) => t.goal_id === g.id);
    return `<article class="card goal-card" style="--c:${cat.color}">
      <div class="goal-card-head">
        <span class="cat-pill"><i data-lucide="${cat.icon}"></i> ${cat.label}</span>
        <button class="mini-btn" data-edit-goal="${g.id}" title="${t("common.edit")}"><i data-lucide="pencil"></i></button>
      </div>
      <h3>${esc(g.text)}</h3>
      ${g.reason ? `<p class="reason">${getLang() === "fr" ? `« ${esc(g.reason)} »` : `“${esc(g.reason)}”`}</p>` : ""}
      <div class="goal-meta">
        ${g.deadline ? `<span><i data-lucide="calendar"></i> ${niceDate(g.deadline, { day: "numeric", month: "long", year: "numeric" })}</span>` : ""}
        <span><i data-lucide="list-checks"></i> ${goalWeekText(g)}</span>
        ${g.plan ? `<span><i data-lucide="map"></i> ${t("goal.plan")}</span>` : ""}
      </div>
      ${(() => {
        const p = progressOf(g);
        // 0 % : une invitation à lancer l'objectif plutôt qu'un zéro
        const text = p.value ? t(p.auto ? "goal.autoText" : "goal.manualText", p) : t(p.auto ? "goal.zeroAuto" : "goal.zeroManual");
        return `<div><div class="bar"><div style="width:${p.value}%"></div></div><p class="muted small">${text}</p></div>`;
      })()}
      ${tasks.length ? `<ul class="goal-tasks">${tasks.map((task) =>
        `<li class="${isDoneToday(task) ? "done" : ""}"><button class="task-link" data-edit-task="${task.id}" title="${t("task.edit")}">
          <i data-lucide="${isDoneToday(task) ? "circle-check" : "circle"}"></i> ${esc(task.title)}
          <span class="task-when">· ${esc(scheduleLabel(task))}</span> <i class="pen" data-lucide="pencil"></i></button></li>`).join("")}</ul>` : ""}
      <div class="goal-actions">
        <button class="btn btn-primary" data-talk-goal="${g.id}"><i data-lucide="message-circle"></i> ${t("home.talk")}</button>
        <button class="btn btn-ghost" data-new-task="${g.id}"><i data-lucide="plus"></i> ${t("goal.taskBtn")}</button>
      </div>
    </article>`;
  }).join("");
}

// --- Page Calendrier ---
// Un mois entier (du lundi au dimanche), et le programme du jour choisi.
let calMonth = today().slice(0, 8) + "01"; // le 1er du mois affiché ("2026-09-01")
let calDay = today();                      // le jour choisi (son programme s'affiche à droite)

// Les tâches d'un jour, avec leur état : faite, pas faite (jour passé), à faire (aujourd'hui), prévue (futur)
function calTasks(key) {
  const now = today();
  if (key < addDays(now, -HISTORY_DAYS)) return []; // trop vieux : on ne garde pas l'historique
  const tasks = key >= now
    ? state.tasks.filter((task) => isCurrent(task, now) && occursOn(task, key)) // ce qui est prévu
    : state.tasks.filter((task) => isPlanned(task, key));                       // ce qui était prévu
  return tasks
    .map((task) => ({
      task,
      status: key > now ? "planned" : isDone(state.logs, task.id, key) ? "done" : key === now ? "todo" : "missed",
    }))
    .sort((a, b) => (a.task.time || "99").localeCompare(b.task.time || "99"));
}
const calDeadlines = (key) => state.goals.filter((g) => g.deadline === key);

function renderCalendar() {
  const now = today();
  $("cal-month").textContent = new Date(calMonth + "T12:00:00").toLocaleDateString(locale(), { month: "long", year: "numeric" });

  // Les cases : du lundi de la 1re semaine jusqu'au dimanche de la dernière
  const start = mondayOf(calMonth);
  const nextMonth = addDays(calMonth, 32).slice(0, 8) + "01";
  const cells = dayInitials().map((d) => `<span class="cal-head">${d}</span>`);
  for (let key = start; key < nextMonth || cells.length % 7 !== 0; key = addDays(key, 1)) {
    const items = calTasks(key);
    const flags = calDeadlines(key).length ? `<span title="${esc(calDeadlines(key).map((g) => g.text).join(", "))}">🎯</span>` : "";
    const cls = [key.slice(0, 7) !== calMonth.slice(0, 7) && "other", key === now && "today", key === calDay && "selected"].filter(Boolean).join(" ");
    // La couleur de la catégorie de l'objectif lié (gris si la tâche n'a pas d'objectif)
    const colorOf = ({ task }) => (goalById(task.goal_id) ? catOf(goalById(task.goal_id)).color : "var(--muted)");
    cells.push(`<button class="cal-cell ${cls}" data-cal-day="${key}">
      <span class="cal-num"><b>${Number(key.slice(8))}</b>${flags}</span>
      ${items.slice(0, 3).map((it) => `<span class="cal-item ${it.status}" style="--c:${colorOf(it)}" title="${esc((it.task.time ? it.task.time + " · " : "") + it.task.title)}">${esc(it.task.title)}</span>`).join("")}
      ${items.length > 3 ? `<span class="cal-more">${t("cal.more", { n: items.length - 3, s: items.length - 3 > 1 ? "s" : "" })}</span>` : ""}
      <span class="cal-dots">${items.map((it) => `<span class="${it.status}" style="--c:${colorOf(it)}"></span>`).join("")}</span>
    </button>`);
  }
  $("cal-grid").innerHTML = cells.join("");
  renderCalendarDay();
}

// Le programme du jour choisi
function renderCalendarDay() {
  const now = today();
  const items = calTasks(calDay);
  const deadlines = calDeadlines(calDay);
  const past = calDay < now;
  const done = items.filter((it) => it.status === "done").length;
  $("cal-day").innerHTML = `
    <h3>${esc(capitalize(niceDate(calDay)))}</h3>
    <p class="muted small">${items.length ? t("cal.summary", { n: items.length, done, past: calDay <= now }) : ""}</p>
    ${items.length ? `<ul class="cal-list">${items.map(({ task, status }) => {
      const goal = goalById(task.goal_id);
      // Une tâche encore active s'ouvre pour être modifiée ; les jours passés sont juste un souvenir
      const editable = !past && !task.archived_at;
      return `<li><button ${editable ? `data-edit-task="${task.id}"` : `class="cal-past" disabled`}>
        <span class="cal-time">${esc(task.time || "")}</span>
        ${goal ? `<span class="cat-dot" style="--c:${catOf(goal).color}"></span>` : ""}
        <span class="cal-title">${esc(task.title)}</span>
        <span class="cal-status ${status}">${t("cal." + status)}</span>
      </button></li>`;
    }).join("")}</ul>` : `<p class="empty">${calDay < addDays(now, -HISTORY_DAYS) ? t("cal.old") : t("cal.empty")}</p>`}
    ${deadlines.map((g) => `<div class="cal-deadline">${t("cal.deadline", { goal: esc(g.text) })}</div>`).join("")}
    ${past ? "" : `<button class="btn btn-ghost btn-full" data-cal-add="${calDay}" style="margin-top:14px"><i data-lucide="plus"></i> ${t("cal.addDay")}</button>`}`;
  drawIcons();
}

$("cal-grid").addEventListener("click", (e) => {
  const cell = e.target.closest("[data-cal-day]");
  if (!cell) return;
  calDay = cell.dataset.calDay;
  // Un jour d'un autre mois (grisé) : on passe à ce mois-là
  if (calDay.slice(0, 7) !== calMonth.slice(0, 7)) calMonth = calDay.slice(0, 8) + "01";
  renderCalendar();
  drawIcons();
  // Sur téléphone, le programme du jour est sous le calendrier : on descend jusqu'à lui
  if (innerWidth <= 1100) $("cal-day").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("cal-day").addEventListener("click", (e) => {
  const add = e.target.closest("[data-cal-add]");
  if (add) openTaskDialog(null, null, add.dataset.calAdd);
});
$("cal-prev").addEventListener("click", () => { calMonth = addDays(calMonth, -1).slice(0, 8) + "01"; renderCalendar(); drawIcons(); });
$("cal-next").addEventListener("click", () => { calMonth = addDays(calMonth, 32).slice(0, 8) + "01"; renderCalendar(); drawIcons(); });
$("cal-today").addEventListener("click", () => { calMonth = today().slice(0, 8) + "01"; calDay = today(); renderCalendar(); drawIcons(); });
// "Ajouter une tâche" en haut de la page : pour le jour choisi (ou aujourd'hui s'il est passé)
$("cal-add").addEventListener("click", () => openTaskDialog(null, null, calDay >= today() ? calDay : null));

// --- Page Suivi ---
function renderSuivi() {
  const w = stats.week;
  // Rien encore de coché (nouveau compte) : pas une rangée de zéros, une invitation à commencer
  $("stat-tiles").innerHTML = state.logs.length === 0
    ? `<div class="card stat-start">
        <div><strong>${t("suivi.firstTitle")}</strong><p class="muted">${t("suivi.firstText")}</p></div>
        <button class="btn btn-primary" data-new-task><i data-lucide="plus"></i> ${t("today.add")}</button>
      </div>`
    : [
      [`${w.done}/${w.planned}`, t("tile.tasksWeek")],
      // 0 % cette semaine (lundi matin, par exemple) : "ta semaine démarre" plutôt que 0 %
      w.done ? [`${w.rate}%`, t("tile.success")] : ["💪", t("tile.fresh")],
      [`${w.activeDays}/${w.daysSoFar}`, t("tile.activeDays")],
      stats.streak ? [`${stats.streak} 🔥`, t("tile.streak")] : ["🚀", t("tile.streakZero")],
      [`${stats.best}`, t("tile.best")],
      [t(stats.jokerUsedOn ? "tile.jokerUsed" : "tile.jokerFree"), `🛡️ ${t("tile.joker")}${stats.jokerUsedOn ? ", " + niceDate(stats.jokerUsedOn, { weekday: "long" }) : ""}${bonusText()}`],
    ].map(([value, label]) => `<div class="card stat-tile"><strong>${value}</strong><span>${label}</span></div>`).join("");

  // Les 7 derniers jours, tâche par tâche
  const last7 = [];
  for (let d = 6; d >= 0; d--) last7.push(addDays(today(), -d));
  const initials = last7.map((k) => niceDate(k, { weekday: "short" }).charAt(0).toUpperCase());
  const SYMBOL = { done: "✓", missed: "✗", todo: "·", none: "" };
  $("task-history").innerHTML = stats.perTask.length === 0
    ? `<p class="empty">${t("suivi.emptyTasks")}</p>`
    : `<div class="dots-legend">${initials.map((i) => `<span>${i}</span>`).join("")}</div>` +
      stats.perTask.map(({ task, days }) => {
        const goal = goalById(task.goal_id);
        return `<div class="task-row">
          <button class="task-row-title task-link" data-edit-task="${task.id}" title="${t("task.edit")}">${goal ? `<span class="cat-dot" style="--c:${catOf(goal).color}"></span>` : ""}<span>${esc(task.title)}</span> <i class="pen" data-lucide="pencil"></i></button>
          <div class="dots">${days.map((d) => `<span class="dot" data-status="${d.status}" title="${niceDate(d.key)}">${SYMBOL[d.status]}</span>`).join("")}</div>
        </div>`;
      }).join("");

  // Les 4 dernières semaines en carrés (du lundi au dimanche)
  const start = addDays(mondayOf(today()), -21);
  const cells = dayInitials().map((d) => `<span class="heat-head">${d}</span>`);
  for (let i = 0; i < 28; i++) {
    const key = addDays(start, i);
    const day = stats.history.find((h) => h.key === key);
    const rate = day && day.planned ? day.done / day.planned : 0;
    const level = rate === 0 ? 0 : rate < 0.5 ? 1 : rate < 1 ? 2 : 3;
    const cls = key === today() ? "today" : key > today() ? "future" : day?.status === "joker" ? "joker" : "";
    const tip = day ? `${niceDate(key)} : ${day.status === "rest" ? t("heat.rest") : `${day.done}/${day.planned}`}${day.status === "joker" ? t("heat.saved") : ""}` : niceDate(key);
    cells.push(`<span class="heat-cell ${cls}" data-level="${key > today() ? 0 : level}" title="${tip}"></span>`);
  }
  $("heatmap").innerHTML = cells.join("");

  $("week-list").innerHTML = stats.weeks.map((wk) => `<li>
    <span>${t("suivi.weekOf", { date: niceDate(wk.start, { day: "numeric", month: "short" }) })}</span>
    <div class="bar"><div style="width:${wk.rate}%"></div></div>
    <strong>${wk.planned ? wk.rate + "%" : "–"}</strong>
  </li>`).join("");

  $("goals-progress").innerHTML = state.goals.length === 0
    ? `<li class="empty">${t("goals.empty")}</li>`
    : state.goals.map(goalLine).join("");

  // Les badges : gagnés en couleur, les autres en gris avec la façon de les obtenir
  const earned = new Map(state.badges.map((b) => [b.badge_id, b.earned_at]));
  $("badge-count").textContent = `${earned.size}/${BADGES.length}`;
  $("badge-grid").innerHTML = BADGES.map((b) => `
    <div class="badge-item ${earned.has(b.id) ? "earned" : "locked"}" title="${esc(b.desc)}">
      <span class="badge-emoji">${b.emoji}</span>
      <strong>${esc(b.name)}</strong>
      <small>${earned.has(b.id) ? t("badge.earnedOn", { date: niceDate(dayKey(earned.get(b.id)), { day: "numeric", month: "short" }) }) : esc(b.desc)}</small>
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
  setBuddy("bravo", "saute", t("badge.newStatus"));
  setTimeout(() => showEmotion(currentEmotion, false), 3000);
}

// La phrase "Ton offre" : l'abonnement Stripe s'il y en a un, sinon gratuit / Premium (ou "phase de test" en mode démo)
function planText() {
  const p = state.profile;
  const date = (iso) => niceDate(dayKey(new Date(iso)), { day: "numeric", month: "long" });
  if (giftUntil(p)) return t("plan.gift", { date: date(giftUntil(p)) }); // Premium offert (testeurs)
  if (state.payments && p.plan === "premium") {
    if (p.cancelAtPeriodEnd && p.premiumUntil) return t("plan.ends", { date: date(p.premiumUntil) });
    if (p.subscriptionStatus === "trialing" && p.trialEndsAt) return t("plan.trial", { date: date(p.trialEndsAt) });
    if (p.subscriptionStatus === "past_due") return t("plan.pastDue");
    if (p.premiumUntil) return t("plan.renews", { date: date(p.premiumUntil) });
  }
  if (DEMO_MODE) return t("plan.demo");
  return t(hasPremium(p) ? "plan.premium" : "plan.free");
}

// --- Page Paramètres ---
function renderSettings() {
  if (document.activeElement !== $("settings-name")) $("settings-name").value = state.profile.firstName || "";
  for (const b of document.querySelectorAll("[data-style]")) {
    b.classList.toggle("active", b.dataset.style === state.profile.style);
  }
  // L'offre (Premium / gratuite), et l'abonnement s'il y en a un
  $("plan-status").textContent = planText();
  $("plan-manage").classList.toggle("hidden", !(state.payments && state.profile.billing));
  $("plan-open").classList.toggle("hidden", Boolean(state.payments && isSubscribed(state.profile)));
  setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

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
    $("email-with-push").checked = p.emailWithPush;
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
  if (event.target.confirm.value.trim().toUpperCase() !== t("delete.word")) {
    return ($("delete-error").textContent = t("delete.wrong", { word: t("delete.word") }));
  }
  const result = await api("DELETE", "/api/account");
  if (result.error) return ($("delete-error").textContent = result.error);
  $("delete-dialog").close();
  await logout();
  toast(t("toast.accountDeleted"));
});

// Enregistre les réglages des e-mails tels qu'ils sont affichés à l'écran
function saveEmailSettings() {
  const address = $("notify-email").value.trim();
  return api("PATCH", "/api/profile", {
    // Si c'est l'adresse du compte, on n'enregistre rien de spécial (elle suivra le compte)
    notifyEmail: address === session.user.email ? "" : address,
    emailMorning: $("email-morning").checked,
    morningTime: $("morning-time").value,
    emailEvening: $("email-evening").checked,
    eveningTime: $("evening-time").value,
    emailTasks: $("email-tasks").checked,
    emailWeekly: $("email-weekly").checked,
    emailWithPush: $("email-with-push").checked,
  });
}

$("save-emails").addEventListener("click", async () => {
  const result = await saveEmailSettings();
  if (result.error) return toast(result.error, "error");
  document.activeElement.blur();
  await refresh();
  toast(t("toast.emailsSaved"));
});

$("test-email").addEventListener("click", async () => {
  const button = $("test-email");
  const label = button.querySelector("span");
  button.disabled = true;
  label.textContent = t("settings.testWriting");
  // D'abord on enregistre ce qui est affiché (sinon le test partirait vers l'ancienne adresse)
  const saved = await saveEmailSettings();
  if (saved.error) {
    button.disabled = false;
    label.textContent = t("settings.testEmail");
    return toast(saved.error, "error");
  }
  const result = await api("POST", "/api/email/test", {});
  button.disabled = false;
  label.textContent = t("settings.testEmail");
  if (result.error) return toast(result.error, "error");
  toast(t("toast.emailSent", { to: result.to }));
});

$("save-name").addEventListener("click", async () => {
  await api("PATCH", "/api/profile", { firstName: $("settings-name").value });
  await refresh();
  toast(t("toast.nameSaved"));
});
for (const b of document.querySelectorAll("[data-style]")) {
  b.addEventListener("click", async () => {
    // Version gratuite (hors mode démo) : Militaire et Bienveillant sont Premium
    if (!styleAllowed(state.profile, b.dataset.style)) return showPremium("styles");
    const result = await api("PATCH", "/api/profile", { style: b.dataset.style });
    if (result.premium) return showPremium(result.premium);
    await refresh();
    toast(t("toast.styleSaved", { style: b.querySelector("strong").textContent }));
  });
}

// =============================================================
// LES CLICS DANS LA PAGE
// Un seul "écouteur" pour tous les boutons dessinés par render() :
// on regarde simplement quel bouton a été cliqué grâce à ses attributs data-…
// =============================================================
document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-check], [data-edit-task], [data-new-task], [data-edit-goal], [data-new-goal], [data-cat], [data-filter], [data-talk-goal], [data-talk-category], [data-review], [data-continue-draft], [data-drop-draft]");
  if (!el || !state) return;

  if (el.dataset.continueDraft) return continueDraft(Number(el.dataset.continueDraft));
  if (el.dataset.dropDraft) return dropDraft(Number(el.dataset.dropDraft));
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
    return sendToBuddy(cat ? t("say.goalIn", { cat: cat.label }) : t("say.newGoal"));
  }
});
$("add-task").addEventListener("click", () => openTaskDialog(null));

// Les objectifs "brouillons" : on reprend la discussion avec Buddy là où on s'était arrêtés…
const draftById = (id) => state?.drafts.find((g) => g.id === id);
function continueDraft(id) {
  const draft = draftById(id);
  if (!draft) return;
  removeChoices();
  currentTopic = draft.id; // Buddy sait qu'on parle de CE brouillon
  setChatTheme(null);
  renderTopic();
  openChat(true);
  sendToBuddy(t("say.continueDraft", { goal: draft.text }));
}
// … ou on l'abandonne (il est supprimé)
async function dropDraft(id) {
  const draft = draftById(id);
  if (!draft || !confirm(t("draft.confirmDrop", { goal: draft.text }))) return;
  const result = await api("DELETE", `/api/goals/${id}`);
  if (result.error) return toast(result.error, "error");
  if (currentTopic === id) { currentTopic = null; renderTopic(); }
  await refresh();
  toast(t("toast.draftDropped"));
}

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
    setBuddy(allDone ? "bravo" : "content", "saute", t(allDone ? "buddy.dayDone" : "buddy.nice"));
    setTimeout(() => showEmotion(currentEmotion, false), 2500);
  }

  // 3. On vérifie que l'enregistrement a marché, puis on recharge tout (suivi, objectifs, badges…).
  const result = await saving;
  if (result.error) toast(t("toast.checkFailed") + result.error, "error");
  await refresh();
}

// =============================================================
// LES FENÊTRES : OBJECTIF ET TÂCHE
// =============================================================
for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => {
    const dialog = button.closest("dialog");
    clearDialogDraft(dialog); // "Annuler" = on ne garde pas le brouillon
    dialog.close();
  });
}

// Les brouillons des fenêtres : "open" = la fenêtre qui était ouverte (pour la rouvrir après un rechargement),
// "goal-new" / "goal-12" / "task-new" / "task-7" = ce qu'on y avait tapé.
// Une fenêtre fermée par la personne (Enregistrer, Annuler, Supprimer, Échap) = brouillon effacé tout de suite.
// Un rechargement de la page, lui, ne passe par aucun de ces boutons : le brouillon reste.
const goalDraftName = () => "goal-" + (editingGoal?.id || "new");
const taskDraftName = () => "task-" + (editingTask?.id || "new");
// Efface le brouillon d'une fenêtre (appelé directement par Enregistrer / Annuler / Supprimer / Échap)
function clearDialogDraft(dialog) {
  if (dialog.id === "goal-dialog") clearDraft(goalDraftName());
  if (dialog.id === "task-dialog") clearDraft(taskDraftName());
  if (dialog.id === "goal-dialog" || dialog.id === "task-dialog") clearDraft("open");
}
for (const id of ["goal-dialog", "task-dialog"]) {
  $(id).addEventListener("cancel", () => clearDialogDraft($(id))); // touche Échap
}

function saveGoalDraft() {
  const form = $("goal-form");
  saveDraft(goalDraftName(), { text: form.text.value, reason: form.reason.value, deadline: form.deadline.value, progress: form.progress.value, category: pickedCategory });
}
function saveTaskDraft() {
  const form = $("task-form");
  saveDraft(taskDraftName(), {
    title: form.title.value, time: form.time.value, goalId: form.goalId.value, repeatMode, pickedDays, onDate: form.onDate.value,
    newGoalText: form.newGoalText.value, newGoalCategory: form.newGoalCategory.value,
  });
}
for (const type of ["input", "change"]) {
  $("goal-form").addEventListener(type, saveGoalDraft);
  $("task-form").addEventListener(type, saveTaskDraft);
}

// Après un rechargement : une fenêtre était ouverte avec quelque chose dedans ? On la rouvre telle quelle.
function reopenDraftDialog() {
  const open = readDraft("open");
  if (!open) return;
  if (open.type === "goal" && readDraft("goal-" + (open.id || "new"))) {
    const goal = open.id ? goalById(open.id) : null;
    if (!open.id || goal) openGoalDialog(goal);
  } else if (open.type === "task" && readDraft("task-" + (open.id || "new"))) {
    const task = open.id ? state.tasks.find((t) => t.id === open.id && !t.archived_at) : null;
    if (!open.id || task) openTaskDialog(task);
  }
}

// --- Objectif ---
let editingGoal = null;
let pickedCategory = "sport";

function drawCategoryPicker() {
  $("cat-picker").innerHTML = Object.entries(CATEGORIES)
    .map(([key, cat]) => `<button type="button" class="chip ${key === pickedCategory ? "active" : ""}" data-pick="${key}">${catIcon(cat)}${cat.label}</button>`)
    .join("");
  drawIcons();
}
$("cat-picker").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-pick]");
  if (chip) { pickedCategory = chip.dataset.pick; drawCategoryPicker(); saveGoalDraft(); }
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
  if (p?.auto) $("progress-auto").textContent = t("goal.autoInfo", p);
  // Un brouillon attendait (page rechargée pendant qu'on écrivait) : on le remet
  const draft = readDraft(goalDraftName());
  if (draft) {
    form.text.value = draft.text || "";
    form.reason.value = draft.reason || "";
    form.deadline.value = draft.deadline || "";
    form.progress.value = draft.progress || 0;
    $("progress-value").textContent = form.progress.value;
    if (draft.category in CATEGORIES) pickedCategory = draft.category;
  }
  $("goal-dialog-title").textContent = t(goal ? "goal.edit" : "goals.new");
  $("goal-delete").classList.toggle("hidden", !goal);
  $("goal-error").textContent = "";
  drawCategoryPicker();
  $("goal-dialog").showModal();
  saveDraft("open", { type: "goal", id: goal?.id || null });
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
  clearDialogDraft($("goal-dialog")); // enregistré : le brouillon peut partir
  $("goal-dialog").close();
  await refresh();
  const id = editingGoal ? editingGoal.id : result.id;
  flash(`[data-edit-goal="${id}"]`);
  toast(t(editingGoal ? "toast.goalUpdated" : "toast.goalSaved"));
  if (!editingGoal) buddyThumbsUp(t("buddy.newGoal"));
});

$("goal-delete").addEventListener("click", async () => {
  if (!confirm(t("goal.confirmDelete", { goal: editingGoal.text }))) return;
  await api("DELETE", `/api/goals/${editingGoal.id}`);
  clearDialogDraft($("goal-dialog"));
  $("goal-dialog").close();
  await refresh();
  toast(t("toast.goalDeleted"));
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
  if (b) { repeatMode = b.dataset.repeat; drawRepeat(); saveTaskDraft(); }
});
$("day-picker").addEventListener("click", (e) => {
  const b = e.target.closest("[data-day]");
  if (!b) return;
  const day = Number(b.dataset.day);
  pickedDays = pickedDays.includes(day) ? pickedDays.filter((d) => d !== day) : [...pickedDays, day];
  drawRepeat();
  saveTaskDraft();
});

// "Objectif lié" : "＋ Nouvel objectif…" fait apparaître son nom et sa catégorie
function drawNewGoal() {
  const on = $("task-goal-select").value === "new";
  $("task-new-goal").classList.toggle("hidden", !on);
  return on;
}
$("task-goal-select").addEventListener("change", () => {
  if (drawNewGoal()) $("task-form").newGoalText.focus();
});

// onDate : une nouvelle tâche pour un jour précis (depuis le calendrier)
function openTaskDialog(task, goalId = null, onDate = null) {
  editingTask = task;
  // "Maximum N tâches par jour" : la limite de CETTE personne (5 en gratuit hors mode démo)
  $("task-dialog").querySelector('[data-i18n="task.hint"]').textContent = t("task.hint", { max: taskLimitFor(state.profile) });
  const form = $("task-form");
  form.reset();
  $("task-goal-select").innerHTML = `<option value="">${t("task.noGoal")}</option>` +
    state.goals.map((g) => `<option value="${g.id}">${esc(g.text)}</option>`).join("") +
    `<option value="new">＋ ${t("task.newGoalOption")}</option>`;
  // Les catégories du nouvel objectif (toutes, "Autre" comprise)
  $("task-new-goal-cat").innerHTML = Object.entries(CATEGORIES)
    .map(([key, c]) => `<option value="${key}">${esc(c.label)}</option>`).join("");
  form.title.value = task?.title || "";
  form.time.value = task?.time || "";
  form.goalId.value = String(task?.goal_id || goalId || "");
  form.newGoalCategory.value = "autre";
  // Le "Quand ?" de la tâche (ou "tous les jours" pour une nouvelle)
  repeatMode = task?.on_date || onDate ? "date" : task?.days?.length ? "days" : "daily";
  pickedDays = task?.days ? [...task.days] : [];
  form.onDate.value = task?.on_date || onDate || today();
  form.onDate.min = today();
  // Un brouillon attendait (page rechargée pendant qu'on écrivait) : on le remet
  // (sauf le jour, si on vient de choisir un jour précis dans le calendrier)
  const draft = readDraft(taskDraftName());
  if (draft) {
    form.title.value = draft.title || "";
    form.time.value = draft.time || "";
    if ([...form.goalId.options].some((o) => o.value === draft.goalId)) form.goalId.value = draft.goalId;
    form.newGoalText.value = draft.newGoalText || "";
    if (draft.newGoalCategory in CATEGORIES) form.newGoalCategory.value = draft.newGoalCategory;
    if (!onDate) {
      repeatMode = ["daily", "days", "date"].includes(draft.repeatMode) ? draft.repeatMode : repeatMode;
      pickedDays = Array.isArray(draft.pickedDays) ? draft.pickedDays : pickedDays;
      if (draft.onDate && draft.onDate >= today()) form.onDate.value = draft.onDate;
    }
  }
  drawRepeat();
  drawNewGoal();
  $("task-dialog-title").textContent = t(task ? "task.edit" : "task.new");
  $("task-delete").classList.toggle("hidden", !task);
  $("task-error").textContent = "";
  $("task-dialog").showModal();
  saveDraft("open", { type: "task", id: task?.id || null });
}

$("task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (repeatMode === "days" && pickedDays.length === 0) return ($("task-error").textContent = t("task.pickDay"));
  // "＋ Nouvel objectif…" : on crée d'abord l'objectif, puis la tâche liée à lui
  let goalId = Number(form.goalId.value) || null;
  if (form.goalId.value === "new") {
    if (!form.newGoalText.value.trim()) {
      form.newGoalText.focus();
      return ($("task-error").textContent = t("task.newGoalMissing"));
    }
    const created = await api("POST", "/api/goals", { text: form.newGoalText.value, category: form.newGoalCategory.value });
    if (created.error) return ($("task-error").textContent = created.error);
    goalId = created.id;
    // Déjà créé : on le sélectionne dans la liste (si la tâche échoue, on ne le recrée pas une 2e fois)
    const cat = CATEGORIES[form.newGoalCategory.value];
    form.goalId.querySelector('[value="new"]').before(new Option(form.newGoalText.value.trim(), String(goalId)));
    form.goalId.value = String(goalId);
    form.newGoalText.value = "";
    drawNewGoal();
  }
  const body = {
    title: form.title.value,
    time: form.time.value,
    goalId,
    days: repeatMode === "days" ? pickedDays : [],
    onDate: repeatMode === "date" ? form.onDate.value : null,
  };
  const result = editingTask
    ? await api("PATCH", `/api/tasks/${editingTask.id}`, body)
    : await api("POST", "/api/tasks", body);
  if (result.premium) showPremium(result.premium); // limite gratuite atteinte (jamais en mode démo)
  if (result.error) return ($("task-error").textContent = result.error);
  clearDialogDraft($("task-dialog")); // enregistré : le brouillon peut partir
  $("task-dialog").close();
  await refresh();
  const id = editingTask ? editingTask.id : result.id;
  flash(`[data-edit-task="${id}"]`);
  const when = scheduleLabel({ days: repeatMode === "days" ? pickedDays : [], on_date: body.onDate });
  toast(editingTask ? t("toast.taskUpdated") : t("toast.taskAdded", { when: getLang() === "fr" ? when.toLowerCase() : when }));
  if (!editingTask) buddyThumbsUp(t("buddy.noted"));
  // Une tâche avec une heure : c'est LE bon moment pour proposer les notifications
  if (!editingTask && body.time) setTimeout(() => askPushForTask(body).catch(console.error), 900);
});

$("task-delete").addEventListener("click", async () => {
  if (!confirm(t("task.confirmDelete", { task: editingTask.title }))) return;
  await api("DELETE", `/api/tasks/${editingTask.id}`);
  clearDialogDraft($("task-dialog"));
  $("task-dialog").close();
  await refresh();
  toast(t("toast.taskDeleted"));
});

// =============================================================
// LE BONHOMME BUDDY ET SES ÉMOTIONS
// =============================================================
// Chaque émotion choisie par Buddy = une pose (image dans le dossier buddy/), un petit mouvement
// et une phrase (dans i18n.js : "emo.xxx"). Buddy (Claude) choisit l'émotion à chaque réponse.
const EMOTIONS = {
  neutral:       { pose: "repos",      mouvement: "" },
  happy:         { pose: "content",    mouvement: "pop" },
  celebrating:   { pose: "bravo",      mouvement: "saute" },
  understanding: { pose: "idee",       mouvement: "pop" },
  strict:        { pose: "fache",      mouvement: "pop" },
  motivational:  { pose: "fier",       mouvement: "pop" },
  hello:         { pose: "salut",      mouvement: "pop" },
  empathy:       { pose: "compassion", mouvement: "" },
  encouraging:   { pose: "encourage",  mouvement: "pop" },
  worried:       { pose: "inquiet",    mouvement: "" },
  proud:         { pose: "fier",       mouvement: "saute" },
  impressed:     { pose: "bravo",      mouvement: "pop" },
  laughing:      { pose: "content",    mouvement: "pop" },
};

// -------------------------------------------------------------
// LES SCÈNES : Buddy s'adapte au sujet de la discussion (il court pour le sport, il prie sur son tapis,
// il travaille sur son ordinateur…). Une seule image par scène : elle remplace les émotions "calmes".
// Une vraie joie, un recadrage, une idée ou un moment sensible gardent leur propre expression.
// (Les noms "outfit / tenue" viennent de l'ancien personnage, qui changeait de vêtements.)
// -------------------------------------------------------------
const OUTFITS = {
  sport: "scene-sport",
  etudiant: "scene-etudes",
  voyageur: "scene-voyages",
  qamis: "scene-priere",
  costume: "scene-finances",
  quotidien: "scene-quotidien",
};
const SCENE_POSES = ["repos", "content", "ecoute", "salut", "fier"];

// La scène qui a du sens MAINTENANT (null = Buddy normal) :
//   1. le THÈME de la conversation, choisi par Buddy à chaque réponse (Sport → sport, Études → études,
//      Voyages → voyage, Islam → prière, Finances → finances). Quand on change de sujet,
//      Buddy répond "aucun" et redevient normal ;
//   2. avant sa première réponse sur un objectif choisi (bouton "parler de…") → la scène de la catégorie de l'objectif ;
//   3. sinon → Buddy normal.
const ISLAM_WORDS = /islam|musulman|muslim|pri[èe]re|salat|salah|coran|quran|qur'?an|ramadan|mosqu|allah|hadith|dhikr|sunna|jumu|fajr|du'?a\b|douaa?|invocation|tarawih|hajj|omra|umrah|zakat|sourate|surah/i;
const CATEGORY_OUTFIT = { sport: "sport", etudes: "etudiant", voyages: "voyageur", finances: "costume", quotidien: "quotidien" };
const THEME_OUTFIT = { sport: "sport", etudes: "etudiant", voyages: "voyageur", islam: "qamis", finances: "costume" };
const THEME_TIMEOUT = 10 * 60 * 1000; // sans nouveau message pendant 10 min, il se rhabille normalement tout seul

let chatTheme = null; // le thème de la conversation (null = pas encore connu)
let themeTimer = null;

function setChatTheme(theme) {
  chatTheme = theme || null;
  clearTimeout(themeTimer);
  if (chatTheme && chatTheme !== "aucun") {
    themeTimer = setTimeout(() => {
      chatTheme = "aucun";
      if (state) showEmotion(currentEmotion, false);
    }, THEME_TIMEOUT);
  }
}

function currentOutfit() {
  if (!state) return null;
  let outfit = null;
  if (chatTheme) {
    outfit = THEME_OUTFIT[chatTheme];
  } else {
    const goal = currentTopic && goalById(currentTopic);
    if (goal) outfit = goal.category === "religion"
      ? (ISLAM_WORDS.test(`${goal.text} ${goal.reason || ""}`) ? "qamis" : null)
      : CATEGORY_OUTFIT[goal.category];
  }
  return outfit && OUTFITS[outfit] ? outfit : null;
}

// Le nom de l'image à afficher pour une pose, dans la scène du moment
function poseFile(pose) {
  const scene = OUTFITS[currentOutfit()];
  return scene && SCENE_POSES.includes(pose) ? scene : pose;
}

// On précharge les images (petites : ~35 Ko), pour qu'il n'y ait pas de "blanc" quand il change de pose.
const preloaded = new Set();
function preload(files) {
  for (const f of files) if (!preloaded.has(f)) { preloaded.add(f); new Image().src = "buddy/" + f + ".webp"; }
}
preload(Object.values(EMOTIONS).map((e) => e.pose).concat(["ecoute", "reflechit"]));

let currentEmotion = "motivational"; // l'émotion "de fond", gardée jusqu'à la prochaine réponse
let shownOutfit = null;              // la tenue affichée en ce moment

// Change la pose, le mouvement et la petite phrase de Buddy (bannière, discussion, bulle flottante)
function setBuddy(pose, mouvement, status) {
  const outfit = currentOutfit();
  if (outfit) preload([OUTFITS[outfit]]);
  const file = poseFile(pose);
  const img = $("buddy-img");
  const src = "buddy/" + file + ".webp";
  $("buddy-status").textContent = status;
  // Il vient de changer de tenue : petit effet magique ✨ (plutôt que le mouvement habituel)
  const outfitNow = OUTFITS[outfit] && file !== pose ? outfit : null;
  const changed = outfitNow !== shownOutfit;
  shownOutfit = outfitNow;
  crossfade(img, src, () => {
    img.className = "buddy-img";
    void img.offsetWidth; // petite astuce pour pouvoir rejouer la même animation
    if (changed) {
      img.classList.add("tenue");
      const poof = $("tenue-poof");
      poof.classList.remove("go");
      void poof.offsetWidth;
      poof.classList.add("go");
    } else if (mouvement) {
      img.classList.add(mouvement);
    }
  });
}

// Changement de pose en "fondu enchaîné" : la nouvelle pose apparaît vite, pendant que l'ancienne
// s'efface doucement par-dessus. Buddy est cadré au même endroit sur toutes les images :
// on a l'impression qu'il bouge vraiment, sans "saut" d'une image à l'autre.
let fadeToken = 0;
function crossfade(img, src, then) {
  const token = ++fadeToken;
  const next = new Image();
  next.src = src;
  // On attend que la nouvelle image soit prête (sinon Buddy disparaîtrait un instant)
  Promise.resolve(next.decode ? next.decode() : null).catch(() => {}).then(() => {
    if (token !== fadeToken) return; // une autre pose a été demandée entre-temps
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (img.getAttribute("src") !== src && !calm) {
      document.querySelectorAll(".buddy-ghost").forEach((g) => g.remove());
      const ghost = img.cloneNode();
      ghost.removeAttribute("id");
      ghost.className = "buddy-img buddy-ghost";
      ghost.style.transform = getComputedStyle(img).transform; // figée exactement où elle était
      img.after(ghost);
      requestAnimationFrame(() => requestAnimationFrame(() => (ghost.style.opacity = "0")));
      setTimeout(() => ghost.remove(), 700);
      img.style.transition = "none";
      img.style.opacity = "0";
      void img.offsetWidth;
      img.style.transition = "";
      img.style.opacity = "";
    }
    img.src = src;
    then();
  });
}

// Affiche une émotion (et la retient comme émotion "de fond")
function showEmotion(emotion, animate = true) {
  currentEmotion = emotion in EMOTIONS ? emotion : "neutral";
  const e = EMOTIONS[currentEmotion];
  setBuddy(e.pose, animate ? e.mouvement : "", t("emo." + currentEmotion));
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
  const rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: "auto" });
  if (minutes < 1) return t("time.now");
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
    $("resume-title").textContent = t("resume.startTitle");
    $("resume-quote").textContent = t("resume.startQuote");
    $("resume-reply").textContent = "";
    $("resume-when").textContent = "";
    $("resume-btn").textContent = t("resume.talk");
    return;
  }
  const said = messages[index];
  const reply = messages.slice(index + 1).find((m) => m.role === "assistant");
  $("resume-title").textContent = t("resume.title");
  $("resume-quote").textContent = t("resume.said", { text: cleanText(said.content, 90) });
  $("resume-reply").textContent = reply ? t("resume.reply", { text: cleanText(reply.content, 80) }) : "";
  $("resume-when").textContent = timeAgo(said.created_at);
  $("resume-btn").textContent = t("resume.btn");
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
// "On reprend où on s'était arrêtés ?" : toute la carte rouvre la discussion EN ENTIER (y compris la précédente)
$("resume-card").addEventListener("click", () => { renderChatHistory(true); openChat(true); });
$("buddy-fab").addEventListener("click", () => openChat());
$("close-chat").addEventListener("click", closeChat);
$("drawer-backdrop").addEventListener("click", closeChat);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); });

// --- LES CONVERSATIONS ---
// "Nouvelle conversation" repart sur un écran vide, comme ChatGPT. Les anciens messages restent enregistrés
// (Buddy s'en souvient) et le bouton "Voir la conversation précédente" les réaffiche.
const CHAT_START_KEY = "buddy-chat-start";
let chatStart = (() => { try { return localStorage.getItem(CHAT_START_KEY); } catch (e) { return null; } })();
function renderChatHistory(showAll = false) {
  chat.innerHTML = "";
  const older = chatStart ? state.messages.filter((m) => m.created_at < chatStart) : [];
  const shown = showAll ? state.messages : state.messages.filter((m) => !chatStart || m.created_at >= chatStart);
  if (!showAll && older.length) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-previous";
    button.innerHTML = `<i data-lucide="clock-counter-clockwise"></i> ${t("chat.previous")}`;
    button.addEventListener("click", () => { renderChatHistory(true); chat.scrollTop = 0; });
    chat.appendChild(button);
    drawIcons();
  }
  for (const m of shown) showMessage(m.content, m.role === "user" ? "user" : "buddy");
}
function startFreshChat() {
  if (!state?.messages.length) return; // rien à cacher
  chatStart = new Date().toISOString();
  try { localStorage.setItem(CHAT_START_KEY, chatStart); } catch (e) {}
  renderChatHistory();
}

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
  startFreshChat(); // on repart sur un écran vide (l'ancienne discussion reste accessible)
  const name = state.profile.firstName ? " " + state.profile.firstName : "";
  showMessage(t("topics.ask", { name }), "buddy");
  const box = document.createElement("div");
  box.className = "choices";
  box.innerHTML = state.goals.length
    ? state.goals.slice(0, 6).map((g) => `<button class="chip" data-topic="${g.id}">${catIcon(catOf(g))}${esc(g.text)}</button>`).join("") +
      `<button class="chip" data-topic="review"><i data-lucide="compass" class="chip-ico"></i>${t("topics.review")}</button>` +
      `<button class="chip" data-topic="new"><i data-lucide="plus" class="chip-ico"></i>${t("topics.new")}</button>`
    : Object.entries(CATEGORIES).map(([key, cat]) => `<button class="chip" data-topic-cat="${key}">${catIcon(cat)}${cat.label}</button>`).join("");
  $("chat").appendChild(box);
  drawIcons();
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
  if (chip.dataset.topic === "new") return sendToBuddy(t("say.newGoal"));
  if (chip.dataset.topicCat) return sendToBuddy(t("say.goalIn", { cat: CATEGORIES[chip.dataset.topicCat].label }));
  talkAbout(goalById(Number(chip.dataset.topic)));
});

// Le bilan de la semaine avec Buddy
function startReview() {
  removeChoices();
  currentTopic = null;
  renderTopic();
  openChat(true);
  sendToBuddy(t("say.review"), { review: true });
}

// Parler d'un objectif précis
function talkAbout(goal) {
  if (!goal) return;
  removeChoices();
  currentTopic = goal.id;
  setChatTheme(null); // la tenue de l'objectif, tout de suite, en attendant la réponse de Buddy
  renderTopic();
  openChat(true);
  sendToBuddy(t("say.talkGoal", { goal: goal.text }));
}

$("new-topic").addEventListener("click", () => {
  currentTopic = null;
  renderTopic();
  offerTopics();
});

function renderTopic() {
  const goal = currentTopic && state && (goalById(currentTopic) || draftById(currentTopic));
  $("topic-chip").classList.toggle("hidden", !goal);
  if (goal) { $("topic-text").innerHTML = catIcon(catOf(goal)) + esc(goal.text); drawIcons(); }
  // Le sujet (ou le style de coaching) a changé → Buddy change de tenue si besoin
  const outfit = OUTFITS[currentOutfit()] ? currentOutfit() : null;
  if (state && outfit !== shownOutfit) showEmotion(currentEmotion, false);
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
  saveDraft("chat", $("message").value); // brouillon : rien n'est perdu si la page se recharge
  if (!listening && $("message").value.trim() && !sendButton.disabled) {
    listening = true;
    setBuddy("ecoute", "", t("buddy.listening"));
  }
});

// Envoie un message à Buddy (ou rien du tout : Buddy parle alors en premier).
// extra : des informations en plus pour le serveur (ex : { review: true } pour le bilan de la semaine)
// typed = true : le texte vient du champ de saisie (son brouillon s'efface seulement si Buddy a bien reçu le message)
async function sendToBuddy(text, extra = {}, typed = false) {
  if (text) showMessage(text, "user");
  // Le message n'est pas parti (erreur) : on le remet dans le champ pour pouvoir réessayer, rien n'est perdu
  const giveBack = () => { if (typed && !$("message").value) { $("message").value = text; saveDraft("chat", text); } };
  listening = false;
  sendButton.disabled = true;
  setBuddy("reflechit", "reflechit", t("buddy.thinking"));
  const typing = showTyping();

  try {
    const data = await api("POST", "/api/chat", { message: text, goalId: currentTopic, ...extra });
    typing.remove();
    if (data.error) {
      showMessage(data.error, "error");
      if (data.premium) showPremium(data.premium); // limite gratuite atteinte (jamais en mode démo)
      showEmotion(currentEmotion, false);
      giveBack();
    } else {
      if (typed && !$("message").value) clearDraft("chat"); // bien reçu : le brouillon peut partir
      showMessage(data.reply, "buddy");
      // L'objectif et le thème dont on parle (d'abord : ce sont eux qui décident de la tenue de Buddy)
      if (data.goalId) currentTopic = data.goalId;
      setChatTheme(data.theme);
      showEmotion(data.emotion); // Buddy prend l'expression qu'il a choisie
      // Buddy a peut-être créé un objectif, noté un plan, un prénom… ou AGI (tâches) : on recharge tout
      refresh()
        .then(() => { if (data.acted) toast(t("toast.buddyActed")); })
        .catch((e) => console.error("Rechargement impossible :", e));
    }
  } catch (e) {
    typing.remove();
    showMessage(t("chat.unreachable"), "error");
    showEmotion(currentEmotion, false);
    giveBack();
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
  sendToBuddy(text, {}, true);
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
  $("focus-start").querySelector("span").textContent = t(focusTimer ? "focus.pause" : focusSeconds < focusLength ? "focus.resume" : "focus.start");
  document.title = focusTimer ? `${m}:${s} – Focus` : t("page.title");
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
      setBuddy("bravo", "saute", t("focus.over"));
      setTimeout(() => showEmotion(currentEmotion, false), 3000);
      alert(t("focus.overAlert"));
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
// LA VISITE GUIDÉE
// À la toute première connexion (ou avec "Revoir la visite guidée" dans Paramètres).
// Chaque étape : la zone à éclairer (target), la page où elle se trouve, et la pose de Buddy.
// Les textes sont dans i18n.js : "tour.<key>.title" et "tour.<key>.text".
// Pour ajouter une étape : une ligne ici + ses 2 textes dans i18n.js.
// =============================================================
const TOUR = [
  // Buddy reste discret : il "chille" à chaque étape (relax), dit bonjour au début et se réjouit à la fin
  { key: "welcome",  page: "accueil",    pose: "salut" },
  { key: "goals",    page: "accueil",    target: ".goals-card", pose: "relax" },
  { key: "today",    page: "accueil",    target: ".today-card", pose: "relax" },
  { key: "cats",     page: "accueil",    target: ".cats-card", pose: "relax" },
  { key: "week",     page: "accueil",    target: ".week-card", pose: "relax" },
  { key: "calendar", page: "accueil",    target: '.side-link[data-page="calendrier"]', fixed: true, pose: "relax" },
  { key: "chat",     page: "accueil",    target: "#buddy-fab", round: true, fixed: true, pose: "relax" },
  { key: "settings", page: "accueil",    target: '.side-link[data-page="parametres"]', fixed: true, pose: "relax" },
  { key: "emails",   page: "parametres", target: "#email-settings .toggles", pose: "relax" },
  { key: "end",      page: "accueil",    pose: "bravo" },
];
let tourIndex = -1;     // l'étape affichée (-1 = pas de visite en cours)
let tourAfter = null;   // ce qu'on fait à la fin de la visite

const tourSeen = () => { try { return localStorage.getItem("buddy-tour-done") === "1"; } catch (e) { return false; } };

function startTour(after = null) {
  tourAfter = after;
  closeChat();
  $("user-dropdown").classList.add("hidden");
  $("tour").classList.remove("hidden");
  showTourStep(0);
}

function endTour() {
  $("tour").classList.add("hidden");
  tourIndex = -1;
  try { localStorage.setItem("buddy-tour-done", "1"); } catch (e) {}
  goToPage("accueil");
  const after = tourAfter;
  tourAfter = null;
  if (after) after();
}

// Va sur une page de l'appli sans "retour en haut" automatique au mauvais moment
function goToPage(page) {
  if (location.hash === "#" + page) return;
  history.replaceState(null, "", "#" + page);
  showPage();
}

function showTourStep(i) {
  tourIndex = i;
  const step = TOUR[i];
  const last = TOUR.length - 1;
  goToPage(step.page);

  $("tour-step").textContent = t("tour.step", { n: i + 1, total: TOUR.length });
  $("tour-title").textContent = t(`tour.${step.key}.title`);
  $("tour-text").textContent = t(`tour.${step.key}.text`);
  $("tour-avatar").src = "buddy/" + (step.pose || "content") + ".webp";
  $("tour-prev").classList.toggle("hidden", i === 0);
  $("tour-skip").classList.toggle("hidden", i === last);
  $("tour-next").textContent = t(i === 0 ? "tour.start" : i === last ? "tour.finish" : "tour.next");
  $("tour-dots").innerHTML = TOUR.map((_, n) => `<span class="${n === i ? "on" : ""}"></span>`).join("");

  // Petite animation de la bulle à chaque étape
  const bubble = $("tour-bubble");
  bubble.classList.remove("pop");
  void bubble.offsetWidth;
  bubble.classList.add("pop");

  // On fait défiler la page pour mettre la zone expliquée en haut de l'écran (la bulle se met en dessous),
  // puis on place le spot et la bulle. (Pas besoin pour ce qui ne bouge pas : bulle de Buddy, menu.)
  const target = step.target && document.querySelector(step.target);
  if (target && !step.fixed) {
    window.scrollBy({ top: target.getBoundingClientRect().top - (innerWidth <= 900 ? 76 : 90), behavior: "smooth" });
  }
  placeTour();
  setTimeout(placeTour, 450); // une fois le défilement terminé
  $("tour-next").focus({ preventScroll: true });
}

// Place le spot sur la zone, et la bulle juste en dessous (ou au-dessus s'il n'y a pas la place)
function placeTour() {
  if (tourIndex < 0) return;
  const step = TOUR[tourIndex];
  const target = step.target && document.querySelector(step.target);
  const spot = $("tour-spot");
  const bubble = $("tour-bubble");
  const margin = 16;
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  const visible = target && target.getClientRects().length > 0;
  $("tour").classList.toggle("no-target", !visible);

  if (!visible) {
    // Pas de zone à montrer (bienvenue, fin) : la bulle au milieu de l'écran
    bubble.style.left = (innerWidth - bw) / 2 + "px";
    bubble.style.top = Math.max(margin, (innerHeight - bh) / 2) + "px";
    return;
  }

  const r = target.getBoundingClientRect();
  const pad = 8; // le spot déborde un peu autour de la zone
  Object.assign(spot.style, {
    left: r.left - pad + "px", top: r.top - pad + "px",
    width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px",
    borderRadius: step.round ? "50%" : "18px",
  });

  const gap = pad + 12;
  let top;
  if (r.bottom + gap + bh <= innerHeight - margin) top = r.bottom + gap;   // en dessous
  else if (r.top - gap - bh >= margin) top = r.top - gap - bh;             // au-dessus
  // Pas assez de place ni en dessous ni au-dessus : du côté où il y a le plus de place (ça déborde un peu sur la zone)
  else top = r.top > innerHeight - r.bottom ? margin : innerHeight - bh - margin;
  const left = Math.min(Math.max(margin, r.left + r.width / 2 - bw / 2), innerWidth - bw - margin);
  bubble.style.top = top + "px";
  bubble.style.left = left + "px";
}

$("tour-next").addEventListener("click", () => (tourIndex < TOUR.length - 1 ? showTourStep(tourIndex + 1) : endTour()));
$("tour-prev").addEventListener("click", () => tourIndex > 0 && showTourStep(tourIndex - 1));
$("tour-skip").addEventListener("click", endTour);
$("replay-tour").addEventListener("click", () => startTour());
window.addEventListener("resize", placeTour);
window.addEventListener("scroll", placeTour, true);
// Au clavier : → ou Entrée = suivant, ← = retour, Échap = passer
document.addEventListener("keydown", (e) => {
  if (tourIndex < 0) return;
  if (e.key === "ArrowRight") $("tour-next").click();
  else if (e.key === "ArrowLeft") $("tour-prev").click();
  else if (e.key === "Escape") endTour();
});

// =============================================================
// LES NOTIFICATIONS DU TÉLÉPHONE
// Le "facteur" (sw.js) est installé dans le navigateur ; quand la personne touche "Activer",
// le téléphone demande la permission, puis nous donne une "adresse" qu'on range sur le serveur.
// Sur iPhone : ça ne marche que si Buddy est installé sur l'écran d'accueil (on explique comment).
// =============================================================
const PUSH_OK = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const IS_INSTALLED = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const swReady = "serviceWorker" in navigator
  ? navigator.serviceWorker.register("/sw.js").catch((e) => { console.error("Facteur (service worker) :", e); return null; })
  : Promise.resolve(null);

// Android / ordinateur : le navigateur peut proposer "Installer Buddy" comme une appli
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  renderPush().catch(console.error);
});

// La clé publique arrive en "base64" : le navigateur la veut en octets
function base64ToBytes(b64) {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function currentSubscription() {
  const reg = await swReady;
  return reg ? reg.pushManager.getSubscription() : null;
}

// L'état des notifications sur CET appareil
async function pushStatus() {
  if (IS_IOS && !IS_INSTALLED) return "ios";          // iPhone : il faut d'abord installer Buddy
  if (!PUSH_OK || !config.vapidPublicKey) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && (await currentSubscription()) ? "on" : "off";
}

async function enablePush() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      await renderPush();
      return toast(t(permission === "denied" ? "push.deniedToast" : "push.notNow"), "error");
    }
    const reg = await swReady;
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(config.vapidPublicKey) }));
    const result = await api("POST", "/api/push/subscribe", { subscription: sub.toJSON() });
    if (result.error) return toast(result.error, "error");
    toast(t("push.enabledToast"));
  } catch (e) {
    console.error("Notifications :", e);
    toast(t("push.error"), "error");
  }
  await renderPush();
}

async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await api("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  toast(t("push.disabledToast"));
  await renderPush();
}

async function testPush() {
  const result = await api("POST", "/api/push/test", {});
  toast(result.error || t("push.testSent"), result.error ? "error" : "ok");
}

async function installApp() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  await renderPush();
}

// La bannière fermée revient au bout de 5 jours (on ne harcèle pas, mais on n'abandonne pas non plus)
const pushBannerClosed = () => {
  try { return Date.now() - Number(localStorage.getItem("buddy-push-banner-closed") || 0) < 5 * 24 * 3600 * 1000; } catch (e) { return false; }
};

// Demander AU BON MOMENT : juste après avoir créé une tâche avec une heure
// ("Je te préviens 5 minutes avant ?"). Au maximum une fois par jour.
async function askPushForTask(task) {
  const status = await pushStatus();
  if (status !== "off" && status !== "ios") return;
  try {
    if (Date.now() - Number(localStorage.getItem("buddy-push-asked") || 0) < 24 * 3600 * 1000) return;
    localStorage.setItem("buddy-push-asked", String(Date.now()));
  } catch (e) {}
  $("push-ask-title").textContent = t("push.askTitle", { task: task.title, time: task.time });
  $("push-ask-text").textContent = t(status === "off" ? "push.askText" : "push.askTextIos");
  $("push-ask-yes").textContent = t(status === "off" ? "push.askYes" : "push.howIos");
  $("push-ask-yes").dataset.push = status === "off" ? "enable" : "ios";
  $("push-ask").showModal();
}
$("push-ask-yes").addEventListener("click", () => $("push-ask").close());

// Dessine la carte "Notifications" (Paramètres) et la bannière de l'accueil, selon l'état
async function renderPush() {
  if (!state) return;
  const status = await pushStatus();
  $("push-status").textContent = t("push.status." + status);
  $("push-status").dataset.status = status;
  const buttons = [];
  if (status === "off") buttons.push(`<button class="btn btn-primary" data-push="enable">${t("push.enable")}</button>`);
  if (status === "on") buttons.push(`<button class="btn btn-ghost" data-push="test">${t("push.test")}</button>`, `<button class="btn btn-ghost" data-push="disable">${t("push.disable")}</button>`);
  if (status === "ios") buttons.push(`<button class="btn btn-primary" data-push="ios">${t("push.howIos")}</button>`);
  if (installPrompt && !IS_INSTALLED) buttons.push(`<button class="btn btn-ghost" data-push="install">📲 ${t("push.install")}</button>`);
  $("push-actions").innerHTML = buttons.join("");

  // La bannière de l'accueil : seulement si c'est activable ici, pas encore fait, et pas fermée
  const banner = (status === "off" || status === "ios") && !pushBannerClosed();
  $("push-banner").classList.toggle("hidden", !banner);
  if (banner) {
    $("push-banner-text").textContent = t(status === "off" ? "push.bannerText" : "push.bannerIos");
    $("push-banner-btn").textContent = t(status === "off" ? "push.enable" : "push.howIos");
    $("push-banner-btn").dataset.push = status === "off" ? "enable" : "ios";
    // Android / ordinateur : on propose aussi d'installer Buddy comme une vraie appli (un seul clic)
    $("push-banner-install").classList.toggle("hidden", !(installPrompt && !IS_INSTALLED));
  }
  return status;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-push]");
  if (!b) return;
  const actions = { enable: enablePush, disable: disablePush, test: testPush, install: installApp, ios: () => $("ios-dialog").showModal() };
  actions[b.dataset.push]?.();
});
$("push-banner-close").addEventListener("click", () => {
  try { localStorage.setItem("buddy-push-banner-closed", String(Date.now())); } catch (e) {}
  $("push-banner").classList.add("hidden");
});

// Au chargement : si cet appareil a déjà les notifications, on redonne son adresse au serveur
// (au cas où elle aurait changé, ou si quelqu'un d'autre s'était connecté sur ce téléphone avant)
async function syncPush() {
  if ((await pushStatus()) !== "on") return;
  const sub = await currentSubscription();
  await api("POST", "/api/push/subscribe", { subscription: sub.toJSON() });
}

// =============================================================
// UNE FOIS CONNECTÉ : on charge le Buddy de CETTE personne
// =============================================================
// Les 2 phrases de motivation du jour (écrites par Buddy, différentes chaque jour)
async function loadQuotes() {
  shownDay = today();
  const quotes = await api("GET", "/api/quote?today=" + today());
  if (quotes.short) $("quote-short").textContent = quotes.short;
  if (quotes.long) {
    $("quote-long").textContent = quotes.long;
    $("quote-long").classList.toggle("long", quotes.long.length > 140); // une longue phrase : un peu plus petite
  }
}

// =============================================================
// BUDDY PREMIUM
// L'écran complet s'affiche UNE fois, juste après l'inscription (avant la visite guidée).
// La version courte (reason = "tasks", "messages", "styles") s'affiche quand une personne gratuite
// atteint une limite — seulement quand le mode démo est désactivé (DEMO_MODE dans shared.js).
// Pas encore de vrai paiement : les deux choix mènent à l'app complète, on enregistre juste le choix.
// =============================================================
let premiumDone = null; // ce qu'on fait une fois le choix fait (ex : lancer la visite guidée)
function showPremium(reason = null) {
  if (reason && DEMO_MODE) return Promise.resolve(); // en mode démo : aucune limite, rien à débloquer
  const dialog = $("premium-dialog");
  dialog.classList.toggle("short", !!reason);
  $("premium-reason").classList.toggle("hidden", !reason);
  if (reason) $("premium-reason").textContent = t("premium.why." + reason, FREE_LIMITS);
  $("premium-free").textContent = t(reason ? "premium.later" : "premium.free");
  // Essai gratuit déjà utilisé (déjà abonné une fois) : le bouton annonce directement le prix
  $("premium-start").textContent = t(state?.payments && state.profile.subscriptionStatus ? "premium.go" : "premium.cta");
  drawIcons();
  return new Promise((resolve) => {
    premiumDone = resolve;
    if (!dialog.open) dialog.showModal();
  });
}
async function choosePlan(plan) {
  const dialog = $("premium-dialog");
  const short = dialog.classList.contains("short");
  dialog.close();
  // Paiements branchés : Premium = la page de paiement de Stripe (on y part, la suite se passe au retour)
  if (plan === "premium" && (state?.payments || STORE_MODE)) {
    if (await startCheckout()) return;
    plan = "free"; // la page de paiement n'a pas pu s'ouvrir : on continue en gratuit
  }
  // Version courte + "Plus tard" : on ne change rien. Sinon on enregistre le choix (et sa date) dans Supabase.
  if (!short || plan === "premium") {
    try { localStorage.setItem("buddy-plan-asked", "1"); } catch (e) {}
    const result = await api("POST", "/api/plan", { plan }).catch(() => ({}));
    if (state) state.profile.plan = result.plan || plan;
    if (plan === "premium") toast(t("premium.welcome"));
    if (state) render();
  }
  const done = premiumDone;
  premiumDone = null;
  done?.(plan);
}
// =============================================================
// LES OUTILS : le Vide-tête (Premium), les compteurs "Jours sans" et les cagnottes (gratuits)
// =============================================================
const MILESTONES = [1, 3, 7, 14, 30, 60, 100, 180, 365]; // les paliers des compteurs "Jours sans"
const daysSince = (key) => Math.round((new Date(today() + "T12:00:00") - new Date(key + "T12:00:00")) / 86400000);
const euro = (n) => new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const trackerById = (id) => (state.trackers || []).find((x) => x.id === id);

function renderTools() {
  const trackers = state.trackers || [];
  const quits = trackers.filter((x) => x.kind === "quit");
  const pots = trackers.filter((x) => x.kind === "savings");
  $("quit-list").innerHTML = quits.length ? quits.map(quitHtml).join("") : `<p class="empty">${t("quit.empty")}</p>`;
  $("pot-list").innerHTML = pots.length ? pots.map(potHtml).join("") : `<p class="empty">${t("pot.empty")}</p>`;
  renderDumpLock();
  renderHomeDump();
}

// Un compteur "Jours sans" : le nombre de jours, la barre jusqu'au prochain palier, le record et ce qui a été gagné
function quitHtml(x) {
  const days = Math.max(0, daysSince(x.data.start));
  const record = Math.max(x.data.record || 0, days);
  const next = MILESTONES.find((m) => m > days) || Math.ceil((days + 1) / 365) * 365;
  const prev = [...MILESTONES].reverse().find((m) => m <= days) || 0;
  const pct = Math.round(((days - prev) / (next - prev)) * 100);
  const gains = [];
  if (x.data.money && days) gains.push(t("quit.saved", { amount: euro(Math.round(days * x.data.money)) }));
  if (x.data.minutes && days) gains.push(t("quit.time", { hours: Math.round((days * x.data.minutes) / 60) }));
  const one = getLang() === "fr" ? days <= 1 : days === 1;
  return `<div class="tracker quit">
    <div class="tracker-top">
      <div class="quit-days"><strong>${days}</strong><span>${t(one ? "quit.day" : "quit.days", { name: esc(x.name) })}</span></div>
      <button class="mini-btn" data-tracker-delete="${x.id}" title="${t("common.delete")}"><i data-lucide="trash-2"></i></button>
    </div>
    <div class="tracker-bar"><span style="width:${pct}%"></span></div>
    <p class="muted small">${[t(next === 1 ? "quit.nextOne" : "quit.next", { n: next }), t("quit.record", { n: record }), ...gains].join(" · ")}</p>
    <button class="btn btn-ghost btn-small" data-quit-reset="${x.id}">${t("quit.relapse")}</button>
  </div>`;
}

// Une cagnotte : combien sur combien, la barre, et quand l'objectif sera atteint à ce rythme
function potHtml(x) {
  const deposits = x.data.deposits || [];
  const saved = Math.round(deposits.reduce((sum, d) => sum + d.amount, 0) * 100) / 100;
  const pct = Math.max(0, Math.min(100, Math.round((saved / x.data.target) * 100)));
  let eta = t("pot.etaSoon");
  if (saved >= x.data.target) eta = t("pot.done");
  else if (saved > 0) {
    // Le rythme : ce qui a été mis de côté depuis la création (au moins sur une semaine, pour ne pas s'emballer)
    const elapsed = Math.max(7, daysSince(dayKey(new Date(x.created_at))) + 1);
    const left = Math.ceil((x.data.target - saved) / (saved / elapsed));
    const when = new Date(addDays(today(), left) + "T12:00:00").toLocaleDateString(locale(), { month: "long", year: "numeric" });
    eta = t("pot.eta", { when });
  }
  return `<div class="tracker pot">
    <div class="tracker-top">
      <div><strong class="pot-name">${esc(x.name)}</strong><p class="pot-amount"><b>${euro(saved)}</b> / ${euro(x.data.target)}</p></div>
      <button class="mini-btn" data-tracker-delete="${x.id}" title="${t("common.delete")}"><i data-lucide="trash-2"></i></button>
    </div>
    <div class="tracker-bar"><span style="width:${pct}%"></span></div>
    <p class="muted small">${pct} % · ${eta}</p>
    <form class="pot-add" data-pot-add="${x.id}">
      <input name="amount" inputmode="decimal" placeholder="${t("pot.amountPh")}" aria-label="${t("pot.amountPh")}">
      <button class="btn btn-ghost btn-small" type="submit"><i data-lucide="plus"></i> ${t("pot.add")}</button>
    </form>
  </div>`;
}

// Ouvrir / fermer les petits formulaires "Nouveau compteur" et "Nouvelle cagnotte"
$("page-outils").addEventListener("click", async (event) => {
  const el = event.target.closest("[data-open-form], [data-close-form], [data-tracker-delete], [data-quit-reset]");
  if (!el) return;
  if (el.dataset.openForm) {
    const form = $(el.dataset.openForm);
    form.classList.toggle("hidden");
    const start = form.elements.start;
    if (start) { start.value = today(); start.max = today(); }
    if (!form.classList.contains("hidden")) form.querySelector("input").focus();
    return;
  }
  if ("closeForm" in el.dataset) return el.closest("form").classList.add("hidden");
  const tracker = trackerById(Number(el.dataset.trackerDelete || el.dataset.quitReset));
  if (!tracker) return;
  if (el.dataset.trackerDelete) {
    if (!confirm(t("tracker.confirmDelete", { name: tracker.name }))) return;
    await api("DELETE", "/api/trackers/" + tracker.id).catch(() => ({}));
    return refresh();
  }
  // "J'ai craqué" : le compteur repart de zéro (le record est gardé) et Buddy aide à repartir
  if (!confirm(t("quit.confirmRelapse"))) return;
  const result = await api("PATCH", "/api/trackers/" + tracker.id, { action: "reset" }).catch(() => ({}));
  if (!result.ok) return toast(result.error || t("err.generic"), "error");
  await refresh();
  toast(t("quit.restarted"));
  $("message").value = t("say.relapse", { name: tracker.name });
  openChat(true);
});

// Créer un compteur ou une cagnotte
async function createTracker(form, kind, fields) {
  const result = await api("POST", "/api/trackers", { kind, ...fields }).catch(() => ({}));
  if (!result.ok) return toast(result.error || t("err.generic"), "error");
  form.reset();
  form.classList.add("hidden");
  refresh();
}
$("quit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const f = event.target;
  createTracker(f, "quit", { name: f.elements.name.value, start: f.elements.start.value, money: f.elements.money.value, minutes: f.elements.minutes.value });
});
$("pot-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const f = event.target;
  createTracker(f, "savings", { name: f.elements.name.value, target: f.elements.target.value });
});

// Ajouter de l'argent dans une cagnotte (un montant négatif = un retrait)
$("pot-list").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest("[data-pot-add]");
  const tracker = form && trackerById(Number(form.dataset.potAdd));
  const amount = form?.amount.value.trim();
  if (!tracker || !amount) return;
  const before = (tracker.data.deposits || []).reduce((sum, d) => sum + d.amount, 0);
  const result = await api("PATCH", "/api/trackers/" + tracker.id, { action: "deposit", amount }).catch(() => ({}));
  if (!result.ok) return toast(result.error || t("err.generic"), "error");
  const after = result.data.deposits.reduce((sum, d) => sum + d.amount, 0);
  await refresh();
  toast(before < tracker.data.target && after >= tracker.data.target
    ? t("pot.reached", { name: tracker.name })
    : t("pot.added", { amount: euro(after - before), name: tracker.name }));
});

// --- Le Vide-tête (Premium) ---
let dumpProposals = []; // la proposition de Buddy, en attente du "oui"
let dumpExample = false; // l'exemple flouté est-il affiché (version gratuite) ?

function renderDumpList(items, message, example = false) {
  $("dump-message").textContent = message;
  $("dump-list").innerHTML = items.map((item, i) => {
    const goal = item.goalId ? goalById(item.goalId) : null;
    const when = niceDate(item.onDate, { weekday: "short", day: "numeric", month: "short" }) + (item.time ? " · " + item.time : "");
    return `<li><label>
      <input type="checkbox" data-dump-item="${i}" checked ${example ? "disabled" : ""}>
      ${goal ? `<span class="cat-dot" style="--c:${catOf(goal).color}"></span>` : ""}
      <span class="dump-title">${esc(item.title)}</span><span class="dump-when">${when}</span>
    </label></li>`;
  }).join("");
  $("dump-result").classList.remove("hidden");
}

// Version gratuite : un exemple (flouté) pour qu'on voie à quoi ça sert, et le bandeau Premium
function renderDumpLock() {
  const locked = !hasPremium(state.profile);
  $("dump-card").classList.toggle("locked", locked);
  if (locked && !dumpExample) {
    dumpExample = true;
    $("dump-text").value = t("dump.exampleText");
    renderDumpList([
      { title: t("dump.ex1"), onDate: today() },
      { title: t("dump.ex2"), onDate: addDays(today(), 1), time: "18:00" },
      { title: t("dump.ex3"), onDate: addDays(today(), 1) },
      { title: t("dump.ex4"), onDate: addDays(today(), 2), time: "19:00" },
    ], t("dump.exampleMsg"), true);
  } else if (!locked && dumpExample) {
    dumpExample = false;
    $("dump-text").value = "";
    $("dump-result").classList.add("hidden");
  }
}

$("dump-unlock").addEventListener("click", () => showPremium("braindump"));
$("home-dump-unlock").addEventListener("click", () => showPremium("braindump"));
// Sur l'accueil : on écrit, et on part dans Outils où Buddy propose les tâches (à valider avant ajout)
$("home-dump-go").addEventListener("click", () => {
  if (!hasPremium(state.profile)) return showPremium("braindump");
  const text = $("home-dump-text").value.trim();
  if (!text) return $("home-dump-text").focus();
  $("dump-text").value = text;
  $("home-dump-text").value = "";
  location.hash = "#outils";
  setTimeout(() => { $("dump-card").scrollIntoView({ block: "start", behavior: "smooth" }); $("dump-go").click(); }, 150);
});
let homeDumpExample = false;
function renderHomeDump() {
  const locked = !hasPremium(state.profile);
  $("home-dump").classList.toggle("locked", locked);
  if (locked && !homeDumpExample) { homeDumpExample = true; $("home-dump-text").value = t("dump.exampleText"); }
  else if (!locked && homeDumpExample) { homeDumpExample = false; $("home-dump-text").value = ""; }
}
$("dump-go").addEventListener("click", async () => {
  if (!hasPremium(state.profile)) return showPremium("braindump");
  const text = $("dump-text").value.trim();
  if (!text) return $("dump-text").focus();
  const button = $("dump-go");
  button.disabled = true;
  button.querySelector("span").textContent = t("dump.thinking");
  const result = await api("POST", "/api/braindump", { text }).catch(() => ({}));
  button.disabled = false;
  button.querySelector("span").textContent = t("dump.go");
  if (result.premium) return showPremium(result.premium);
  if (result.error || !result.tasks) return toast(result.error || t("err.buddyFailed"), "error");
  if (!result.tasks.length) return toast(result.message || t("dump.nothing"));
  dumpProposals = result.tasks;
  renderDumpList(result.tasks, result.message);
  drawIcons();
});
$("dump-cancel").addEventListener("click", () => {
  dumpProposals = [];
  $("dump-result").classList.add("hidden");
});
// "Oui, ajoute-les" : on crée les tâches cochées (avec les règles habituelles : nombre maximum par jour…)
$("dump-confirm").addEventListener("click", async () => {
  const chosen = dumpProposals.filter((_, i) => $("dump-list").querySelector(`[data-dump-item="${i}"]`)?.checked);
  if (!chosen.length) return toast(t("dump.noneChosen"), "error");
  $("dump-confirm").disabled = true;
  let added = 0, problem = null;
  for (const item of chosen) {
    const result = await api("POST", "/api/tasks", { title: item.title, onDate: item.onDate, time: item.time, goalId: item.goalId }).catch(() => ({}));
    if (result.ok) added++;
    else problem = problem || result.error || t("err.generic");
  }
  $("dump-confirm").disabled = false;
  dumpProposals = [];
  $("dump-text").value = "";
  $("dump-result").classList.add("hidden");
  await refresh();
  if (added) toast(t("dump.added", { n: added }));
  if (problem) toast(problem, "error");
});

// L'annonce du lancement (5 octobre 2026) : pour les testeurs qui ont Premium offert, une seule fois par appareil
function showLaunchNotice() {
  const until = giftUntil(state.profile);
  let seen = false;
  try { seen = localStorage.getItem("buddy-launch-seen") === "1"; } catch (e) {}
  if (!until || seen) return;
  try { localStorage.setItem("buddy-launch-seen", "1"); } catch (e) {}
  $("launch-text").textContent = t("launch.text", { date: niceDate(dayKey(new Date(until)), { day: "numeric", month: "long" }) });
  $("launch-dialog").showModal();
}
$("launch-more").addEventListener("click", () => { $("launch-dialog").close(); showPremium(); });

// Ouvre la page de paiement sécurisée de Stripe. Renvoie false si elle n'a pas pu s'ouvrir.
async function startCheckout() {
  if (STORE_MODE) return false; // appli Google Play : pas de paiement Stripe (voir STORE_MODE)
  try { localStorage.setItem("buddy-plan-asked", "1"); } catch (e) {}
  toast(t("premium.redirect"));
  const result = await api("POST", "/api/checkout", {}).catch(() => ({}));
  if (result.url) {
    location.href = result.url;
    return true;
  }
  toast(result.error || t("err.payment"), "error");
  return false;
}

// "Gérer mon abonnement" (Paramètres) : la page de Stripe pour changer de carte, voir ses factures ou annuler
$("plan-manage").addEventListener("click", async () => {
  const result = await api("POST", "/api/billing-portal", {}).catch(() => ({}));
  if (result.url) location.href = result.url;
  else toast(result.error || t("err.payment"), "error");
});

// Au retour de Stripe : on dit ce qui s'est passé, puis on nettoie l'adresse de la page
async function handleStripeReturn() {
  if (!stripeReturn) return;
  const kind = stripeReturn;
  history.replaceState(null, "", location.pathname + location.hash);
  if (kind === "success") {
    if (state.profile.plan !== "premium") { // Stripe a parfois une seconde de retard : on réessaie une fois
      toast(t("premium.checking"));
      await new Promise((r) => setTimeout(r, 3000));
      await refresh();
    }
    if (state.profile.plan === "premium") toast(t("premium.welcome"));
  } else if (kind === "cancel") {
    toast(t("premium.cancelled"));
    if (!state.profile.plan) { // jamais choisi : on note "gratuit" (pour ne pas reposer la question)
      const result = await api("POST", "/api/plan", { plan: "free" }).catch(() => ({}));
      state.profile.plan = result.plan || "free";
    }
  }
  stripeReturn = null;
  render();
}

$("premium-start").addEventListener("click", () => choosePlan("premium"));
$("premium-free").addEventListener("click", () => choosePlan("free"));
$("premium-close").addEventListener("click", () => choosePlan("free")); // la croix = continuer gratuitement
$("premium-dialog").addEventListener("cancel", (e) => { e.preventDefault(); choosePlan("free"); }); // touche Échap
$("plan-open").addEventListener("click", () => showPremium());

// Le choix n'a jamais été fait (nouveau compte) ? On affiche l'écran complet, et on attend la réponse.
// (Le petit mémo dans le navigateur évite de le remontrer si Supabase n'a pas encore la colonne "plan".)
async function askPlanIfNeeded() {
  let asked = false, wish = null;
  try {
    asked = localStorage.getItem("buddy-plan-asked") === "1";
    wish = localStorage.getItem("buddy-plan-wish"); // choisi sur la page d'accueil, avant l'inscription
    localStorage.removeItem("buddy-plan-wish");
  } catch (e) {}
  if (!state?.profile || state.profile.plan || asked || giftUntil(state.profile)) return; // Premium offert : rien à choisir
  if (wish === "premium" && state.payments && (await startCheckout())) return; // choisi sur l'accueil : direction le paiement
  if (wish === "premium" || wish === "free") {
    // Déjà choisi sur la page d'accueil : on l'enregistre, sans redemander
    try { localStorage.setItem("buddy-plan-asked", "1"); } catch (e) {}
    const result = await api("POST", "/api/plan", { plan: wish }).catch(() => ({}));
    state.profile.plan = result.plan || wish;
    if (wish === "premium") toast(t("premium.welcome"));
    render();
    return;
  }
  await showPremium();
}

// Un nouveau jour commence alors que l'appli est restée ouverte (très courant avec l'appli installée
// sur le téléphone) : on recharge tout (tâches du jour, frise) et les nouvelles phrases de motivation.
let shownDay = null;
function checkNewDay() {
  if (!session || !state || !shownDay || shownDay === today()) return;
  refresh().catch((e) => console.error("Nouveau jour :", e));
  loadQuotes().catch((e) => console.error("Phrases du jour :", e));
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkNewDay(); });
setInterval(checkNewDay, 60 * 1000); // on vérifie aussi toutes les minutes (le passage à minuit)

async function loadMyBuddy(newSession) {
  session = newSession;
  $("password").value = ""; // on ne laisse pas traîner le mot de passe
  chat.innerHTML = "";
  showApp();
  await refresh();
  await handleStripeReturn(); // on revient de la page de paiement ? (sinon : rien)
  // Nouveau compte : l'écran Buddy Premium d'abord (la visite guidée suit, comme avant)
  await askPlanIfNeeded();
  showLaunchNotice(); // l'annonce "Buddy est lancé, Premium offert 2 semaines" (une seule fois, testeurs)

  // LA LANGUE : un choix fait sur CET appareil (bouton FR/EN) passe en premier ;
  // sinon on reprend la langue enregistrée dans le compte (choisie sur un autre appareil).
  const accountLang = cleanLang(state.profile.language);
  if (!savedLang() && accountLang && accountLang !== getLang()) {
    setLang(accountLang);
    translatePage();
    render();
  }
  if (state.profile.language !== getLang()) {
    // On l'enregistre dans le compte : Buddy et les e-mails parleront cette langue
    api("PATCH", "/api/profile", { language: getLang() }).catch((e) => console.error("Langue :", e));
  }
  loadQuotes().catch((e) => console.error("Phrases du jour :", e)); // sans bloquer le reste
  syncPush().catch((e) => console.error("Notifications :", e));

  // Le fuseau horaire de cet ordinateur (ex : "Europe/Paris") : on le donne au serveur
  // pour que les rappels arrivent à la bonne heure, même si le serveur est à l'autre bout du monde.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone && state.profile.timezone !== timezone) {
    api("PATCH", "/api/profile", { timezone }).catch((e) => console.error("Fuseau horaire :", e));
  }

  renderChatHistory(); // la conversation en cours (une "nouvelle conversation" cache les plus anciennes)

  const lastReply = state.messages.filter((m) => m.role === "assistant").pop();
  if (lastReply) {
    // Buddy reprend l'expression de son dernier message
    showEmotion(lastReply.emotion || "motivational", false);
    // On arrive depuis le bouton "Faire mon bilan" de l'e-mail du dimanche ? On lance le bilan.
    if (location.hash === "#bilan") {
      history.replaceState(null, "", "#accueil");
      showPage();
      startReview();
    } else {
      // Des brouillons attendaient (la page s'est rechargée pendant qu'on écrivait) : on remet tout en place
      const chatDraft = readDraft("chat");
      if (chatDraft) {
        $("message").value = chatDraft;
        openChat(true); // on rouvre la discussion, pour que le message soit sous les yeux
      }
      reopenDraftDialog();
    }
  } else {
    // Toute première visite : la visite guidée, PUIS la discussion s'ouvre et Buddy se présente
    const hello = () => { openChat(true); sendToBuddy(""); };
    if (tourSeen()) hello();
    else startTour(hello);
  }
}

// Au chargement : on écrit la page dans la bonne langue…
translatePage();
// … puis : déjà connecté ? (Supabase se souvient de la connexion)
const { data } = await supabase.auth.getSession();
if (data.session && RECOVERY_LINK) {
  // On vient du lien "mot de passe oublié" : on choisit d'abord un nouveau mot de passe
  showLanding();
  openAuth("reset");
} else if (data.session) {
  loadMyBuddy(data.session);
} else {
  showLanding();
  // L'e-mail tapé avant un rechargement (brouillon)
  if (!$("email").value) $("email").value = readDraft("auth-email") || "";
  if (EXPIRED_LINK && OAUTH_RETURN) {
    // Retour de Google / Apple sans connexion (annulé, ou refusé)
    openAuth("signup");
    authInfo(t("auth.oauthFailed"));
  } else if (EXPIRED_LINK) {
    // Le lien de l'e-mail a expiré (ou a déjà servi) : on propose d'en redemander un
    openAuth("forgot");
    authInfo(t("auth.linkExpired"));
  } else {
    // Un lien direct vers la page d'inscription, de connexion… (ex : buddycoach.app/#inscription)
    const mode = authModeFromHash();
    if (mode) openAuth(mode);
  }
}
