-- Phase 6 (suite) : choisir QUAND une tâche a lieu.
-- À copier-coller dans Supabase > SQL Editor (zone VIDE), puis cliquer sur "Run".
-- Rien n'est effacé : les tâches existantes restent "tous les jours".

-- Les jours de la semaine où la tâche a lieu : 1 = lundi, 2 = mardi … 7 = dimanche.
-- Vide = tous les jours.
alter table tasks add column days integer[];

-- Une date unique (pour une tâche à faire une seule fois). Vide = tâche qui se répète.
alter table tasks add column on_date date;
