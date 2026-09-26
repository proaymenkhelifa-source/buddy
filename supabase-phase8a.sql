-- Phase 8 (préparation) : le fuseau horaire de chaque personne.
-- À copier-coller dans Supabase > SQL Editor (zone VIDE), puis cliquer sur "Run".
-- Rien n'est effacé.

-- Ex : "Europe/Paris". Rempli automatiquement par la page (elle connaît le fuseau de l'ordinateur).
-- Sert à envoyer les rappels à l'heure LOCALE de chaque personne, même si le serveur est à Londres.
alter table profiles add column timezone text;
