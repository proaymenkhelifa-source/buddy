-- Phase 7 : les rappels par e-mail.
-- À copier-coller dans Supabase > SQL Editor (zone VIDE), puis cliquer sur "Run".
-- Rien n'est effacé.

-- 1. Les réglages des e-mails, dans le profil de chaque personne.
--    Tout est désactivé par défaut : chacun choisit dans Paramètres ce qu'il veut recevoir.
alter table profiles add column notify_email text;                           -- adresse où envoyer (vide = adresse du compte)
alter table profiles add column email_morning boolean not null default false; -- le mot du matin
alter table profiles add column morning_time text not null default '08:00';
alter table profiles add column email_evening boolean not null default false; -- le récap du soir
alter table profiles add column evening_time text not null default '21:00';
alter table profiles add column email_tasks boolean not null default false;   -- 5 min avant chaque tâche qui a une heure

-- 2. Le carnet des e-mails envoyés : pour ne jamais envoyer deux fois le même.
create table email_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,            -- "morning", "evening" ou "task"
  ref text not null default '',  -- pour "task" : le numéro de la tâche
  day date not null,
  sent_at timestamptz default now(),
  primary key (user_id, kind, ref, day)  -- impossible d'avoir deux fois la même ligne
);
alter table email_log enable row level security;
