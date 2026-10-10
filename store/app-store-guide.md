# Mettre Buddy sur l'App Store (iPhone) – le pas-à-pas

Préparé le 10 octobre 2026. Les textes à copier-coller sont dans `store/app-store-fiche.md`.

## Ce qui est déjà prêt (fait par Claude)

- **Le projet iPhone** (dossier `mobile/`, outil Capacitor) : une vraie appli qui ouvre buddycoach.app,
  avec l'icône Buddy, un écran de démarrage Buddy (fond bleu nuit), iPhone seulement, en portrait.
- **Les vraies notifications iPhone** (passent par Apple) : le code est prêt côté appli et côté serveur.
  Elles marcheront dès que les 3 réglages Apple (étape 3) seront sur Vercel.
- **Pas de paiement dans l'appli iPhone** (règle d'Apple) : prix, essai et bouton Stripe sont cachés,
  comme dans l'appli Android. Les abonnés du site gardent leur Premium en se connectant.
- **La fabrication dans le cloud** (`codemagic.yaml`) : pas besoin de Mac, Codemagic loue un Mac pour fabriquer l'appli.
- **La fiche App Store** (textes FR/EN, mots-clés, confidentialité, notes pour Apple) et
  **10 captures d'écran** au format iPhone exigé par Apple (`store/images-ios/`).

## Ce que TOI tu dois faire (dans l'ordre)

### 1. S'inscrire à l'Apple Developer Program (99 €/an)
- Sur un iPhone ou un Mac : appli **Apple Developer** → « S'inscrire » (c'est le plus simple), ou sur developer.apple.com/programs/enroll.
- Choisis **« Individuel / Entrepreneur individuel »** (ton entreprise est une micro-entreprise, pas une société).
  Le nom affiché sur l'App Store sera « Aymen Khelifa ».
- Il faut ton identifiant Apple avec la **validation en deux étapes** activée, et ta carte bancaire.
- Apple valide en général en 1 à 2 jours.

### 2. Créer l'identifiant de l'appli (developer.apple.com → Certificates, IDs & Profiles)
- **Identifiers** → « + » → **App IDs** → App → Description : `Buddy` → Bundle ID **Explicit** : `app.buddycoach.buddy`
- Dans la liste des capacités, coche **Push Notifications** → Continue → Register.

### 3. La clé des notifications (APNs)
- **Keys** → « + » → nom `Buddy notifications` → coche **Apple Push Notifications service (APNs)** → Continue → Register.
- **Télécharge le fichier .p8** (une seule fois possible ! garde-le précieusement, 2 copies) et note le **Key ID**.
- Ton **Team ID** est en haut à droite de la page (10 caractères).
- Sur **Vercel** → ton projet → Settings → Environment Variables, ajoute (c'est toi qui colles, jamais dans le chat) :
  - `APNS_KEY_ID` = le Key ID
  - `APNS_TEAM_ID` = le Team ID
  - `APNS_KEY` = tout le contenu du fichier .p8 (ouvre-le avec le Bloc-notes, copie tout, y compris les lignes BEGIN/END)
- Puis **Redeploy** sur Vercel.

### 4. Créer l'appli dans App Store Connect (appstoreconnect.apple.com)
- **Apps** → « + » → Nouvelle app → Plateforme **iOS**, Nom `Buddy – Ton coach personnel`,
  Langue **Français**, Bundle ID `app.buddycoach.buddy`, SKU `buddy-ios`, Accès complet.
- Dans **Infos sur l'app**, note l'**Identifiant Apple** (un nombre à 10 chiffres) → donne-le à Claude
  (ce n'est pas un secret) : il le met dans `codemagic.yaml`.

### 5. La clé qui permet à Codemagic de travailler pour toi
- App Store Connect → **Utilisateurs et accès** → **Intégrations** → **App Store Connect API** → « + »
  → nom `Codemagic`, accès **Gestionnaire d'apps (App Manager)** → Générer.
- Note l'**Issuer ID** et le **Key ID**, et **télécharge le fichier .p8** (une seule fois possible).

### 6. Codemagic (codemagic.io, gratuit jusqu'à 500 minutes de Mac par mois)
- Inscris-toi **avec ton compte GitHub** → ajoute le dépôt de Buddy.
- **Teams → Integrations → App Store Connect** → Add key → nom exactement **`Buddy App Store Connect`**,
  avec l'Issuer ID, le Key ID et le fichier .p8 de l'étape 5.
- **Teams → Code signing identities** :
  - **iOS certificates** → « Generate certificate » → type **Apple Distribution** (avec la clé ci-dessus).
  - **iOS provisioning profiles** → « Fetch profiles » → choisis le profil **App Store** de `app.buddycoach.buddy`
    (s'il n'existe pas, crée-le sur developer.apple.com → Profiles → « + » → App Store Connect → `app.buddycoach.buddy`).
- Lance le workflow **« Buddy iPhone → App Store »**. Environ 10-15 minutes. À la fin, l'appli arrive dans
  App Store Connect → **TestFlight**.

### 7. Tester sur un iPhone (le tien ou celui d'un pote)
- Installe l'appli **TestFlight** depuis l'App Store, ajoute-toi comme testeur interne dans App Store Connect → TestFlight.
- Vérifie : connexion, notifications (Paramètres → Notifications → Activer), pas de prix visible, suppression de compte.

### 8. Remplir la fiche et envoyer en examen
- Copie les textes de `store/app-store-fiche.md`, mets les captures de `store/images-ios/`,
  remplis la confidentialité, la classification par âge et les notes pour Apple (avec le compte test).
- Choisis la version fabriquée par Codemagic → **Ajouter pour vérification** → **Soumettre**.
  Apple répond en général en 1 à 3 jours.

## Les risques connus (honnêtement)

1. **Règle 4.2 « fonctionnalité minimale »** : Apple refuse parfois les applis qui ne sont « qu'un site dans une boîte ».
   Ce qui joue pour nous : vraies notifications iPhone, icône et écran de démarrage natifs, appli très interactive (coach IA,
   tâches, outils). Si Apple refuse quand même, on ajoutera des fonctions natives (widgets sur l'écran d'accueil,
   vibrations, partage), ce que tu voulais de toute façon pour Premium.
2. **Règle 3.1 « achats dans l'appli »** : un abonné du site retrouve Premium dans l'appli iPhone, mais l'appli ne vend rien.
   Apple tolère souvent ça quand l'appli ne parle ni de prix ni d'abonnement (c'est notre cas). S'il refuse,
   la solution est d'ajouter l'achat Apple (via RevenueCat) : Apple prend alors 15 % (programme petites entreprises).
3. **Connexion avec Google** : si un jour on l'active, Apple exigera aussi « Se connecter avec Apple ». Aujourd'hui,
   c'est e-mail + mot de passe uniquement, donc pas de problème.

## Pour Claude (technique)
- Projet : `mobile/` (Capacitor 8, Swift Package Manager, pas de CocoaPods). `server.url` = `https://buddycoach.app/?src=ios`,
  `appendUserAgent` = `BuddyiOS` → `STORE_MODE` côté page. Après une modif de `capacitor.config.json` : `cd mobile && npx cap sync ios`.
- Notifications : `public/app.js` (NATIVE / NativePush) envoie `apns:<jeton>` à `/api/push/subscribe` ;
  `push.js` envoie via APNs (HTTP/2 + jeton ES256) si `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` existent.
- Icône : `mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset` (1024 px, sans transparence). Écran de démarrage : `Splash.imageset`.
