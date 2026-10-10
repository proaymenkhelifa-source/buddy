# Fiche App Store – Buddy (à copier-coller dans App Store Connect)

Préparée le 10 octobre 2026. Captures d'écran : `store/images-ios/` (iPhone 6,9 pouces, 1320 × 2868).
Le pas-à-pas complet (compte Apple, Codemagic, envoi) est dans `store/app-store-guide.md`.

---

## 1. Infos de l'app (App Store Connect → Distribution → Infos sur l'app)

- **Nom** (30 car. max) : `Buddy – Ton coach personnel`
- **Sous-titre** (30 car. max) : `Objectifs, tâches et rappels`
- **Catégorie principale** : Productivité · **Catégorie secondaire** : Style de vie
- **Identifiant de lot (Bundle ID)** : `app.buddycoach.buddy`
- **SKU** : `buddy-ios`
- **Langue principale** : Français
- **Copyright** : `2026 Aymen Khelifa`
- **URL d'assistance** : `https://buddycoach.app/legal/mentions-legales.html`
- **URL marketing** : `https://buddycoach.app`
- **Règles de confidentialité** : `https://buddycoach.app/legal/confidentialite.html`

### Français

**Texte promotionnel** (170 car. max, modifiable sans nouvel examen)
```
Ton coach IA qui t'aide à tenir tes objectifs, un jour après l'autre : tâches concrètes, rappels au bon moment, série et badges.
```

**Mots-clés** (100 car. max, séparés par des virgules, sans espace)
```
coach,objectifs,habitudes,motivation,discipline,planning,routine,productivité,rappels,focus
```

**Description**
```
Tu sais ce que tu veux, mais tu as du mal à t'y tenir ? Buddy est ton coach personnel. Il t'aide à passer de « je le ferai » à « c'est fait », un jour après l'autre.

DISCUTE AVEC BUDDY, TON COACH
Explique-lui ton objectif : reprendre le sport, réussir tes études, économiser, voyager, prier à l'heure… Buddy t'aide à le découper en petites tâches concrètes, se souvient de ce que tu lui dis et ajuste ton plan avec toi.

TA JOURNÉE EN UN COUP D'ŒIL
Tes tâches du jour, ta ligne de journée, tes objectifs et leur progression : tout est sur l'accueil. Coche ce que tu as fait, Buddy s'occupe du reste.

DES RAPPELS AU BON MOMENT
Un mot le matin, un récap le soir, un rappel 5 minutes avant chaque tâche. Écrits par Buddy, à ton prénom, jamais deux fois pareils.

TA SÉRIE ET TES BADGES
Enchaîne les jours, débloque des badges et protège ta série grâce au joker de la semaine.

DES OUTILS POUR PASSER À L'ACTION
• Minuteur de focus
• Compteurs « Jours sans » pour arrêter une mauvaise habitude (cigarette, réseaux sociaux, sucre…)
• Cagnottes pour mettre de l'argent de côté pour un projet

Tes données sont hébergées en Europe, ne sont jamais vendues et ne servent pas à de la publicité. Tu peux supprimer ton compte et toutes tes données à tout moment depuis l'application.

Une meilleure version de toi, chaque jour.
```
> Pas de mention de « Premium » ni de prix : Apple refuse qu'on parle d'un abonnement qu'on ne peut pas acheter dans l'appli (voir le guide, partie « Risques »).

### Anglais (à ajouter : « + » à côté de la langue → Anglais (États-Unis) et Anglais (Royaume-Uni))

- **Name** : `Buddy – Your personal coach`
- **Subtitle** : `Goals, tasks and reminders`

**Promotional text**
```
Your AI coach that helps you stick to your goals, one day at a time: concrete tasks, well-timed reminders, streaks and badges.
```

**Keywords**
```
coach,goals,habits,motivation,discipline,planner,routine,productivity,reminders,focus,to do
```

