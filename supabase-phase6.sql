-- Phase 6 : objectifs complets, tâches du jour et suivi.
-- À copier-coller dans Supabase > SQL Editor (zone VIDE), puis cliquer sur "Run".
-- Rien n'est effacé : on ajoute seulement des colonnes et deux nouveaux tableaux.

-- 1. Les objectifs deviennent plus riches.
alter table goals add column category text not null default 'quotidien'; -- sport, etudes, religion, finances, voyages, quotidien
alter table goals add column reason text;                -- pourquoi la personne veut l'atteindre
alter table goals add column deadline date;              -- échéance (facultative)
alter table goals add column progress integer not null default 0;  -- progression en % (0 à 100)
alter table goals add column plan text;                  -- le plan construit avec Buddy
alter table goals add column difficulties text;          -- les difficultés notées par Buddy

-- 2. Les tâches quotidiennes (4 actives maximum, vérifié par le serveur).
create table tasks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id bigint references goals (id) on delete set null,  -- l'objectif lié (facultatif)
  title text not null,
  time text,                                  -- heure facultative, ex : "07:00"
  created_at timestamptz default now(),
  archived_at timestamptz                     -- rempli quand la tâche est supprimée (on garde l'historique)
);
alter table tasks enable row level security;

-- 3. Le journal : une ligne = "telle tâche a été faite tel jour".
create table task_logs (
  task_id bigint not null references tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (task_id, day)                  -- une tâche ne peut être cochée qu'une fois par jour
);
alter table task_logs enable row level security;
