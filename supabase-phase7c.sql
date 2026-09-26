-- Bonus : bilan de la semaine, badges.
-- À copier-coller dans Supabase > SQL Editor (zone VIDE), puis cliquer sur "Run".
-- Rien n'est effacé.

-- 1. L'e-mail "bilan de la semaine" (le dimanche soir), activé par défaut.
alter table profiles add column email_weekly boolean not null default true;

-- 2. Combien de bilans de la semaine la personne a faits avec Buddy (pour un badge).
alter table profiles add column reviews_count integer not null default 0;

-- 3. Les badges gagnés : une ligne = "telle personne a gagné tel badge tel jour".
create table user_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz default now(),
  primary key (user_id, badge_id)   -- un badge ne se gagne qu'une fois
);
alter table user_badges enable row level security;
