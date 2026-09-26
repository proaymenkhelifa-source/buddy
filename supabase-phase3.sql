-- Phase 3 : chaque ligne appartient à une personne.
-- À copier-coller dans Supabase > SQL Editor, puis cliquer sur "Run".

-- 1. On vide les anciennes lignes de test (elles n'appartiennent à personne).
delete from messages;
delete from goals;

-- 2. On ajoute une colonne "user_id" : l'identité de la personne à qui appartient la ligne.
--    "references auth.users" = elle doit correspondre à un vrai compte.
--    "on delete cascade" = si un compte est supprimé, ses lignes le sont aussi.
alter table goals
  add column user_id uuid not null references auth.users (id) on delete cascade;

alter table messages
  add column user_id uuid not null references auth.users (id) on delete cascade;
