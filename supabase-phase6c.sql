-- Phase 6 (suite) : les phrases de motivation du jour, personnalisées.
-- À copier-coller dans Supabase > SQL Editor (zone VIDE), puis cliquer sur "Run".
-- Rien n'est effacé.

-- Buddy écrit 2 phrases par jour et par personne ; on les garde pour ne pas les réécrire à chaque visite.
alter table profiles add column quote_day date;     -- le jour où les phrases ont été écrites
alter table profiles add column quote_short text;   -- la courte (menu de gauche)
alter table profiles add column quote_long text;    -- la longue (carte au milieu de l'accueil)
