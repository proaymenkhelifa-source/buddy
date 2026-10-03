-- Les nouveaux outils de la page "Outils" : les compteurs "Jours sans" et les cagnottes.
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)

-- Une ligne = un compteur "Jours sans" (kind = 'quit') ou une cagnotte (kind = 'savings').
-- "data" contient le détail :
--   compteur : { "start": "2026-10-03", "record": 12, "resets": 1, "money": 10, "minutes": 60 }
--   cagnotte : { "target": 1000, "deposits": [ { "amount": 50, "day": "2026-10-03" } ] }
create table if not exists trackers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade, -- supprimé avec le compte
  kind text not null check (kind in ('quit', 'savings')),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists trackers_user on trackers (user_id);

-- Verrouillé : personne ne peut le lire depuis Internet, sauf notre serveur (qui a la clé secrète).
alter table trackers enable row level security;

-- Le Vide-tête (Premium) : combien de fois il a servi aujourd'hui (10 par jour maximum, pour limiter les coûts).
alter table profiles add column if not exists dump_day date;
alter table profiles add column if not exists dump_count int default 0;