**Description**
```
You know what you want, but sticking to it is hard? Buddy is your personal coach. It helps you go from "I'll do it" to "done", one day at a time.

CHAT WITH BUDDY, YOUR COACH
Tell it your goal: getting back to sport, passing your exams, saving money, travelling, praying on time… Buddy helps you break it into small, concrete tasks, remembers what you tell it and adjusts your plan with you.

YOUR DAY AT A GLANCE
Today's tasks, your day timeline, your goals and their progress: it's all on the home screen. Tick what you've done, Buddy handles the rest.

REMINDERS AT THE RIGHT TIME
A morning note, an evening recap, a reminder 5 minutes before each task. Written by Buddy, with your first name, never the same twice.

YOUR STREAK AND BADGES
Keep the days coming, unlock badges and protect your streak with the weekly joker.

TOOLS TO GET INTO ACTION
• Focus timer
• "Days without" counters to quit a bad habit (cigarettes, social media, sugar…)
• Savings pots to put money aside for a project

Your data is hosted in Europe, never sold and never used for advertising. You can delete your account and all your data at any time from the app.

A better version of you, every day.
```

### Captures d'écran (iPhone 6,9 pouces — obligatoire)
Dans cet ordre : `store/images-ios/iphone-fr-1-accueil.png` → `iphone-fr-5-suivi.png` (fiche française)
et `iphone-en-1-accueil.png` → `iphone-en-5-suivi.png` (fiche anglaise).
L'appli est réglée « iPhone seulement » : pas besoin de captures iPad.

---

## 2. Confidentialité de l'app (App Store Connect → Confidentialité de l'app)

**Collectez-vous des données ?** Oui. **Utilisées pour vous suivre (tracking) ?** Non, pour aucune.
Toutes les données ci-dessous sont **liées à l'identité** de la personne (elles sont rangées dans son compte).

| Type de données (nom Apple) | Utilisation |
|---|---|
| Coordonnées → **Adresse e-mail** | Fonctionnalités de l'app |
| Coordonnées → **Nom** (prénom) | Fonctionnalités de l'app |
| Contenu utilisateur → **Autre contenu utilisateur** (objectifs, tâches, discussions avec Buddy, compteurs, cagnottes) | Fonctionnalités de l'app |
| Identifiants → **Identifiant utilisateur** | Fonctionnalités de l'app |
| Identifiants → **Identifiant de l'appareil** (jeton des notifications) | Fonctionnalités de l'app |
| Données d'utilisation → **Interactions avec le produit** (tâches cochées, série) | Fonctionnalités de l'app, Analyses |

Pas de localisation, pas de contacts, pas de santé, pas de données financières, pas de publicité.

---

## 3. Classification par âge (questionnaire)

Répondre **Aucun / Non** partout (violence, sexe, langage grossier, drogues, jeux d'argent, horreur…),
**Accès illimité au web : Non**, **Contenu généré par les utilisateurs partagé entre eux : Non**.
S'il y a une question sur un **assistant / chatbot IA** : **Oui** (le coach Buddy), avec des garde-fous.
Âge minimum selon nos conditions : 15 ans.

---

## 4. Notes pour l'équipe d'examen d'Apple (App Review Information)

- **Connexion requise** : Oui → e-mail et mot de passe du **compte test** (le même que pour Google ; tape-les toi-même).
- **Coordonnées** : ton prénom, nom, téléphone, `contact@buddycoach.app`.
- **Notes** (à coller) :
```
Buddy is a personal AI coach that helps people stick to their goals: the user chats with Buddy, which turns goals into small daily tasks, sends reminders (native push notifications) and tracks streaks and badges.

Test account: see the credentials above. Premium features are already unlocked on this account, so every screen can be reviewed. No purchase is offered inside the iOS app.

Account deletion: Settings (gear icon) → bottom of the page → "Delete my account".
Notifications: Settings → Notifications → "Turn on", or after creating a task with a time.
```
