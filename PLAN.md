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
- [ ] **Admin / CRM** (owner's request 2026-10-08): step 1 = admin page `buddycoach.app/admin` (`public/admin.html` + route `GET /api/admin/users` in server.js, reserved to the e-mails in `ADMIN_EMAILS`): key numbers, sign-ups per source (`?src=` links), sign-ups over 30 days, list of all users with filters + CSV export. Code written; owner fills `ADMIN_EMAILS` in `.env` and in Vercel, then tests. Step 2 (later) = a real standalone CRM built from scratch (notes, follow-ups…).

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
  - **DEMO MODE switch**: `DEMO_MODE` in `public/shared.js` (true = everyone gets everything). Free limits ready in `FREE_LIMITS` (5 tasks/day, 20 messages/day (owner lowered it from 50 on 2026-09-29), "balanced" style only, 3 reminders/day), enforced server-side (tasks, chat, style, reminders in emails.js) only when `DEMO_MODE = false`; then the short Premium screen shows on a limit (`premium` field in API errors). Premium caps: `MAX_TASKS` (10), `MAX_MESSAGES_PER_DAY` (raised 40 → 100, anti-abuse).
  - Phone blocking ("Bloque ton téléphone pendant ton focus") = listed perk only, nothing built yet.
- [x] **2. Home page**: under the hero, 2 app screenshots (dashboard on computer + chat with Buddy on phone, FR and EN: `public/images/app-desktop-{fr,en}.jpg`, `app-phone-{fr,en}.jpg`, picked by language via `data-src-lang`; replace these 4 files to use your own), then "Gratuit ou Premium ?" (2 cards, side by side / stacked on phone; free numbers come from `FREE_LIMITS`) and a sign-up button. Hero height capped so the next section shows on big screens. Owner's feedback: "C'est parti" now has a down arrow and scrolls to the screenshots (sign-up = button at the bottom + "Se connecter"); screenshots, titles, cards and each perk appear progressively while scrolling (`class="reveal"`, `setupReveal()` in app.js).
  - Owner's feedback: each plan card now has its own button ("Commencer gratuitement" / highlighted "Essayer 7 jours gratuitement"); the choice is kept in the browser (`buddy-plan-wish`) and saved right after sign-up, without showing the Premium screen again. Reveal animations replay when coming back to the home page or scrolling back down.
- [x] **3. Motivating first day**: never "0 %": week ring shows 💪 + "Écris ton premier défi" / "Ta première semaine commence aujourd'hui" / "Nouvelle semaine, nouveau départ"; goals at 0 % show "À lancer"; Suivi page for a new account = one invitation card instead of zero tiles; 0 % tiles → "ta semaine démarre" / "ta série commence aujourd'hui"; friendlier empty states (today, goals, tracking, timeline, greeting). Buddy's prompt: "RÈGLE DES NOUVEAUX DÉPARTS" (first sentence always encouraging when starting or restarting).
- [x] **4. Legal pages** (`public/legal/`: `mentions-legales.html`, `conditions.html` incl. Premium terms, `confidentialite.html`), FR + EN in the same page (`legal.js` picks the app language, FR/EN button). Linked from the home page footer, Settings ("Informations légales") and the sign-up screen ("En créant ton compte, tu acceptes…"). Owner's info = yellow `[PLACEHOLDERS]` to fill in; **to be reviewed by a professional before the official launch** (withdrawal right, consumer mediator, minimum age, sensitive data).
- [x] **Premium bonus jokers** (owner's idea, 2026-09-30): everyone keeps the weekly joker (1st missed day of each week forgiven). Premium adds **3 bonus jokers per calendar month** (`PREMIUM_BONUS_JOKERS`, `bonusJokersFor(profile)` in shared.js), used automatically for the other missed days (`computeStats(..., bonusJokers)` → `bonusJokers`, `bonusLeft`; saved days show as "joker" in the heatmap). Shown as "· +2 bonus ce mois" / "bonus du mois utilisés" on the week card and the Suivi joker tile; listed as a Premium perk (landing card + Premium screen + conditions.html); in Buddy's context and the e-mail prompt. Tested: 4 missed days in 2 weeks → free streak broken, Premium streak kept, 1 bonus left.

## Polish after tester feedback (2026-09-29)
- Calistoga only for real titles (h1, logo, home section titles, Buddy Premium); card titles, subtitles, numbers, dialogs, quote → Plus Jakarta Sans bold, smaller.
- Chat bubble (FAB) always shows Buddy waving (`salut`), with a small wave every few seconds.
- Free trial made obvious: "7 jours de Premium offerts" pill at the top of the home page (scrolls to the plans); Premium card headline "0 € pendant 7 jours" then "puis 9,99 €/mois"; Premium card first on phones.

## Buddy v2 rebrand (decided 2026-09-30) — DONE (logo, colors, typography, 20 poses)
- Owner's new references (sent in chat): **Buddy v2** = same mascot, livelier eyes (navy ovals with 2 white highlights), slightly more vivid mint. **New logo** = mint speech bubble with Buddy's face (same eyes + small smile) + "Buddy" wordmark in a rounded navy font with a smile-shaped underline (white on navy backgrounds). App icon = the bubble on a navy rounded square.
- Rule: Buddy as a full character ONLY where he "lives" (banner, home hero, day timeline, guided tour). Everywhere else Buddy = the bubble: logo next to the name, app icon, favicon, chat header avatar next to "Buddy", the floating chat button (FAB).
- Palette: mint + white + **navy** as a third strong color (app icon, wordmark, dark backgrounds, user message bubbles). Typography: rounded font for logo/titles (match on Google Fonts unless the owner gives the font name), simple readable UI font for text.
- Plan: redraw bubble/logo/app icon/favicon as **SVG** (sharp, bubble expression can change in chat). Owner is generating the 20 poses with ChatGPT (one image per pose, magenta #FF00FF background) into `design/buddy-v2/` named `repos.png`, `salut.png`, `content.png`, `bravo.png`, `idee.png`, `fache.png`, `compassion.png`, `encourage.png`, `inquiet.png`, `fier.png`, `ecoute.png`, `reflechit.png`, `relax.png`, `triste.png`, `scene-sport.png`, `scene-priere.png`, `scene-etudes.png`, `scene-voyages.png`, `scene-quotidien.png`, `scene-finances.png` → cut out with the magenta key (same method as the scratchpad "mascotte.html" tool: key magenta, un-mix edges, align all poses on one shared frame by body centre + feet), then re-do the site-wide integration + regenerate the landing screenshots.
- ✅ **Part 1 done (2026-09-30)**: `public/icons/buddy-bubble.svg` = the bubble logo in SVG (mint #5FE2C3, navy #14284B eyes with white highlights, smile). Used for: logo next to "Buddy" (landing, app sidebar, legal pages), favicon, chat header avatar, floating chat button (68px, waves "coucou"). App icons (`buddy-192/512`, maskable, apple-touch, favicon-64) = the bubble on navy; `logo.png` (e-mails) = the bubble on white.
- Colors in `style.css`: `--primary:#5fe2c3`, `--navy:#14284b`, `--mint:#e8f4f0`, `--on-accent` = navy (text on mint buttons is navy, not white). Buddy's chat bubbles = light mint + navy text; user's bubbles = navy + white text. Dark theme = navy backgrounds (#0d1b33 …).
- Typography: **Nunito 800/900** (rounded) for the logo word and big titles, Plus Jakarta Sans for the rest. The "Buddy" word has a smile-shaped underline (CSS mask, color follows the text).
- Landing screenshots (`public/images/app-*.jpg`) regenerated with the new look.
- ✅ **Part 2 done (2026-09-30)**: owner's images `design/buddy v2 01.png` … `21.png` (magenta background, one pose each) cut out into `public/buddy/*.webp` (shared frame 790x700, feet aligned, 29–59 KB each). Mapping: 01 repos, 02 salut, 03 bravo, 04 idee, 05 fache, 06 compassion, 07 ecoute, 08 inquiet, 09 encourage, 10 content, 11 fier, 12 reflechit, 14 relax, 15 triste, 16 scene-sport, 17 scene-voyages, 18 scene-etudes, 19 scene-finances, 20 scene-priere, 21 scene-quotidien. **13 (hiker with sleeping bag) not used** (spare, could replace scene-voyages). Desktop landing screenshots regenerated (phone ones only show the chat, unchanged).

## Business & payments (started 2026-10-03)
- ✅ **Micro-entreprise** filed on the guichet unique (formalites.entreprises.gouv.fr) on 2026-10-03, dossier J00287744767: entrepreneur individuel (re-registration, previous delivery activity was closed), activity "édition et commercialisation en ligne d'une application web… par abonnement", service activity, quarterly URSSAF declarations, no versement libératoire, home address (Le Mans), domain buddycoach.app. ⏳ Waiting for the SIRET (INSEE). Check the APE code when it arrives (expected 58.29C or 62.01Z). Owner may add a 2nd activity later (websites for businesses) via a "modification" (same micro-entreprise).
  - Reminder: URSSAF declaration every quarter on autoentrepreneur.urssaf.fr, **even at 0 €**.
- ✅ **Stripe (TEST mode)**: owner created the account (no Managed Payments), product "BUDDY premium" 9,99 €/month (found automatically by name, `STRIPE_PRICE_ID` can override). Key `STRIPE_SECRET_KEY` (sk_test_) in .env only — **not on Vercel yet** (payments stay off online until then).
  - Code: `stripe.js` (Checkout with 7-day trial if never subscribed, Customer Portal auto-configured: cancel at period end, card update, invoices; `subscriptionState`; cancel subscriptions on account deletion). server.js: `/api/checkout`, `/api/billing-portal`, `syncSubscription` (asks Stripe on return from Stripe `?sync=1` and at most every 6 h, from `/api/state`), `/api/plan` can no longer set "premium" when payments are on. No webhook (simpler; plan refreshes when the person opens the app). App: Premium button → Stripe; return messages; Settings → status (trial until / next payment / cancelled until / payment failed) + "Gérer mon abonnement".
  - SQL: `supabase-stripe.sql` (stripe_customer_id, subscription_status, trial_ends_at, premium_until, cancel_at_period_end, stripe_synced_at). Tested: Stripe module alone (checkout shows 0 € today = trial OK, portal OK).
  - **Before going live**: SIRET → activate Stripe account (live), create the same product in live mode, put the sk_live_ key in Vercel env vars, switch `DEMO_MODE` to false, fill the legal placeholders. ✅ Done 2026-10-03: trial-end reminder e-mail 48 h before the end (= day 5), fixed text FR/EN, to the account e-mail, once per trial, not sent if already cancelled (`sendTrialReminder` in emails.js, kind "trial" in email_log) + e-mail template rebranded (light mint background, white card, navy text, mint button, bubble logo). Note: it relies on `trial_ends_at`, refreshed when the person opens the app (no Stripe webhook yet).
- 💡 Owner's Premium ideas (2026-10-03): **choice of app icons** (design/nouvelles icones app variations.png) and **home-screen widgets** (design/exemples widgets pour app.png). Both need the native app (App Store / Google Play): a web app can't change its home-screen icon per person or add widgets. Possible in the web app now: in-app "widget" cards on the home page and a choice of Buddy look/theme.

## New tools on the Outils page (owner's choice, 2026-10-03)
- 🧠 **Vide-tête (Brain dump) — Premium**: the person writes everything in bulk → `/api/braindump` (Claude haiku, `DUMP_FORM`: message + tasks with date/time/goal, spread over the next 14 days respecting the per-day limit and existing tasks) → the page shows the proposal with checkboxes → only on "Oui, ajoute-les" are the ticked tasks created (via the normal `/api/tasks`, same rules). 10 uses/day (`dump_day`/`dump_count`). Tested with Claude on a real example (dates/goals/time respected, emotions → kind word, no task).
  - **Premium teaser (owner's idea)**: on the free plan the card shows a blurred EXAMPLE (text + organised tasks) with a "Premium" badge and "Débloquer avec Premium" → opens the short Premium screen (`premium.why.braindump`). Added as Premium perk 7 (landing card, Premium screen, conditions.html). Only visible once `DEMO_MODE` is off.
- 🚫 **Jours sans** (free): quit counters (name, since date, optional €/day and minutes/day) → days, bar to next milestone (1, 3, 7, 14, 30, 60, 100, 180, 365), record, € saved / hours won back, "J'ai craqué" (back to 0, record kept, opens the chat with a pre-written message so Buddy helps).
- 💰 **Cagnotte** (free): savings pots (name, target €), add amounts (negative = withdrawal), progress bar, estimated date at the current pace.
- Storage: table `trackers` (kind quit/savings, jsonb data) → **SQL `supabase-outils.sql` to run** (also adds dump_day/dump_count). Max 10 per person. Buddy sees them in his context ("## Ses outils") and companion-prompt.md tells him when to suggest each tool.

## Sign in with Google / Apple (owner's request, 2026-10-03)
- Code done: "Continuer avec Google" / "Continuer avec Apple" buttons on the sign-up and log-in screens (`supabase.auth.signInWithOAuth`, back to the site). Each button shows **only when the provider is enabled in Supabase** (the page reads `/auth/v1/settings`), so nothing is broken while not configured. Cancelled sign-in → clear message. The "where they come from" tag (?src=) is sent with `/api/state` for these accounts. Landing plan choice (`buddy-plan-wish`) survives the redirect.
- ⏳ Owner setup: **Google** (free) = Google Cloud OAuth client (Web) with redirect URI `https://<project>.supabase.co/auth/v1/callback` → paste Client ID + secret in Supabase → Authentication → Providers → Google. Supabase → Authentication → URL Configuration: Site URL https://buddycoach.app, redirect URLs https://buddycoach.app/** and http://localhost:3000/**. **Apple** needs the Apple Developer Program (99 €/year) → later, with the App Store app (Apple requires it there anyway if Google sign-in is offered).
- Also fixed (2026-10-03): dialogs taller than the screen now scroll (the Premium screen got too tall), and the page behind no longer moves.

## Install & credibility + personal notifications (2026-10-05)
- Home page: block "Sur ton téléphone et ton ordinateur" under the screenshots (installing without a store presented as an advantage, iPhone / Android / Ordinateur chips) + a **QR code** on computers (`public/images/qr-buddy.svg` → https://buddycoach.app/?src=qr, so scans show up as source "qr"). Settings (computer only): "Buddy sur ton téléphone" card with the same QR. `.desktop-only` hides them on phones/tablets.
- iPhone install guide redrawn with the real iOS icons (Share, Add to Home Screen, Buddy icon) and the iOS 26 tip (tap ⋯ first if Share isn't visible).
- Mentions légales: `noindex` (still reachable from the site, as the law requires, but not shown in Google results — the owner's home address is there).
- Notifications & e-mails: Buddy now ALWAYS uses the first name when known (once in the notification, at the start of the e-mail). Tested with Claude: 3/3 notifications and e-mails start with the name.
- Plan agreed: step 1 = Stripe live on the website (waiting for: SIRET, contact e-mail, Supabase region, minimum age 15?; owner keeps his home address on the legal page). Step 2 = Google Play via an "organisation" developer account (needs a free D-U-N-S number → avoids the 12 testers / 14 days rule) — owner to request the D-U-N-S now. Step 3 = App Store later (99 €/year, Mac, native features, Apple in-app purchase).

## ⚠️ Supabase free plan: "Log Ingestion" quota exceeded (found 2026-10-05)
- Cause: the reminder tick (every minute) called `gatherInfo` for EVERY user (3 Supabase requests each) → ~60 requests/min → 1.25 GB of logs/month (quota 1 GB), with only ~19 users.
- Fix: `runEmailTick` now reads profiles + timed tasks + recent ticks in 3 grouped requests per minute for everyone (`gatherInfo` only runs when a reminder is really sent). Dry-run on the real base OK (17 profiles, 18 timed tasks). To watch: Supabase → Usage next cycle. If Supabase restricts the project before then → Pro plan (25 $/month) or wait for the new cycle.
- Legal pages filled (2026-10-05): name Aymen Khelifa, entrepreneur individuel (micro-entrepreneur), SIRET "en cours d'attribution" (SIREN probably the same as before: 884 116 856), address Le Mans, contact proaymenkhelifa@gmail.com. Still to fill: Supabase region, minimum age, consumer mediator, withdrawal-right wording.

## Database moved to Europe (2026-10-05)
- Old Supabase project "BUDDY" (bgysoqiolwaamytsbxkh, West US Oregon, free plan over its log quota) → new project "Buddy EU" (jvjaugoasawzlbqyhryt, **West EU Paris**). Created with "Automatically expose new tables" OFF and automatic RLS ON; the server (service_role) is granted access explicitly.
- Copied with a one-off script (scratchpad `migrate/migrate.cjs`, `pg`): exact table structure read from the old base, auth.users + auth.identities (passwords kept), all 9 tables, foreign keys and id counters, in one transaction. Counts identical (21 accounts, 17 profiles, 15 goals, 36 tasks, 48 ticks, 204 messages, 27 badges, 295 e-mail logs, 3 push subscriptions).
- Owner switched `.env` + Vercel (SUPABASE_URL / PUBLISHABLE / SECRET), new project Auth: Site URL + redirects, custom SMTP Resend (new key), Confirm email ON. `vercel.json` → functions in Paris (`cdg1`). Users must log in again once.
- Keep the old project a few days as a backup, then pause/delete it. Remove OLD_DB_URL / NEW_DB_URL from .env when done. Legal pages: region → France (Paris).

## Terms ready for Stripe (2026-10-05)
- conditions.html: price "9,99 €/mois (TVA non applicable, art. 293 B du CGI)"; payment = card on buddycoach.app via Stripe, managed in Settings → "Gérer mon abonnement"; **withdrawal (my proposal, owner can change)**: 14 days after subscribing — cancel during the trial (nothing charged), or full refund on request by e-mail if already charged within those 14 days. Minimum age 15. Still to fill: consumer mediator. The "Phase de test" note must be removed on launch day (with DEMO_MODE = false).
- Stripe Checkout: "J'accepte les conditions…" checkbox (`consent_collection.terms_of_service` + custom text FR/EN with the link and the 14 days). If Stripe refuses because the terms URL isn't set in Stripe → opens without the checkbox and logs a warning. Tested in test mode: checkbox present.
- Launch-day checklist: Stripe account activated (live) → same product "Buddy Premium" 9,99 €/month in LIVE mode (+ image) → Stripe settings (invoice footer "TVA non applicable, art. 293 B du CGI", public details: terms + privacy URLs, support e-mail, statement descriptor BUDDYCOACH, customer e-mails/receipts ON) → owner puts sk_live_ in Vercel STRIPE_SECRET_KEY → I set DEMO_MODE = false + remove the "Phase de test" note + optional promo code for early testers → owner does a real test (subscribe, then cancel during the trial = 0 €).

## 🚀 OFFICIAL LAUNCH (2026-10-05)
- Stripe LIVE: account activated (statement descriptor BUDDYCOACH.APP / BUDDY), product "BUDDY premium" 9,99 €/month live, restricted live key ("full access except sensitive operations") in Vercel `STRIPE_SECRET_KEY` (local .env keeps the TEST key).
- `DEMO_MODE = false`: free limits active. "Phase de test" note removed from the terms.
- Premium rule (`hasPremium` in shared.js): a Stripe subscription (active / trialing / past_due) OR a gift: `premium_until` in the future and never subscribed (`giftUntil`). Stripe sync keeps the gift if the person never subscribed.
- **Testers' gift (owner's choice)**: all 21 accounts existing at launch got `premium_until = 2026-10-19 23:59 Paris`. In-app one-time announcement "Buddy est officiellement lancé 🎉 … Premium offert jusqu'au 19 octobre" (`launch-dialog`), Settings shows "Premium offert jusqu'au…", subscribe button stays visible. To gift Premium to someone later: set their `premium_until`.

## ⏳ TO DO — owner (as of 2026-10-06)
- [ ] **Consumer mediator (mandatory)**: join **SMP – Société de la Médiation Professionnelle** (checked: on the official CECMC list; 30 € TTC for 3 years for a micro-entreprise < 60 k€; a mediation case = 150 € HT simple / 350 € HT complex). Needs the SIREN → sign up at https://www.mediateur-consommation-smp.fr/designer-mediateur-professionnel/ → then tell Claude to add to conditions.html: "Société de la Médiation Professionnelle (SMP), www.mediateur-consommation-smp.fr, Alteritae, 5 rue Salvaing, 12000 Rodez". One membership covers the whole business (other apps too; B2B website clients don't need it).
- [x] SIRET **884 116 856 00029** (SIREN 884 116 856, APE 58.29C "Édition de logiciels applicatifs", RNE 05/10/2026, nature "libérale non réglementée") → in the mentions légales (2026-10-06). SIREN active → D-U-N-S and SMP can be done now.
- [ ] Real payment test on buddycoach.app (subscribe with own card, then cancel during the trial = 0 €).
- [ ] Launch announcement (e-mail to 19 confirmed accounts + 2 push): ready (`scratchpad/announce.mjs`), waiting for the owner's "envoie".
- [~] D-U-N-S requested on 2026-10-06 via Apple's lookup tool (Aymen KHELIFA, 8 rue Jean Francois La Perouse, 72000 Le Mans) → wait for the e-mail (a few days) → Google Play "organisation" account (25 $, no 12 testers / 14 days rule).
- [ ] Later: Google sign-in; pause the old Supabase project (Oregon) + remove OLD_DB_URL / NEW_DB_URL from .env.

## Google Play preparation (2026-10-06) — nothing changes for the website
- Offline page `public/offline.html` (FR/EN, Buddy relax, auto-reload when back online) cached by `sw.js`, which now answers ONLY page navigations that fail (everything else goes to the network as before).
- Manifest: lang, categories (productivity, lifestyle, health), 2 screenshots (narrow + wide), 2 shortcuts (Mes objectifs, Outils).
- `/.well-known/assetlinks.json` served by server.js from `ANDROID_APP` (package name + SHA-256 of the Play signing key, both public) → to fill once the app exists in the Play Console (otherwise the app shows an address bar). Empty list until then.
- **Store mode** (`STORE_MODE` in app.js): when Buddy is opened by the Android app (`?src=play` start URL or `android-app://` referrer) → no prices, no plans section, no trial pill, no Stripe checkout, no "Gérer mon abonnement"; the Premium screen says "Premium arrive bientôt dans l'appli Android" (Google requires its own billing for in-app subscriptions). Kept for the session only (sessionStorage) so Chrome on the same phone is never affected. Web subscribers still get Premium when logging in. Sign-ups from the app are counted as source "play".
- Next: D-U-N-S (with SIREN 884116856) → Play Console "Organisation" account (25 $) → build the Android package with pwabuilder.com (start URL `/?src=play`, keep the signing key safe!) → fill ANDROID_APP → store listing (texts FR/EN, screenshots 1080×1920, feature graphic 1024×500, data safety form, content rating). Later: Google Play Billing for in-app Premium.

## Owner's iPad feedback (2026-10-08)
- Task dialog: "Heure" and "Objectif lié" overlapped on iPad Safari (time inputs have a minimum width there) → `.form-row > * { min-width: 0 }` + iOS-only `appearance: none` on time/date inputs.
- Outils: odd line on iPad = Safari clipping card shadows in CSS multi-columns → replaced by two real columns (`.tools-col`).
- Mes objectifs: all category filters on ONE scrollable row; category emojis replaced everywhere by the home page category icons (`catIcon`): filters, goal category picker, chat topic chips, chat topic label; plain text in <select> options; no emojis in "Bilan de la semaine" / "Nouvel objectif" chips.
- Home page: Vide-tête card (`#home-dump`) between "Cette semaine" and "Mes catégories" (desktop: next to the week card; categories now full width, 7 per row) — free: blurred example + Premium badge + "Débloquer avec Premium"; Premium: write → goes to Outils and Buddy proposes the tasks (confirmation as before).
- Chat: "Nouvelle conversation" (and the after-a-break topics) now starts on an EMPTY screen like ChatGPT; older messages stay saved (Buddy remembers) and "Voir la conversation précédente" shows them again (`buddy-chat-start` in the browser). The "On reprend…" home card reopens the whole conversation.

## Google Play — status (2026-10-08)
- Play Console account "Buddy Coach" (Organisation, D-U-N-S) created; waiting for Google: identity check (ID uploaded), website check (Search Console TXT record google-site-verification in Vercel DNS ✓), then phone check.
- contact@buddycoach.app works (ImprovMX catch-all → Gmail; MX + SPF in Vercel DNS).
- Android package built with PWABuilder: package **app.buddycoach.buddy**, start URL /?src=play, notification delegation on. The zip (aab, apk, signing.keystore, signing-key-info) belongs to the owner and must be kept safe (2 copies). assetlinks.json is served with the PWABuilder key SHA-256; the Play App Signing SHA-256 must be ADDED in server.js ANDROID_APP once the app is created.
- Store listing ready in `store/google-play-fiche.md` (FR/EN texts, contact, category, content rating, target audience 16+, data safety table) + `store/images/` (10 framed screenshots 1080×1920 FR/EN, banner 1024×500 FR/EN).
- 2026-10-09 Play Console filled by Claude: FR listing (texts, icon, banner, 5 screenshots), category Productivité, contact, privacy URL, Ads = No, Advertising ID = No, Government/Financial/Health = none, Data safety fully answered (draft saved; deletion page `/legal/suppression-compte.html` live). Data safety can only be SUBMITTED after "Target audience". Left for the owner: App access (test account review@buddycoach.app + password typed by the owner), Target audience (16-17 + 18+), Content rating (IARC terms to accept), then Production release → send for review.
- 2026-10-09 evening: ALL "App content" declarations done (login info with Google test account — Premium gifted until 2027-12-31, target audience 16-17 + 18+, data safety submitted, content rating done). Supabase EU project fixed: Site URL https://buddycoach.app + redirect https://buddycoach.app/**, custom SMTP (Resend). Next: test the internal-testing build on an Android phone, then Production release → send for review (owner's OK).
- iOS plan: Capacitor (wrap the site) + Codemagic (cloud Mac build) or a friend's Mac; Apple Developer as "individual" (99 €/year); add native push, widgets and Apple in-app purchase to pass review guideline 4.2.

## Marketing & next steps
Videos & reels plan: see **PLAN-MARKETING.md** (dedicated marketing conversation). Carousels & launch: see CONTEXTE-MARKETING.md (summary of the Cowork conversation of 2026-09-27/28: carousels, launch plan, waitlist, PWA, Stripe, stores).
