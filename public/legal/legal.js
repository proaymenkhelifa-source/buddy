// legal.js – les pages légales (mentions légales, conditions, confidentialité).
// Chaque page contient le texte en français ET en anglais : on affiche celui de la langue choisie
// dans l'app (retenue dans le navigateur), sinon celle du téléphone / de l'ordinateur.
function savedLang() {
  try { return localStorage.getItem("buddy-lang"); } catch (e) { return null; }
}
function showLang(lang) {
  lang = lang === "en" ? "en" : "fr";
  document.documentElement.lang = lang;
  for (const block of document.querySelectorAll("[data-lang]")) block.hidden = block.dataset.lang !== lang;
  const other = lang === "fr" ? "en" : "fr";
  const toggle = document.getElementById("legal-lang");
  toggle.textContent = other.toUpperCase();
  toggle.onclick = () => {
    try { localStorage.setItem("buddy-lang", other); } catch (e) {}
    showLang(other);
  };
  document.title = document.querySelector(`[data-lang="${lang}"] h1`).textContent + " – Buddy";
}
showLang(savedLang() || ((navigator.language || "").toLowerCase().startsWith("fr") ? "fr" : "en"));
