-- ACIA : schéma Supabase (projet Hackathongroup1)
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query, puis seed.sql.
-- Rejouable : les tables sont supprimées puis recréées (les données de démonstration sont perdues).

drop view if exists public.event_refs;
drop table if exists public.brouillons, public.arrivees, public.manager_avis, public.irritant_status, public.events, public.irritants cascade;
drop table if exists public.profiles cascade;

-- 1. Profils (un par compte, rôle attribué par l'administrateur) ------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'collab' check (role in ('collab','manager','hrbp','dir')),
  created_at timestamptz not null default now()
);

create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Comptes déjà créés avant l'exécution de ce script
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data->>'full_name','') from auth.users
on conflict (id) do nothing;

-- 2. Données de référence ---------------------------------------------------------------
create table public.irritants (
  id text primary key, position int not null,
  titre text not null, court text not null, signal text not null, color text not null,
  note int not null, traitement text not null, reponse text not null, demo boolean not null default false,
  proposition text not null, pourquoi text not null
);
create table public.events (
  position int primary key,
  jour text not null, src text not null check (src in ('mail','cr')), ref text not null,
  de_nom text, titre text not null, texte text not null,
  irr text[] not null default '{}', conf boolean not null default false,
  aparte text, live boolean not null default false
);
-- Vue sans contenu des mails : seule source lue par les managers et la direction.
create view public.event_refs as
  select position, jour, src, ref, irr, live from public.events;

-- 3. Données de travail ------------------------------------------------------------------
create table public.irritant_status (
  irritant_id text primary key references public.irritants(id) on delete cascade,
  status text not null default 'À valider' check (status in ('À valider','Contesté','Validé','Ignoré')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.manager_avis (
  irritant_id text not null references public.irritants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  avis text not null check (avis in ('Confirmé','Contesté')),
  updated_at timestamptz not null default now(),
  primary key (irritant_id, user_id)
);
create table public.arrivees (
  id text primary key, nom text not null, poste text not null,
  recu boolean not null default false, complete boolean not null default false,
  lieu text, materiel text, acces text, updated_at timestamptz not null default now()
);
create table public.brouillons (
  id text primary key, arrivee_id text not null references public.arrivees(id) on delete cascade,
  destinataire text not null, objet text not null, corps text not null, statut text
);

-- 4. Sécurité (RLS) ----------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.irritants enable row level security;
alter table public.events enable row level security;
alter table public.irritant_status enable row level security;
alter table public.manager_avis enable row level security;
alter table public.arrivees enable row level security;
alter table public.brouillons enable row level security;

-- Profils : chacun lit le sien et ne peut modifier que son nom (jamais son rôle).
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Référentiel : lisible par tout compte connecté, jamais modifiable depuis le site.
create policy irritants_read on public.irritants for select to authenticated using (true);
-- Contenu des mails et comptes rendus : collaborateur et HRBP seulement.
create policy events_read on public.events for select to authenticated using (public.current_app_role() in ('collab','hrbp'));
grant select on public.event_refs to authenticated;

-- Validation des irritants : le HRBP décide, le collaborateur peut seulement contester.
create policy status_read on public.irritant_status for select to authenticated using (true);
create policy status_update on public.irritant_status for update to authenticated
  using (public.current_app_role() in ('hrbp','collab'))
  with check (public.current_app_role() = 'hrbp' or (public.current_app_role() = 'collab' and status = 'Contesté'));

-- Avis des managers : chacun écrit les siens ; le HRBP les lit.
create policy avis_read on public.manager_avis for select to authenticated
  using (public.current_app_role() = 'hrbp' or user_id = auth.uid());
create policy avis_insert on public.manager_avis for insert to authenticated
  with check (public.current_app_role() = 'manager' and user_id = auth.uid());
create policy avis_update on public.manager_avis for update to authenticated
  using (public.current_app_role() = 'manager' and user_id = auth.uid())
  with check (public.current_app_role() = 'manager' and user_id = auth.uid());

-- Arrivées : vues par la RH, le manager et le HRBP ; modifiées par la RH et le manager.
create policy arrivees_read on public.arrivees for select to authenticated using (public.current_app_role() in ('collab','manager','hrbp'));
create policy arrivees_update on public.arrivees for update to authenticated
  using (public.current_app_role() in ('collab','manager')) with check (public.current_app_role() in ('collab','manager'));
-- Brouillons : RH et HRBP.
create policy brouillons_read on public.brouillons for select to authenticated using (public.current_app_role() in ('collab','hrbp'));
create policy brouillons_update on public.brouillons for update to authenticated
  using (public.current_app_role() = 'collab') with check (public.current_app_role() = 'collab');

-- 5. Remise à zéro de la démo (HRBP uniquement) ------------------------------------------
create or replace function public.reset_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'hrbp' then raise exception 'Réservé au HRBP'; end if;
  update public.irritant_status set status = 'À valider', updated_by = null, updated_at = now() where true;
  delete from public.manager_avis where true;
  update public.arrivees set recu = false, complete = false, lieu = null, materiel = null, acces = null, updated_at = now() where true;
  update public.brouillons set statut = null where true;
end $$;
revoke all on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated;
