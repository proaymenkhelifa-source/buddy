# Le robot de publication Buddy — guide pour Aymen

Le robot publie tes vidéos tout seul, chaque soir, sur tes 6 comptes (Instagram, YouTube, TikTok × FR, EN).
Tout se pilote depuis ton téléphone : **buddycoach.app → Paramètres → Admin** (Publications et Connexions).

## Comment ça marche, en bref
1. Je fabrique une série de 7 vidéos, puis je lance `node preparer-publication.mjs 10 11 12 13 14 15 16` (dans le dossier `videos`).
   Chaque vidéo se range sur le jour libre suivant, au créneau du soir. Tu reçois un e-mail « 🎬 Vidéo … prête ».
2. Le soir venu, le robot publie sur les comptes connectés, puis t'envoie un e-mail de compte rendu (✅ publié, ⏳ privé, ❌ erreur).
3. Les vidéos sont effacées du stockage dès qu'elles sont publiées (et au plus tard 7 jours après leur date) : ça reste gratuit.

Tu peux toujours, avant l'heure : modifier un texte, **Reporter** une vidéo, **Annuler** une ligne.

## Les réglages (Vercel → ton projet → Settings → Environment Variables)
Après chaque ajout ou changement : onglet **Deployments** → **⋯** sur la 1re ligne → **Redeploy**.

| Réglage | Valeur | À quoi ça sert |
|---|---|---|
| `PUBLICATION_DRY_RUN` | `false` | Publier **en vrai** (sans ce réglage, le robot reste en mode essai et ne fait rien tout seul) |
| `PUBLICATION_AUTO_VALIDATION` | `true` | Publier **sans validation** (ton choix). Mets `false` pour valider toi-même (ex. le lundi pour la semaine) |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | (déjà mis) | L'appli Meta |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | voir ci-dessous | L'appli Google |
| `PUBLICATION_CRENEAU` | `midi` ou `soir` | Facultatif : l'heure habituelle (soir par défaut) |

Heures (formule gratuite de Vercel, à une heure près) : **soir = 19 h–20 h** l'été, **18 h–19 h** l'hiver ; midi = 12 h–13 h l'été, 11 h–12 h l'hiver.

---

## ✅ Instagram (fait le 12 octobre)
Appli Meta « Buddy Publication », connexion Instagram, comptes @buddy.appfr et @buddy.appuk en testeurs, connectés dans Buddy.
La clé dure 60 jours et le robot la renouvelle tout seul. Si un jour un e-mail dit « reconnecte Instagram » : Admin → Connexions → **Reconnecter**.

---

## 🎬 YouTube (≈ 20 minutes) — à faire sur ordinateur
Tu as besoin : du compte Google qui gère tes chaînes YouTube FR et EN.

### A. Créer le projet Google (3 min)
1. Va sur **console.cloud.google.com** et connecte-toi avec ce compte Google. Accepte les conditions si on te les demande.
2. En haut à gauche, à côté du logo « Google Cloud », clique sur le **sélecteur de projet** → **Nouveau projet**.
3. Nom du projet : `Buddy Publication` → **Créer**. Attends quelques secondes, puis **sélectionne** ce projet (même sélecteur en haut).

### B. Activer l'API YouTube (1 min)
1. Dans la barre de recherche en haut, tape **YouTube Data API v3** et clique sur le résultat.
2. Clique sur **Activer**.

### C. L'écran de consentement (5 min)
1. Menu ☰ (en haut à gauche) → **Google Auth Platform** → **Branding** (ou « Présentation de la marque »). Si on te le propose, clique sur **Commencer**.
2. **Nom de l'appli** : `Buddy Publication` · **E-mail d'assistance** : ton e-mail → **Suivant**.
3. **Audience** : choisis **Externe** → **Suivant**.
4. **Coordonnées** : ton e-mail → **Suivant** → coche **J'accepte le Règlement sur les données utilisateur des services d'API Google** → **Continuer** → **Créer**.
5. Toujours dans Google Auth Platform → **Branding** : si tu vois les champs, mets aussi
   - Page d'accueil : `https://buddycoach.app`
   - Règles de confidentialité : `https://buddycoach.app/legal/confidentialite.html?lang=en`
   - Conditions d'utilisation : `https://buddycoach.app/legal/conditions.html?lang=en`
   - Domaine autorisé : `buddycoach.app` → **Enregistrer**.
6. **Data Access** (Accès aux données) → **Ajouter ou supprimer des champs d'application** → cherche et coche :
   - `.../auth/youtube.upload`
   - `.../auth/youtube.force-ssl`
   → **Mettre à jour** → **Enregistrer**.
7. **Audience** → bouton **Publier l'application** (« Publish app ») → **Confirmer**.
   ⚠️ Important : en mode « Test », Google coupe la connexion tous les 7 jours. En « Production », elle reste. Pas besoin d'examen pour tes propres chaînes.

### D. Les identifiants (3 min)
1. Google Auth Platform → **Clients** → **Créer un client**.
2. **Type d'application** : **Application Web** · Nom : `Buddy`.
3. **URI de redirection autorisés** → **Ajouter un URI** → colle exactement :
   `https://buddycoach.app/admin/connexions/youtube/callback`
4. **Créer**. Une fenêtre montre l'**ID client** et le **Code secret du client** (ne me les envoie pas).

### E. Les 2 clés dans Vercel (3 min)
1. Vercel → projet Buddy → Settings → Environment Variables :
   - `YOUTUBE_CLIENT_ID` = l'ID client
   - `YOUTUBE_CLIENT_SECRET` = le code secret
2. Profites-en pour ajouter (si ce n'est pas déjà fait) : `PUBLICATION_DRY_RUN` = `false` et `PUBLICATION_AUTO_VALIDATION` = `true`.
3. **Deployments** → **⋯** → **Redeploy**.

### F. Connecter tes 2 chaînes (2 min)
1. Sur buddycoach.app (connecté avec ton adresse admin) → Paramètres → Admin → **Connexions**.
2. YouTube, ligne 🇫🇷 FR → **Connecter** → choisis le compte / la chaîne **FR**.
   Google affiche « Google n'a pas validé cette application » : c'est normal (c'est ta propre appli) → **Paramètres avancés** → **Accéder à Buddy Publication** → coche les autorisations → **Continuer**.
3. Tu reviens avec « ✅ youtube FR connecté (@ta_chaîne) ». Recommence avec la ligne 🇬🇧 EN et la chaîne **EN**.
   Si tes deux chaînes sont sur le même compte Google (« compte de marque »), Google te demande laquelle choisir.

C'est fini pour YouTube : les vidéos partiront en **public**. Si un jour YouTube en met une en privé, l'e-mail du soir te le dira (⏳) et tu la passeras en public dans YouTube Studio.

---

## 🎵 TikTok (prochaine session, ≈ 20 minutes + l'examen de TikTok)
TikTok oblige les applis pas encore examinées à publier en **privé** (« moi uniquement ») : le robot publiera en privé et te préviendra,
le temps que TikTok valide l'appli (quelques jours à quelques semaines). Le guide détaillé viendra avec le module.
