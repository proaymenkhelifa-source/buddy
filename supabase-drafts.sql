-- Les objectifs "brouillons"
-- Quand tu définis un objectif avec Buddy sans aller jusqu'au bout, il est gardé en brouillon :
-- il apparaît sur la page Mes objectifs ("Incomplet"), avec "Continuer avec Buddy" ou "Abandonner".
-- Ajoute une case "draft" (brouillon oui/non) aux objectifs. Les objectifs existants restent de vrais objectifs.
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)

alter table goals add column if not exists draft boolean not null default false;
