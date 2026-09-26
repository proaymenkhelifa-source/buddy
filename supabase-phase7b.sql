-- Phase 7 (suite) : les e-mails sont ACTIVÉS par défaut.
-- La personne les désactive dans Paramètres si elle n'en veut pas.
-- À copier-coller dans Supabase > SQL Editor (zone VIDE), puis cliquer sur "Run".

-- 1. Pour les nouveaux profils : tout coché par défaut.
alter table profiles alter column email_morning set default true;
alter table profiles alter column email_evening set default true;
alter table profiles alter column email_tasks set default true;

-- 2. Pour les profils qui existent déjà : on coche tout.
update profiles set email_morning = true, email_evening = true, email_tasks = true;
