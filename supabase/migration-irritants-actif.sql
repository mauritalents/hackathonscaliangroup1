-- ACIA : activer ou désactiver un irritant (un irritant désactivé disparaît des écrans, sans être supprimé).
-- À exécuter une fois dans Supabase > SQL Editor. Rejouable.
alter table public.irritants add column if not exists actif boolean not null default true;
