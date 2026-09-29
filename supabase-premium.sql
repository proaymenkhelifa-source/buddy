-- L'offre choisie sur l'écran "Buddy Premium" (juste après l'inscription)
-- Ajoute au profil : l'offre choisie ("premium" ou "free") et la date du choix.
-- (Pas encore de vrai paiement : ce sera branché avec l'app mobile, via l'App Store et Google Play.)
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)

alter table profiles add column if not exists plan text;
alter table profiles add column if not exists plan_chosen_at timestamptz;

-- 📊 Pour voir combien de personnes choisissent Premium, colle ceci dans le SQL Editor puis Run :
--   select plan, count(*) as personnes from profiles where plan is not null group by plan;
