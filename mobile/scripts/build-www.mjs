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
    return !rel || !SKIP.has(rel.split(path.sep)[0]);
  },
});

// L'écran de l'iPhone va jusque sous l'heure et la barre d'accueil : "viewport-fit=cover" donne à la page
// la taille de ces zones (env(safe-area-inset-…), utilisées dans la partie 19 de style.css).
const indexFile = path.join(TARGET, "index.html");
const html = fs.readFileSync(indexFile, "utf8");
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
if (!html.includes(viewport)) {
  console.error("La ligne viewport d'index.html a changé : mets à jour build-www.mjs");
  process.exit(1);
}
fs.writeFileSync(indexFile, html.replace(viewport, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'));

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
