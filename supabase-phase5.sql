-- Phase 5 : Buddy se souvient de ton prénom, de ton style de coaching, de ton plan et de ses émotions.
-- À copier-coller dans Supabase > SQL Editor, puis cliquer sur "Run".

-- 1. Un "profil" par personne : une seule ligne par compte.
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text,                       -- le prénom donné à Buddy
  communication_style text,              -- "military", "supportive" ou "balanced" (vide = pas encore choisi)
  plan text,                             -- le plan validé avec Buddy (résumé)
  updated_at timestamptz default now()
);

-- Verrouillé comme les autres tableaux : seul le serveur (clé secrète) peut le lire.
alter table profiles enable row level security;

-- 2. On retient l'émotion de Buddy pour chacun de ses messages.
alter table messages add column emotion text;
