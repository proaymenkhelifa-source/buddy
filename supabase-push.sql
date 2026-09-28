-- Les notifications du téléphone
-- 1. Un tableau "push_subscriptions" : l'"adresse" de chaque téléphone / ordinateur qui a accepté
--    les notifications (une personne peut en avoir plusieurs : son téléphone ET son ordinateur).
-- 2. Une case "email_with_push" dans le profil : recevoir AUSSI les e-mails quand on a les notifications
--    (désactivé par défaut : les notifications remplacent les e-mails, c'est gratuit et moins envahissant).
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)

create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Comme pour les autres tableaux : verrouillé, seul le serveur (clé secrète) peut lire et écrire
alter table push_subscriptions enable row level security;

alter table profiles add column if not exists email_with_push boolean not null default false;
