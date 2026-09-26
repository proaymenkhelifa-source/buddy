-- Phase 8b : Buddy bilingue (français / anglais)
-- Ajoute une case "language" au profil : la langue choisie par la personne ("fr" ou "en").
-- Buddy s'en sert pour les e-mails automatiques (qui partent sans que la page soit ouverte).
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)

alter table profiles add column if not exists language text;
