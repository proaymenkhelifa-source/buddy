-- Les paiements Buddy Premium avec Stripe
-- Ajoute au profil ce qu'il faut pour suivre l'abonnement de chaque personne.
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)

alter table profiles add column if not exists stripe_customer_id text;         -- le "client" Stripe de la personne
alter table profiles add column if not exists subscription_status text;        -- trialing (essai), active, past_due, canceled…
alter table profiles add column if not exists trial_ends_at timestamptz;       -- fin de l'essai gratuit
alter table profiles add column if not exists premium_until timestamptz;       -- prochain paiement, ou fin de Premium si annulé
alter table profiles add column if not exists cancel_at_period_end boolean default false; -- annulé (reste Premium jusqu'à premium_until)
alter table profiles add column if not exists stripe_synced_at timestamptz;    -- dernière fois qu'on a demandé à Stripe

-- 📊 Pour voir les abonnements, colle ceci dans le SQL Editor puis Run :
--   select subscription_status, count(*) as personnes from profiles where subscription_status is not null group by subscription_status;
