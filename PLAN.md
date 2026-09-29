# Buddy – Project Plan

Buddy is a web app with an AI companion (a kind but demanding coach) that helps people stick to their goals.
This is a **learning project**: simple code we understand beats perfect code we don't.

## Tools we use

| Job | Tool | Everyday comparison |
|---|---|---|
| The companion's "brain" | Claude API, model **Haiku 4.5** | A very smart pen-pal we send messages to |
| Run our code on the computer | **Node.js** | The engine that makes our JavaScript run outside a browser |
| Database + user accounts | **Supabase** | A filing cabinet in the cloud, with a lock per person |
| Reminder emails | **Resend** (easiest for beginners) | A post office we hand letters to |
| Save the code | **GitHub** | A safe deposit box with a history of every version |
| Put the app online | **Vercel** | Renting a shop window so friends can visit |

## Phases

- [x] **Phase 1 – Mini-Buddy**: one page, write my goal and chat with the companion. No accounts, no database.
- [x] **Phase 2 – Memory**: save goal and conversations in Supabase so nothing is lost when the page closes.
- [x] **Phase 3 – User accounts**: each person signs up and has their own goals and conversations.
- [x] **Phase 4 – Design**: make the site look good (owner finds the current look "horrible"). Added by the owner on 2026-09-24.
- [x] **Phase 5 – Buddy's personality, in depth**: rework the personality prompt together (tone, examples, how it reacts to progress/excuses). Added by the owner on 2026-09-24.
- [ ] **Phase 6 – Check-ins**: log completed tasks; the companion knows about them.
- [ ] **Phase 7 – Reminders**: reminder emails based on the goal and chosen reminder types (max 3 per day).
- [x] **Phase 8 – Online**: put the app on Vercel and share a link with friends. → **https://buddycoach.app** (done 2026-09-26)
- [x] **Phase 8b – Bilingual FR/EN** (owner's request 2026-09-26): whole interface, Buddy, e-mails and daily phrases in French or English; automatic detection + FR/EN switch; built so more languages can be added later. → dictionary in `public/i18n.js`; SQL `supabase-phase8b.sql` (column `profiles.language`) to run in Supabase.
- [ ] **Phase 9 – Animated Buddy (Rive)**: the owner makes a real animated character in Rive (`.riv` file with a state machine: signals "réflexion" and "idée"); Claude swaps it in for the static poses. Owner wants to do this at the very end.

## Rules we follow

- One phase at a time. At the end of each phase: how to test it, a 3–5 sentence explanation, then wait for OK.
- Secret keys live only in a `.env` file that the owner fills in. `.env` is never sent to GitHub/Vercel or shown in the web page.
- Check for secret keys before every upload to GitHub or Vercel.
- The companion's personality lives in its own file (`companion-prompt.md`) so it can be read and edited.

## Where we are right now

**Phases 1–5 – DONE.** **Phase 6 (Check-ins → real daily app) – code written, waiting for owner setup + test.**

Phase 6 (owner's brief: "Objectifs → actions → exécution → suivi → Buddy → amélioration"):
1. [x] 6 fixed categories (sport, etudes, religion, finances, voyages, quotidien) defined ONCE in `public/shared.js` (used by both page and server), along with `MAX_TASKS = 4` and the stats calculations (`computeStats`: today, week since Monday, streak, best streak over 28 days, 4 weeks, per-task last 7 days).
2. [x] `supabase-phase6.sql`: goals get `category`, `reason`, `deadline`, `progress`, `plan`, `difficulties`; new tables `tasks` (soft delete via `archived_at`, history kept) and `task_logs` (one row = task done that day).
3. [x] Server routes: `/api/state` (everything), `PATCH /api/profile`, `POST/PATCH/DELETE /api/goals`, `POST/PATCH/DELETE /api/tasks` (max 4 active enforced), `POST /api/tasks/:id/check`. The page sends its local date (`today`).
4. [x] Buddy's context now contains all goals (id, category, reason, plan, difficulties), today's tasks with the last 7 days ✓/✗, week stats, streak, and the chosen topic. Form fields changed: `objectif_id`, `nouvel_objectif` {titre, categorie, raison}, `plan`, `difficulte` (replace the old `objectif`). Safety rule added (self-harm → 3114 / 15, never a goal).
5. [x] Page: real pages via the sidebar (#accueil, #objectifs, #suivi, #outils, #parametres); dashboard cards use real data; goal & task dialogs (`<dialog>`); floating Buddy button; "Alors, on travaille sur quoi aujourd'hui ?" topic chips when coming back after 2 h+ (and via the "Changer de sujet" button); "Parler à Buddy" on each goal. Tools = focus timer only. Settings = first name, coaching style, theme, account. Search box and "Exemple" badges removed.
6. [x] Tested: stats on a made-up week (correct), Buddy against the API with realistic data (uses real numbers, notes difficulties).
7. [x] Owner ran `supabase-phase6.sql`. Bug found: an old server copy kept port 3000, so the new server silently failed to start (now `app.listen` prints a clear "porte 3000 déjà occupée" error and exits).
8. [x] Visual feedback added on save/delete: toast message at the bottom, gold "flash" on the new/edited item (POST routes now return the new `id`), Buddy thumbs-up on new goal/task.
9. [x] Task scheduling: every day / certain weekdays (`tasks.days`, 1=Mon…7=Sun) / one date (`tasks.on_date`) — `supabase-phase6b.sql`. Rule is now "4 tasks max PER DAY" (`dailyLimitError` in shared.js, checked by the server). "Aujourd'hui" shows only today's tasks; others under a folded "Autres jours" list. Stats only count a task on its own days. Buddy's context lists today's tasks and "tâches des autres jours" with their schedule. Tested on a made-up week.
10. [x] Owner's choice: limit raised to **10 tasks per day** for the test phase (`MAX_TASKS` in `public/shared.js`, the only place to change; to be revisited for a paid version). Texts no longer hard-code "4"; Buddy still advises keeping few tasks. The 2 garbled messages (ids 27–28) were deleted at the owner's request.
11. [x] Anthropic had a passing 500 error → server now retries up to 4 times and shows a clear message per cause (`claudeErrorMessage`).
12. [x] Tasks editable everywhere by tapping them (today list + pencil button, goal cards, Suivi rows).
13. [x] 7th category "Autre" (✨, `--teal`).
14. [x] Daily motivational phrases (sidebar = short, quote card = long): `GET /api/quote`, written by Claude once per day per user from their goals/domains, cached in `profiles.quote_day/quote_short/quote_long` (`supabase-phase6c.sql`), never the same as yesterday, careful attribution rules. Fallback = the old default phrases.
15. [x] Owner ran `supabase-phase6b.sql` and `supabase-phase6c.sql` (both verified in the DB on 2026-09-25).
16. [ ] Owner tests the latest changes (tap-to-edit tasks, "Autre" category, daily phrases) → OK for Phase 6.

**NEXT SESSION (paused 2026-09-25):**
1. Owner restarts the server (`npm.cmd start`) and tests item 16.
2. Owner creates the Resend account + puts the key in `.env` (`RESEND_API_KEY=`, line already there) — steps were given in chat: resend.com → sign up with the SAME e-mail as the Buddy account → API Keys → Create (Sending access) → copy `re_…` into `.env`.
3. Claude builds Phase 7 (e-mail reminders, see below).

## Phase 7 – E-mail reminders (owner's spec, 2026-09-25)
Push notifications later (when there's a real app); e-mails for now, via **Resend**:
- 5 minutes before each task that has a time;
- a morning e-mail: good luck + brief reminder of goals;
- an evening e-mail: recap of the day's tasks + "how did it go?";
- every e-mail written fresh by Buddy (never the same sentence), in the user's coaching style.
Note: the original "max 3 per day" rule is replaced by this spec; settings will let the user switch each type on/off and choose morning/evening times.
Limits: the server runs on the owner's PC, so e-mails are only sent while it's on (fixed in Phase 8 with Vercel cron). Without a verified domain, Resend only sends to the owner's own address (the one used to sign up to Resend) → domain needed in Phase 8 to e-mail friends.
Steps:
1. [x] Owner created a Resend account (with a DIFFERENT e-mail than the Buddy account) + key in `.env`.
2. [x] Claude built `emails.js` (the "post office"): a check every minute (`startEmailScheduler`, started by `server.js`), morning/evening e-mails within 1 h after the chosen time, task reminders 5 min before tasks that have a time and aren't done. Each e-mail written by Claude (`writeEmail`, structured `{sujet, message}`) in the user's style, gender-neutral, no invented numbers; branded HTML (`emailHtml`). `email_log` table prevents double sending. Library: `resend` (sender `onboarding@resend.dev` until a domain is verified).
3. [x] Settings card "Rappels par e-mail": reception address (`notify_email`, needed because the owner's Resend e-mail ≠ Buddy e-mail), 3 on/off switches + morning/evening times, "M'envoyer un e-mail de test" button (`POST /api/email/test`). Everything is OFF by default (opt-in), so test accounts don't get e-mails.
4. [x] Sample e-mails generated and reviewed (fixed: gendered words, a changed number).
5. [x] Owner ran `supabase-phase7.sql`. Bug "settings get erased on save" = an OLD server (started 25/09 00:07) was still running → stopped by Claude.
6. [x] Owner's choice: e-mails ON by default, sent to the account e-mail by default; users turn them off in Paramètres (`supabase-phase7b.sql` flips the defaults + ticks existing profiles; server/scheduler defaults = true; users without a profile row get the defaults too).
7. [x] Owner ran `supabase-phase7b.sql`, set the Resend address, received the test e-mail and likes it.
8. [x] Religion rule made deterministic: `religionRule(goals)` in `shared.js` (used by e-mails and daily phrases) → no goal in category Religion = NO religious expression at all; otherwise only the words of THAT person's religion. Chat prompt tightened the same way ("never assume someone is Muslim"). E-mails also get a random "angle" (`ANGLES` in emails.js) so they never look alike. Tested on 3 profiles (none / Christian / Muslim) → correct.
9. [x] Owner chose: weekly review + streak joker + badges + cost guardrails + delete-my-account (2026-09-26). Built:
   - **Streak rework** (`computeStats` in shared.js): 90-day history (`HISTORY_DAYS`), each day = active / rest / missed / joker / todo. Rest days (nothing planned) no longer break the streak (was unfair since tasks can be on certain days only). **Joker**: first missed day of each week (Mon–Sun) is forgiven automatically (`jokerUsedOn`). Shown on the week card, Suivi tiles, heatmap (violet dashed), Buddy's context.
   - **Badges**: 12 badges in `BADGES` (shared.js) + `badgeFacts`; earned badges stored forever in `user_badges`; checked on every `/api/state` (`updateBadges`), new ones returned in `newBadges` → celebration dialog + Buddy "bravo". Badge grid on the Suivi page.
   - **Weekly review**: "Faire mon bilan de la semaine" button (Suivi) + "🧭 Bilan de la semaine" topic chip + `#bilan` link → `/api/chat` with `review: true` adds a "DEMANDE SPÉCIALE" to Buddy's context (numbers, 1–2 wins, 1 blocker, ONE adjustment, asks to validate). `profiles.reviews_count` (badge). Sunday evening e-mail "weekly" replaces the daily recap (`email_weekly`, on by default, toggle in Paramètres).
   - **Cost guardrails**: `MAX_MESSAGES_PER_DAY = 40` (shared.js, 429 message), history sent to Claude 60 → 40 messages, **prompt caching** of the fixed personality part (system split in 2 blocks; measured: 0.93 ¢ → 0.14 ¢ on the following messages within 5 min), token usage logged as "💰" in the Terminal. Owner should also set a monthly spend limit in the Anthropic console.
   - **Delete my account**: Paramètres "danger zone" → type SUPPRIMER → `DELETE /api/account` (empties every table for the user, then `auth.admin.deleteUser`).
   - `supabase-phase7c.sql` (email_weekly, reviews_count, user_badges). Tests: streak/joker/rest days (5/5 ✅), cache (✅), sample weekly e-mail (fixed: weekday names given to Claude).
10. [x] Owner ran `supabase-phase7c.sql`.
11. [x] BUG (2026-09-25): ticks lost after F5 + stats stuck. Cause: server started 20:11, code changed 20:30 → old server didn't send `badges` → the page's optimistic `render()` crashed BEFORE the tick was sent. Fixes: `toggleTask` now sends the save FIRST; `render()` draws each part in its own try/catch; **`APP_VERSION`** in shared.js compared between page and `/api/state` → toast "Le serveur n'est pas à jour : redémarre-le" if they differ (bump it on each big change!).
12. [x] Goals ↔ tasks connection: `goalWeek()` in shared.js → each goal shows "Cette semaine : X/Y tâches faites" (automatic, from linked tasks) on the home card, Mes objectifs and Suivi; the % stays the manual "how close to the goal".
13. [x] Owner confirmed the "Cette semaine : X/Y" lines work.
14. [x] Goal % was manual (stayed 0%). Now `goalProgress()` in shared.js: goals WITH linked tasks → automatic % = regularity over the last 4 weeks (done/planned, today counts only once done); goals WITHOUT tasks → manual % (slider in the edit dialog, hidden otherwise). Used by the page, Buddy's context and the e-mails. `APP_VERSION` bumped to 2026-09-26a. The server now runs from the app's preview panel (`.claude/launch.json`, `autoPort: false`).
15. [x] Owner OK with the automatic %.

## Phase 8 – Online (started 2026-09-26)
Preparation done by Claude:
1. [x] **Time zones**: `profiles.timezone` (`supabase-phase8a.sql`), sent automatically by the page (`Intl…timeZone`). In shared.js: day arithmetic (`addDays`, `isoDay`, `mondayOf`) now in UTC (same result on any server); real instants (`dayKey`, `timeHHMM`) use the person's zone via `withTimeZone(tz, fn)`. Server computes Buddy's context and badges in the person's zone; the e-mail tick computes each person's own "today" and "now" (default Europe/Paris). Message limit = last 24 h (zone-independent). Tested with the server set to UTC, Auckland and Los Angeles → identical results.
2. [x] **Reminders online**: `runEmailTick()` exported by emails.js; new route `/api/cron/tick` protected by `CRON_SECRET` (header `Authorization: Bearer …` or `?key=…`) → an external free cron (e.g. cron-job.org) will call it every minute. Locally the `setInterval` still runs. `server.js` only calls `app.listen` when not on Vercel (`process.env.VERCEL`) and does `export default app`.
3. [ ] Owner runs `supabase-phase8a.sql`.
4. [x] **Buddy becomes an agent** (owner's request, before going online): new `actions` array in `BUDDY_FORM` (creer_tache, cocher_tache, decocher_tache, modifier_tache, supprimer_tache, progression_objectif). Executed by `runBuddyActions()` through the SAME task functions as the page's buttons (`createTask`, `updateTask`, `archiveTask`, `setTaskDone`, `UserError` for refusals) → same rules (10/day, own tasks only). Results appended under Buddy's message ("✅ Tâche ajoutée…", "⚠️ Pas possible…") and stored, so Buddy sees what he already did. Prompt: ask before acting; act directly only on explicit requests or "I did X"; deletion always confirmed; never invent ids; don't repeat details in the text. Task ids + today's ISO date added to Buddy's context. Tested on 6 situations → 6/6 correct.
5. [ ] Owner tests Buddy's actions in the app.
6. [x] Owner's request: the big speech bubble next to Buddy (the old `.bubble` / `setBubble()`, which dumped Buddy's whole last reply) is replaced by a compact card `#resume-card` beside Buddy (not on him): "💬 On reprend où on s'était arrêtés ?", "Tu m'avais dit : « … »" (latest user message of 3+ words), "Buddy : « … »" (his reply, action lines stripped), "Il y a 2 jours", "Reprendre →" (whole card opens the chat). No conversation yet → "👋 On commence ? « Parle-moi d'un objectif… » Parler à Buddy →" (never a fake conversation). `renderResume()` is part of `render()`, so it follows the real messages. Mobile: card top-left, Buddy's face stays visible, Buddy's reply line hidden. Checked at 1280 px and 375 px.
7. [x] Security check (manual, because `/security-review` needs a Git repo — to re-run once Git is set up): OK on secrets, per-user filtering, RLS, HTML escaping, cron secret. Fixed: chat messages capped at 2 000 characters; test e-mails capped at 5/day (logged in `email_log` as kind "test"); goal/task titles and reasons length-limited on the server too. TODO before friends: turn "Confirm email" back ON in Supabase (otherwise someone could sign up with another person's e-mail and Buddy would e-mail them) + set Supabase Site URL to the Vercel address.
8. [x] Owner installed Git and created GitHub account **proaymenkhelifa-source**. Claude: `git init -b main`, author = `proaymenkhelifa-source@users.noreply.github.com` (keeps the real e-mail private), stronger `.gitignore` (.env.*, .vercel/), design images moved to `design/` (not served), secret scan of staged files → clean, first commit, remote `origin` = https://github.com/proaymenkhelifa-source/buddy.git.
9. [x] Owner created the PRIVATE repo "buddy" and pushed (browser sign-in via Git Credential Manager; the Terminal needed the PATH refresh). Claude can now commit/push (credentials stored by Git, never seen).
10. [x] Vercel prep (checked against Vercel's Express docs: `server.js` auto-detected, `export default app`, `public/` served by the CDN, `express.static` ignored): prompt read via `new URL("./companion-prompt.md", import.meta.url)` so it's bundled; `CRON_SECRET` generated into `.env` (never shown). Pushed as commit "Préparation de la mise en ligne sur Vercel".
11. [x] Owner created the Vercel account (GitHub login), imported the repo, set 6 env vars, deployed → **https://buddy-delta-five.vercel.app**. Every push to GitHub `main` redeploys automatically.
12. [x] Fix: on Vercel `express.static` is ignored and "/" returned 404 → `app.get("/")` sends `public/index.html`. Checked online: page, API (401 without login), cron (403 without secret), secret files not served (404), no console errors.
13. [x] Owner added `APP_URL` on Vercel; Supabase Auth: Site URL + Redirect URL `https://buddy-delta-five.vercel.app/**`; "Confirm email" turned back ON.
14. [x] Owner set up cron-job.org (every minute, header `Authorization: Bearer <CRON_SECRET>`). Claude checked online: right secret → 200 `{"ok":true}`, wrong secret → 403.
15a. [x] Owner set a monthly spend limit of $15 on the Anthropic console (2026-09-26).
15b. [~] "Confirm email" turned OFF again by the owner (temporary, 2026-09-26). Supabase's built-in e-mail only sends to project team members → friends can't receive the sign-up confirmation. Temporary: turn "Confirm email" OFF (no abuse risk while Resend can only e-mail the owner). Real fix: buy a domain (suggested: via Vercel), verify it on Resend, switch `FROM` in emails.js, plug Supabase Auth into Resend SMTP, then turn "Confirm email" back ON.
15c. [x] Owner bought **buddycoach.app** on Vercel ($9.99 first year, ~$15/yr after), kept the free Hobby plan. Added to Resend with "Auto configure" (Vercel DNS) → status Pending (DNS propagation). Region: North Virginia (fine).
15d. [x] `EMAIL_FROM` env var (emails.js) → sender switchable without code change. Pushed.
15e. [x] Resend **Verified**; https://buddycoach.app serves the app (www certificate still being issued by Vercel). Owner set on Vercel `APP_URL=https://buddycoach.app` + `EMAIL_FROM=Buddy <buddy@buddycoach.app>`; Supabase Site URL + redirect for buddycoach.app; Supabase custom SMTP via Resend (dedicated key "supabase"); "Confirm email" back ON. Done list was: on Vercel set `EMAIL_FROM` = `Buddy <buddy@buddycoach.app>` and `APP_URL` = `https://buddycoach.app` → redeploy; Supabase Auth: Site URL + redirect URL for buddycoach.app; Supabase custom SMTP = Resend (host smtp.resend.com, port 465, user `resend`, password = Resend API key, sender buddy@buddycoach.app); turn "Confirm email" back ON; test with a friend's address.
15f. [x] Test e-mail went to the saved Gmail (the Yahoo address shown wasn't saved) → the test button now saves the displayed settings first. Removed the outdated "only when the server is on" sentence.
15g. [x] Owner's request (mobile): sign-in / sign-up is now a full page `#auth-screen` (URL #inscription / #connexion, "Retour" button, phone back button works, switch link) instead of a card appended below the hero. Checked at 375 px.
15. [ ] Owner tests online (login, chat, confirmation e-mail with a new account) → send the link to friends. Friends' e-mails still need a verified domain on Resend (optional).
Next steps: GitHub account + Git install (owner) → secret check + first push (Claude) → Vercel account + env vars (owner) → deploy fixes (prompt file path on Vercel, APP_URL) → cron-job.org → Supabase Auth URL settings → test → (optional) domain for friends' e-mails.
Later ideas kept: installable app with push notifications (PWA), accountability buddy ("binôme"), check a task from the e-mail.
Photo slots are now `public/images/` : `hero.jpg`, `quote.jpg`, `sport.jpg`, `etudes.jpg`, `religion.jpg`, `finances.jpg`, `voyages.jpg`, `quotidien.jpg` (optional).
Notifications/reminders settings → Phase 7.

Phase 5 (owner's brief: intro, 3 coaching styles, goal discovery, honest analysis, plan, check-ins, context, 6 emotions):
1. [x] `companion-prompt.md` rewritten from the brief. `{{CONTEXTE}}` at the bottom is filled by the server (date, first meeting?, style, goal, plan).
2. [x] Claude now answers with **structured outputs** (a JSON "form", `BUDDY_FORM` in `server.js`): `analyse` (logged in the terminal as "🧠 Buddy pense"), `emotion` (neutral/happy/celebrating/understanding/strict/motivational), `message`, `style` (unchanged/military/supportive/balanced), `objectif`, `plan`. The server saves style + plan in `profiles`, a new goal in `goals`, and the emotion with each message.
3. [x] Page: emotion → pose (neutral=repos, happy=content, celebrating=bravo, understanding=idee, strict=fache, motivational=motivation); the pose stays until the next reply. While the user types → `repos` "Buddy t'écoute…" (once). Style badge in the chat header. The old "Quel est ton objectif ?" screen and `/api/goal` route were removed: on first visit the chat opens and Buddy speaks first (hidden starter line "[La personne ouvre l'application Buddy.]" is prepended to the conversation, never stored).
4. [x] Tested 5 situations directly against the API (first meeting, style choice, excuse, success, bereavement) → correct emotions after 2 prompt fixes.
5. [x] Owner asked for a more human, friend-like Buddy: asks the first name at the start (new form field `prenom`, saved in `profiles.first_name`, shown in "Salut …" and the account menu), uses it occasionally; natural spoken tone; vocabulary adapted to the goal's domain (sport, work, religion…). For Islam: akhi/ukhti only when gender is known, expressions (in shaa Allah, barak Allahu fik…), ONLY well-known hadiths/verses with source, never invented, no fatwas. No Markdown in replies. Tested against the API.
6. [ ] Owner runs `supabase-phase5.sql` (creates `profiles` with `first_name`, adds `messages.emotion`), restarts the server, tests.
Not in this phase (on purpose): commitments/progress tracking → Phase 6; reminder emails + notification preferences → Phase 7 (the prompt tells Buddy not to promise reminders yet).

Plan for Phase 4 (agreed 2026-09-24):
1. [x] Owner generated a 6-pose character sheet with ChatGPT (`public/buddy/planche.png`, beige background, not transparent). Claude cut it into `repos`, `content`, `bravo`, `idee`, `fache`, `motivation` (.png, 270x914 each). No "thinking" pose → `repos` + a swaying animation is used instead.
2. [x] Claude put the character next to the goal, above the chat: breathes at rest, sways while waiting ("Buddy réfléchit…"), pops to `idee` when the reply arrives, back to `repos` after 2.5 s. `content`/`bravo`/`fache`/`motivation` are preloaded but unused → to be driven by Buddy's mood in Phase 5.
   - DONE 2026-09-27: new Buddy without brand logos, 16 emotions (`public/buddy/*.webp`) + outfits chosen by the app according to the topic (sport, student, traveler, qamis only for an Islam-related goal, military for the military style; sensitive moments = normal outfit). New "B" logo (`public/icons/logo.png`). TODO: business suit sheet (Finances topic keeps the normal outfit until then); maybe regenerate the emotions sheet in HD (4 sheets of 4).
3. [x] Owner wrote a design prompt (dark, premium, orange/gold accent, cinematic evening room, glass cards, dashboard). Claude rebuilt the front-end, now split into 3 files:
   - `public/index.html` (structure): landing page (hero + sign-up/login card) and app (nav, onboarding, dashboard).
   - `public/style.css` (look): color variables, dark + light themes, the CSS "scene" (sunset sky, skyline, window, desk, laptop) behind Buddy, responsive rules (1100px / 760px).
   - `public/app.js` (behaviour): same Supabase/server logic as before + theme toggle, user menu, typing dots, Buddy poses.
   - Pose images made transparent (beige background removed, cropped to the upper body; the desk hides the cut).
   - Dashboard cards "Aujourd'hui", "Cette semaine", "Mes objectifs", categories show EXAMPLE data (badge "Exemple") → real data in Phase 6. Nav items other than "Accueil" and the search button are dimmed ("bientôt").
   - Ticking a task in "Aujourd'hui" makes Buddy jump with the `content` pose (not saved yet).
4. [x] Owner sent a ChatGPT mockup (`public/buddy/ChatGPT Image 24 sept. 2026, 21_14_04.png`). Claude rebuilt the app to match it: left sidebar (logo mountain + nav + "Discipline aujourd'hui…" card), topbar floating over a big cinematic banner (greeting + "C'est parti" + Buddy + speech bubble + desk), cards row (Aujourd'hui with date & progress bar / quote / Mes objectifs), second row (Cette semaine ring gradient / Mes catégories photo cards). The chat moved into a panel sliding in from the right (opened by "C'est parti" or the bubble); the bubble shows Buddy's last reply. Default banner pose = `motivation`.
   - Photo slots with drawn fallbacks, in `public/images/` (empty for now): `hero.jpg` (room at sunset, NO character), `quote.jpg`, `sport.jpg`, `etudes.jpg`, `spiritualite.jpg`, `voyages.jpg`.
5. [ ] (Optional, anytime) Owner generates the photos for `public/images/`. Design accepted by the owner (moved on to Phase 5).
Note: the owner's character must be their own creation (not a copy of Meta's or Akinator's character).

Next steps for Phase 3:
1. [x] Owner runs `supabase-phase3.sql` in SQL Editor (wipes test rows, adds `user_id` column to both tables).
2. [x] Owner turns OFF "Confirm email" in Supabase (Authentication > Sign In / Providers > Email) for easy testing. Re-enable before sharing with friends (Phase 8).
3. [x] Owner pastes the Supabase **publishable** key into `.env` (`SUPABASE_PUBLISHABLE_KEY` line already added, empty).
4. [x] Claude updated `server.js` (a `requireUser` "bouncer" checks the login token; every read/write is filtered by `user_id`; new `/api/config` route gives the page the public key) and `public/index.html` (login/sign-up screen, logout button; uses supabase-js from the jsdelivr CDN).
5. [x] Owner tests with two different accounts: each sees only their own goal and conversation.

Files map:
- `server.js` – the "kitchen": serves the page, checks who is logged in, reads/writes Supabase, forwards messages to Claude (model `claude-haiku-4-5`). Holds the secret keys.
- `public/index.html` – the page: login screen → goal box → chat. Asks the server for everything; stores nothing itself except the Supabase login session.
- `companion-prompt.md` – Buddy's personality. `{{GOAL}}` is replaced with the user's goal. Re-read on every message.
- `supabase-setup.sql` (Phase 2) and `supabase-phase3.sql` (Phase 3) – the table recipes, already run in Supabase.

Known gotchas:
- The app's Terminal was opened before Node was installed, so `npm` may be "not recognized". Fix: fully restart the Claude app, or run the PATH refresh command in the Terminal.
- Windows blocks `npm` (script execution policy). Always use **`npm.cmd start`** instead of `npm start` (no need to change security settings).

## Log

- 2026-09-23: Plan created. Found that Node.js and Git are not installed yet.
- 2026-09-23: Node installed. Phase 1 code written; server starts and page loads (tested without a key). The owner now communicates in French.
- 2026-09-23: Owner added their API key to `.env` and tested the chat. Buddy's personality was made much tougher (drill-sergeant style, with guardrails). Phase 1 validated by the owner.
- 2026-09-23: Phase 2 done: Supabase project `buddy` created, tables `goals` + `messages` (RLS on, no policies; server uses the secret key). Owner confirmed the conversation survives a page refresh. Phase 3 code written.
- 2026-09-24: Phase 3 setup finished (SQL run, email confirmation off, publishable key in `.env`); server starts with `npm.cmd start`. Session paused here. **NEXT SESSION: owner runs the two-account test (step 5 of Phase 3), then Claude gives the Phase 3 summary, ticks it, and waits for OK before Phase 4.**
- 2026-09-24: Two-account test passed (data correctly separated in Supabase). Fixed two page bugs: fields not cleared on logout, and account bar still visible when logged out (`.hidden` now uses `!important`). Phase 3 validated.
- 2026-09-24: Phase 4 design done (from the owner's prompt + ChatGPT mockup). Phase 5 personality/emotions code written and tested against the API.
- 2026-09-24: Owner ran `supabase-phase5.sql`, asked for a more human Buddy (first name, friend tone, domain vocabulary, careful hadith rules) → done. Then sent the Phase 6 brief → built (see above).

## Friends' feedback
- 2026-09-28 (friend's idea "persistence"): auto-saved drafts in the browser (`localStorage`, prefix `buddy-draft-`, one set per user): chat message (reopens the chat), "New goal" / "New task" windows (reopen with their content), login e-mail (never the password). Cleared when sent/saved/cancelled, and all cleared on logout. A failed chat message goes back into the input. Tested (7 scenarios).

## Where sign-ups come from (2026-09-28)
- Owner decided: NO waitlist (Buddy already works → people sign up directly).
- Instead: each network gets its own link (`buddycoach.app/?src=insta-fr`, `?src=tiktok-en`…). The page keeps the FIRST tag seen (`localStorage` "buddy-source"), sends it with the sign-up (Supabase `user_metadata.source`, so it survives opening the confirmation e-mail in another browser), and `/api/state` files it once in `profiles.source`. SQL: `supabase-source.sql` (owner to run). See it in Supabase → Table Editor → profiles → column `source`.
- Before pushing the carousels: watch the Anthropic budget ($15/month limit would be hit fast with many users) + legal pages (privacy policy, terms).

## Phone notifications (2026-09-28)
- Web Push (no extra service, free): `public/manifest.webmanifest` + icons 192/512 (installable app), `public/sw.js` (the "mailman" showing notifications), `push.js` (server side, library `web-push`, VAPID keys in `.env` → to copy to Vercel: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT). Table `push_subscriptions` + `profiles.email_with_push` (`supabase-push.sql`). Routes `/api/push/subscribe|unsubscribe|test`.
- Each reminder is written ONCE by Claude (e-mail + short notification) → sent as a notification if the person has turned them on, otherwise by e-mail (or both if "Aussi par e-mail"). Home banner "Active les notifications" + Settings card; iPhone: guide to add Buddy to the home screen (required by Apple).
- New tone for e-mails/notifications (owner: "less childish, less ad-like, more direct and personal"): rules in `writeEmail` (emails.js). Samples reviewed.

## Brand redesign (2026-09-29)
- Owner's brief: the old look (dark, cinematic photos, realistic character) "looked too AI". New identity from the boards in `design/` (not committed): light & airy, palette Primary #2EC4A6 / Deep Navy #0F172A / Mint / Sky / Slate / Snow, titles in **Calistoga**, UI in **Plus Jakarta Sans**, filled rounded icons (**Phosphor**, via unpkg; `drawIcons()` in app.js translates the old Lucide names), light theme by default (dark = navy variant, kept; choice stored under `buddy-theme-choice`).
- New mascot: the round mint character with a navy backpack, generated by the owner on a magenta background (`design/image 1-10.png`), cut out + aligned on the same frame (`public/buddy/*.webp`). Only in the chat bubble, the chat avatar, the banner (and the public home hero), the end of the day timeline, and — discreet, "chilling" — in the guided tour.
- Conversation themes now show **scenes** instead of outfits (`OUTFITS` in app.js: sport = running, études = laptop, voyages = map, islam = prayer mat, finances = coin + piggy bank, quotidien = coffee); strong emotions and sensitive moments keep their own expression. The "military" style no longer changes the picture (only the tone).
- Banner: new **day timeline** (`renderTimeline` / `drawTimelinePath`): today's tasks by time, category icon + shortened title, the curve slides to the next task at each check, ends on Buddy who congratulates when everything is done.
- Category cards use the new illustrations (`public/images/<cat>.jpg`, "Autre" = mint + sparkle icon); new app icons from `design/logo .png`.

## Draft goals (2026-09-30)
- While a new goal is being defined with Buddy (not validated yet), Buddy fills `objectif_en_cours` → the server saves it as a **draft** goal (`goals.draft = true`, SQL `supabase-drafts.sql` to run in Supabase). Drafts are left out of stats, e-mails, badges and quotes (`loadAll` returns `goals` and `drafts` separately); Buddy sees them in its context.
- "Mes objectifs" shows drafts first, marked "Incomplet", with **Continuer avec Buddy** (reopens the chat on that draft) and **Abandonner** (deletes it). When Buddy validates the goal (`nouvel_objectif`), the draft becomes a real goal (same id).

## Launch prep (owner's 4 changes, 2026-09-30) — one at a time, wait for OK after each
- [x] **1. Buddy Premium screen**: shown once right after sign-up (before the guided tour), when `profile.plan` is empty. Choice "premium"/"free" + date saved in `profiles.plan` / `profiles.plan_chosen_at` (SQL `supabase-premium.sql`; stats query inside). Both buttons lead to the full app (no real payment yet: App Store / Google Play later). Settings → "Ton offre" reopens it.
  - **DEMO MODE switch**: `DEMO_MODE` in `public/shared.js` (true = everyone gets everything). Free limits ready in `FREE_LIMITS` (5 tasks/day, 50 messages/day, "balanced" style only, 3 reminders/day), enforced server-side (tasks, chat, style, reminders in emails.js) only when `DEMO_MODE = false`; then the short Premium screen shows on a limit (`premium` field in API errors). Premium caps: `MAX_TASKS` (10), `MAX_MESSAGES_PER_DAY` (raised 40 → 100, anti-abuse).
  - Phone blocking ("Bloque ton téléphone pendant ton focus") = listed perk only, nothing built yet.
- [ ] 2. Home page: app screenshots + Free vs Premium section.
- [ ] 3. Motivating first day (no "0 %", encouraging empty states, Buddy rule for fresh starts).
- [ ] 4. Legal pages (legal notice, terms incl. Premium, privacy policy) with [PLACEHOLDERS].

## Marketing & next steps
See CONTEXTE-MARKETING.md (summary of the Cowork conversation of 2026-09-27/28: carousels, launch plan, waitlist, PWA, Stripe, stores).
