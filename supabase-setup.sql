-- Crée les deux "tableaux" de la mémoire de Buddy dans Supabase.
-- À copier-coller dans Supabase > SQL Editor, puis cliquer sur "Run".

-- Tableau des objectifs : une ligne = un objectif.
create table goals (
  id bigint generated always as identity primary key, -- numéro automatique (1, 2, 3...)
  text text not null,                                  -- le texte de l'objectif
  created_at timestamptz default now()                 -- date et heure d'ajout
);

-- Tableau des messages : une ligne = un message.
create table messages (
  id bigint generated always as identity primary key,
  role text not null,        -- "user" (toi) ou "assistant" (Buddy)
  content text not null,     -- le texte du message
  created_at timestamptz default now()
);

-- Verrouille les deux tableaux : personne ne peut les lire depuis Internet,
-- sauf notre serveur, qui a la clé secrète.
alter table goals enable row level security;
alter table messages enable row level security;
