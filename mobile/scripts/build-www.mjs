// build-www.mjs – range la page de Buddy (le dossier public/ du site) DANS l'appli iPhone (dossier mobile/www).
// Lancé par "npm run sync" (et par Codemagic avant "cap sync") : l'appli contient alors la page elle-même,
// au lieu d'ouvrir le site. La page parle au serveur en ligne (https://buddycoach.app) : voir API_BASE dans public/app.js.
//
// Ce qu'on NE met PAS dans l'appli :
//   - admin.html (la page d'administration), Carrousel/ (images marketing)
//   - sw.js et offline.html (le "facteur" du site : l'appli n'en a pas besoin)
//   - legal/ (les pages légales s'ouvrent sur buddycoach.app : toujours la dernière version)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(here, "../../public");
const TARGET = path.resolve(here, "../www");
const SKIP = new Set(["admin.html", "Carrousel", "sw.js", "offline.html", "legal"]);

if (!fs.existsSync(path.join(SOURCE, "index.html"))) {
  console.error("Page introuvable : " + SOURCE);
  process.exit(1);
}

fs.rmSync(TARGET, { recursive: true, force: true });
fs.cpSync(SOURCE, TARGET, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(SOURCE, src);
    const top = rel.split(path.sep)[0];
    return !rel || (!SKIP.has(top) && !/^admin.*\.html$/.test(top) && !/^test-/.test(top));
  },
});

// Le module de connexion (Supabase) est rangé DANS l'appli au lieu d'être téléchargé depuis internet
// (cdn.jsdelivr.net) à chaque ouverture : plus fiable sur iPhone, et l'appli démarre même si ce site est lent.
const CDN_IMPORT = 'import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";';
const appFile = path.join(TARGET, "app.js");
const appJs = fs.readFileSync(appFile, "utf8");
if (!appJs.includes(CDN_IMPORT)) {
  console.error("La ligne d'import de Supabase dans app.js a changé : mets à jour build-www.mjs");
  process.exit(1);
}
const esbuild = await import("esbuild");
await esbuild.build({
  stdin: { contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: path.resolve(here, "..") },
  bundle: true, format: "esm", minify: true, target: "safari15",
  outfile: path.join(TARGET, "vendor", "supabase.js"),
  logLevel: "warning",
});
fs.writeFileSync(appFile, appJs.replace(CDN_IMPORT, 'import { createClient } from "./vendor/supabase.js";'));

// L'écran de l'iPhone va jusque sous l'heure et la barre d'accueil : "viewport-fit=cover" donne à la page
// la taille de ces zones (env(safe-area-inset-…), utilisées dans la partie 19 de style.css).
const indexFile = path.join(TARGET, "index.html");
const html = fs.readFileSync(indexFile, "utf8");
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
if (!html.includes(viewport)) {
  console.error("La ligne viewport d'index.html a changé : mets à jour build-www.mjs");
  process.exit(1);
}
// Le "filet de sécurité" du démarrage : si, 10 secondes après l'ouverture, aucun écran de Buddy n'est affiché
// (accueil, connexion ou appli), on affiche les erreurs rencontrées au lieu d'une page blanche, avec "Réessayer".
// (Une capture de cet écran suffit pour savoir ce qui ne va pas sur l'iPhone.)
const BOOT_GUARD = `<script>
(function () {
  var errors = [];
  window.addEventListener("error", function (e) { errors.push((e.message || "erreur") + (e.filename ? " @ " + e.filename.split("/").pop() + ":" + e.lineno : "") + (e.target && e.target.src ? " [" + e.target.src + "]" : "")); }, true);
  window.addEventListener("unhandledrejection", function (e) { errors.push("promesse : " + (e.reason && (e.reason.stack || e.reason.message) || e.reason)); });
  setTimeout(function () {
    var shown = ["landing", "auth-screen", "app"].some(function (id) { var el = document.getElementById(id); return el && !el.classList.contains("hidden"); });
    if (shown || document.querySelector(".native-offline")) return;
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;inset:0;z-index:99999;background:#14284B;color:#fff;padding:60px 20px 20px;font:14px -apple-system,sans-serif;overflow:auto";
    box.innerHTML = "<h2 style='margin:0 0 12px'>Buddy n'a pas pu démarrer</h2><p>Fais une capture d'écran et envoie-la. Puis touche Réessayer.</p><button style='font-size:16px;padding:10px 18px;border-radius:10px;border:0;margin:8px 0 16px'>Réessayer</button><pre style='white-space:pre-wrap;font-size:12px'></pre>";
    box.querySelector("pre").textContent = (errors.length ? errors.join("\\n\\n") : "Aucune erreur enregistrée (la page attend une réponse).") + "\\n\\n" + navigator.userAgent;
    box.querySelector("button").onclick = function () { location.reload(); };
    document.body.appendChild(box);
  }, 10000);
})();
</script>`;
fs.writeFileSync(indexFile, html
  .replace(viewport, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">')
  .replace("<head>", "<head>\n" + BOOT_GUARD));

let files = 0;
let bytes = 0;
(function count(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) count(p);
    else { files++; bytes += fs.statSync(p).size; }
  }
})(TARGET);
console.log(`Page de Buddy copiée dans mobile/www : ${files} fichiers, ${(bytes / 1024 / 1024).toFixed(1)} Mo`);
