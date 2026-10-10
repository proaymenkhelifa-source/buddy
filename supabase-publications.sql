-- LE ROBOT DE PUBLICATION (vidéos Buddy → TikTok, Instagram, YouTube, en FR et en EN)
-- 1. Un tableau "publications" : une ligne = une vidéo à publier sur UN réseau dans UNE langue
--    (une vidéo = 6 lignes : 3 réseaux × 2 langues). Rien ne part tant que le statut n'est pas "valide".
-- 2. Un tableau "connexions_reseaux" : les clés d'accès (jetons) des 6 comptes Buddy.
-- 3. Un dossier de stockage PRIVÉ "publications" pour les fichiers vidéo (supprimés dès qu'ils sont publiés).
-- Les deux tableaux sont verrouillés : seul le serveur (clé secrète) peut les lire et les écrire.
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)

create table if not exists publications (
  id bigint generated always as identity primary key,
  video text not null,                       -- ex. "05"
  titre_interne text,                        -- ex. "Quel coach"
  reseau text not null check (reseau in ('tiktok', 'instagram', 'youtube')),
  langue text not null check (langue in ('fr', 'en')),
  legende text,                              -- la légende (ou la description YouTube)
  titre_youtube text,
  commentaire text,                          -- le commentaire à publier (et à épingler à la main si besoin)
  fichier text not null,                     -- chemin du fichier dans le stockage "publications"
  statut text not null default 'a_valider'
    check (statut in ('a_valider', 'valide', 'en_cours', 'publie', 'prive_attente', 'erreur', 'annule')),
  date_prevue date not null,                 -- le jour de publication
  creneau text not null check (creneau in ('midi', 'soir')),
  id_externe text,                           -- l'identifiant de la publication sur le réseau
  url text,                                  -- le lien vers la publication
  erreur text,                               -- le message en cas de souci
  cree_le timestamptz not null default now(),
  publie_le timestamptz
);

-- une seule publication par vidéo, par réseau et par langue
create unique index if not exists publications_unique on publications (video, reseau, langue);
create index if not exists publications_jour on publications (date_prevue, creneau, statut);

alter table publications enable row level security;

create table if not exists connexions_reseaux (
  reseau text not null check (reseau in ('tiktok', 'instagram', 'youtube')),
  langue text not null check (langue in ('fr', 'en')),
  access_token text,
  refresh_token text,
  expire_le timestamptz,
  infos jsonb not null default '{}'::jsonb,  -- id du compte / de la chaîne, nom affiché…
  mis_a_jour_le timestamptz not null default now(),
  primary key (reseau, langue)
);

-- Verrouillé, aucune règle d'accès : seul le serveur (clé secrète) peut lire ou écrire les jetons.
alter table connexions_reseaux enable row level security;

-- Le dossier de stockage des vidéos : privé (public = false), 50 Mo maximum par fichier, vidéos MP4 seulement.
-- Les réseaux récupèrent la vidéo grâce à un lien signé qui expire au bout de quelques heures.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publications', 'publications', false, 52428800, array['video/mp4'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['video/mp4'];
