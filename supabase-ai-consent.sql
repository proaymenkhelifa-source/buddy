-- Accord pour l'IA (exigé par Apple, règles 5.1.1 et 5.1.2) : la date à laquelle la personne a accepté
-- que ses messages, son prénom, ses objectifs, ses tâches et sa progression soient envoyés à Claude (Anthropic).
-- Vide = pas d'accord : le serveur n'envoie RIEN à l'IA pour cette personne.
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)
alter table profiles add column if not exists ai_consent_at timestamptz;
