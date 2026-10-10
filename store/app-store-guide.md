# Mettre Buddy sur l'App Store (iPhone) – le pas-à-pas

Préparé le 10 octobre 2026. Les textes à copier-coller sont dans `store/app-store-fiche.md`.

## Ce qui est déjà prêt (fait par Claude)

- **Le projet iPhone** (dossier `mobile/`, outil Capacitor) : une vraie appli qui **contient la page de Buddy**
  (elle n'ouvre plus le site : la page est rangée dans l'appli et parle au serveur buddycoach.app),
  avec l'icône Buddy, un écran de démarrage Buddy (fond bleu nuit), iPhone seulement, en portrait.
- **Des fonctions natives de l'iPhone** (ajoutées le 10 octobre pour la règle 4.2, voir plus bas) :
  petite vibration quand on coche une tâche et quand on gagne un badge, bouton **Partager ma série** (fenêtre
  « Partager » de l'iPhone), **raccourcis sur l'icône** (appui long : « Nouvelle tâche », « Parler à Buddy »),
  barre d'état (heure, batterie) assortie au thème, pages légales ouvertes dans une fenêtre Safari, écran
  « Pas de connexion » avec « Réessayer ».
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
   Ce qui joue pour nous : la page est **dans** l'appli (plus de chargement du site), vraies notifications iPhone,
   vibrations, fenêtre de partage, raccourcis sur l'icône, écran hors connexion, icône et écran de démarrage natifs,
   appli très interactive (coach IA, tâches, outils). Si Apple refuse quand même : widgets sur l'écran d'accueil
   et icônes au choix (voir plus bas).
2. **Règle 3.1 « achats dans l'appli »** : un abonné du site retrouve Premium dans l'appli iPhone, mais l'appli ne vend rien.
   Apple tolère souvent ça quand l'appli ne parle ni de prix ni d'abonnement (c'est notre cas). S'il refuse,
   la solution est d'ajouter l'achat Apple (via RevenueCat) : Apple prend alors 15 % (programme petites entreprises).
3. **Connexion avec Google** : si un jour on l'active, Apple exigera aussi « Se connecter avec Apple ». Aujourd'hui,
   c'est e-mail + mot de passe uniquement, donc pas de problème.

## Les icônes au choix (idée Premium) – ce que TU dois envoyer

Rien n'est encore branché : on attend tes images. Les dessins de `design/` ne sont PAS les icônes finales.

**Pour chaque icône :**
- un fichier **PNG carré de 1024 × 1024 pixels**, **sans transparence** (fond plein, pas de coins arrondis :
  l'iPhone arrondit tout seul), en couleurs **sRGB** ;
- un nom simple, en minuscules, sans espace ni accent : `icone-menthe.png`, `icone-nuit.png`, `icone-rose.png`…
- le nom affiché dans l'appli, en français et en anglais (ex : « Nuit » / « Night ») ;
- dis-moi lesquelles sont **Premium** (et si l'icône actuelle reste celle par défaut, ce que je conseille).
- 3 à 6 icônes, c'est bien. Dépose-les dans un dossier `design/icones-app/` et préviens Claude.

**Ce que Claude fera ensuite (sans Mac, fabriqué par Codemagic) :**
1. Une « image set » par icône dans `mobile/ios/App/App/Assets.xcassets/` (ex : `AppIcon-Nuit.appiconset`, 1024 px),
   et le réglage Xcode « Alternate App Icon Sets » (`ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`) dans
   `project.pbxproj` (avec « Include all app icon assets » = Oui) : c'est la méthode actuelle d'Apple, plus simple
   que l'ancienne liste `CFBundleAlternateIcons` dans `Info.plist`.
2. Un tout petit module natif à nous (une vingtaine de lignes Swift) qui appelle
   `UIApplication.shared.setAlternateIconName(...)` d'Apple. On n'utilise PAS le module « communautaire »
   `@capacitor-community/app-icon` : il contient un appel caché d'Apple (`_setAlternateIconName`) qui peut faire
   refuser l'appli à l'examen.
3. Dans l'appli iPhone seulement : Paramètres → « Icône de l'appli », avec les vignettes ; réservé aux Premium
   (les gratuits voient le cadenas et le texte « avec Premium », sans prix, comme le reste du mode store).
4. Apple affiche alors son petit message « Vous avez changé l'icône de Buddy » : c'est normal et obligatoire.

## Pour Claude (technique)
- Projet : `mobile/` (Capacitor 8, Swift Package Manager, pas de CocoaPods). **Plus de `server.url`** : la page est
  rangée dans l'appli. `mobile/scripts/build-www.mjs` copie `public/` dans `mobile/www` (sans admin.html, Carrousel/,
  sw.js, offline.html, legal/) et ajoute `viewport-fit=cover`. `cd mobile && npm run sync` = copie + `cap sync ios`
  (Codemagic fait pareil). `mobile/www` n'est pas dans Git.
- Dans la page : `NATIVE` (= `window.Capacitor.isNativePlatform()`) → `API_BASE = https://buddycoach.app` pour `/api/...`,
  classe `native-app` (CSS partie 19 : zones sûres de l'écran), `STORE_MODE`, source « ios », pas de service worker,
  pas de Google/Apple (retour impossible dans l'appli), lien « mot de passe oublié » vers le site, liens `/legal/` et
  `https://` ouverts avec le module Browser. Le serveur accepte l'origine `capacitor://localhost` (CORS, seulement `/api`).
- **Attention, nouveauté importante** : l'appli iPhone garde la page de SA version. Une modif de `public/` arrive
  tout de suite sur le site, mais sur iPhone seulement après une nouvelle version envoyée à Apple (Codemagic → examen).
  Donc **le serveur doit rester compatible avec les anciennes pages** (ne jamais supprimer ou renommer un champ
  de `/api/...` utilisé par une version iPhone encore installée). Le message « serveur pas à jour » est coupé dans l'appli.
- Modules natifs officiels (`mobile/package.json`) : app, browser, haptics, push-notifications, share, status-bar.
  Raccourcis de l'icône : `UIApplicationShortcutItems` (Info.plist, titres en français) + `SceneDelegate.swift`
  qui les passe à la page en « buddy://new-task » / « buddy://chat » (module App : `appUrlOpen` / `getLaunchUrl`).
- À vérifier sur le premier TestFlight (pas testable sans iPhone) : marges en haut/en bas (encoche, barre d'accueil),
  raccourcis, vibrations, partage, notifications, connexion.
- Notifications : `public/app.js` (NATIVE / NativePush) envoie `apns:<jeton>` à `/api/push/subscribe` ;
  `push.js` envoie via APNs (HTTP/2 + jeton ES256) si `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` existent.
- Icône : `mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset` (1024 px, sans transparence). Écran de démarrage : `Splash.imageset`.
