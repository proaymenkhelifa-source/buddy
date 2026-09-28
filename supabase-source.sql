-- D'où viennent les inscrits ?
-- Ajoute une case "source" au profil : l'étiquette du lien par lequel la personne est arrivée
-- (ex : "insta-fr", "tiktok-en"). Vide = lien direct ou inconnu.
-- À coller dans Supabase → SQL Editor → Run. (Sans danger si tu le lances deux fois.)

alter table profiles add column if not exists source text;
