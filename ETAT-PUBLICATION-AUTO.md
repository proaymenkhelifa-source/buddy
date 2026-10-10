# ÉTAT — Robot de publication Buddy

> Brief : `BRIEF-PUBLICATION-AUTO.md`. On avance étape par étape ; Aymen valide chaque étape avant la suivante.
> Si une session s'arrête, la suivante reprend à la première case non cochée.
> Aymen publie lui-même les vidéos 05 à 09. Le robot sert à partir de la vidéo **10**. Le test en mode essai utilise la vidéo **05** (rien n'est envoyé aux réseaux).

## 0. Pages légales (demandées par TikTok, Google et Meta pour l'audit)
- [x] Vérifié : `buddycoach.app/legal/confidentialite.html` et `/legal/conditions.html` existent (FR + EN dans la même page), en ligne (code 200)
- [x] Ajouté : lien direct vers une langue avec `?lang=en` / `?lang=fr` (`public/legal/legal.js`)
- [x] Ajouté : confidentialité § 4 « Nos comptes TikTok, Instagram et YouTube » (FR + EN : ce qu'on reçoit, pourquoi, où, comment retirer l'accès, YouTube ToS + Google Privacy Policy + Google API Services User Data Policy / Limited Use) ; conditions § 8 « Nos vidéos sur les réseaux sociaux »
- [ ] Mise en ligne (au prochain déploiement, après accord d'Aymen)
- Adresses à donner aux réseaux : `https://buddycoach.app/legal/confidentialite.html?lang=en` · `https://buddycoach.app/legal/conditions.html?lang=en`
- Reste à compléter (hors robot) : le médiateur de la consommation dans les conditions

## Étape 1 — Mode essai (test complet avec la vidéo 05, rien d'envoyé)
- [x] `supabase-publications.sql` écrit (tables `publications` + `connexions_reseaux`, verrouillées ; dossier de stockage privé `publications`, 50 Mo, MP4)
- [ ] Aymen lance le SQL dans Supabase
- [ ] `videos/preparer-publication.mjs` (envoi des 2 fichiers, 6 lignes, prochain créneau libre, e-mail)
- [ ] Page `/admin/publications` (aperçu, légendes modifiables, valider / annuler / reporter / réessayer, historique)
- [ ] Robot `/api/cron/publish?creneau=midi|soir` en mode essai (`PUBLICATION_DRY_RUN=true`) + e-mail de compte rendu + suppression du fichier
- [ ] Test complet avec la vidéo 05, en local, rien d'envoyé aux réseaux → validé par Aymen

## Étape 2 — Instagram (réel)
- [ ] Module `publications/instagram.js` + connexion OAuth · Instagram FR (1 vidéo, vérifiée par Aymen) · puis Instagram EN

## Étape 3 — YouTube (privé tant que l'audit Google n'est pas passé)
- [ ] Module `publications/youtube.js` + connexion OAuth FR et EN

## Étape 4 — TikTok (privé tant que l'audit TikTok n'est pas passé)
- [ ] Module `publications/tiktok.js` + connexion OAuth FR et EN

## Étape 5 — Connexions + guide
- [ ] Page `/admin/connexions` (état des 6 comptes) · guide `PUBLICATION-AUTO.md`

## Fin
- [ ] `PLAN.md` + `videos/LISEZMOI.md` à jour · récapitulatif pour Aymen

## Journal
- 2026-10-10 : démarrage. Pages légales complétées, SQL écrit.
