-- ACIA : schéma Supabase (projet Hackathongroup1)
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query, puis seed.sql.
-- Rejouable : les tables sont supprimées puis recréées (les données de démonstration sont perdues).

drop view if exists public.event_refs;
drop table if exists public.ai_default_keys, public.ai_user_keys, public.ai_settings, public.ai_providers;
drop table if exists public.detections, public.detection_runs;
drop table if exists public.ref_content, public.brouillons, public.arrivees, public.manager_avis, public.irritant_status, public.events, public.irritants cascade;
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
-- Textes et listes de référence (rôles, spécification, journal de l'agent, règles de confiance...), en JSON.
create table public.ref_content (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
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
  id text primary key, position int not null default 0, arrivee_id text not null references public.arrivees(id) on delete cascade,
  destinataire text not null, objet text not null, corps text not null, statut text
);

-- 4. Sécurité (RLS) ----------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.irritants enable row level security;
alter table public.ref_content enable row level security;
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
create policy ref_content_read on public.ref_content for select to authenticated using (true);
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

-- Mode démonstration : session anonyme Supabase, profil choisi depuis l'écran de connexion.
-- Réservé aux sessions anonymes : un vrai compte ne peut pas changer son profil par ce biais.
create or replace function public.set_demo_role(r text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is not true then
    raise exception 'Réservé au mode démonstration';
  end if;
  if r not in ('collab','manager','hrbp','dir') then raise exception 'Profil inconnu'; end if;
  update public.profiles
     set role = r,
         full_name = coalesce((select value -> r ->> 0 from public.ref_content where key = 'ident'), full_name)
   where id = auth.uid();
end $$;
revoke all on function public.set_demo_role(text) from public, anon;
grant execute on function public.set_demo_role(text) to authenticated;

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

-- 6. Agent de détection IA
-- Agent de détection IA : analyses (detection_runs) et irritants proposés (detections).
-- Ces deux tables sont écrites uniquement par la fonction detect-irritants (clé service_role côté serveur).
create table if not exists public.detection_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  model text, nb_events int, resume text
);
create table if not exists public.detections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.detection_runs(id) on delete cascade,
  titre text not null, court text, signal text,
  sources text[] not null default '{}',
  reponse text, proposition text, pourquoi text, confiance text, existant_id text,
  statut text not null default 'À valider' check (statut in ('À valider','Validé','Ignoré')),
  created_at timestamptz not null default now()
);
alter table public.detection_runs enable row level security;
alter table public.detections enable row level security;

drop policy if exists runs_read on public.detection_runs;
create policy runs_read on public.detection_runs for select to authenticated using (public.current_app_role() in ('collab','hrbp'));
drop policy if exists detections_read on public.detections;
create policy detections_read on public.detections for select to authenticated using (public.current_app_role() in ('collab','hrbp'));
drop policy if exists detections_update on public.detections;
create policy detections_update on public.detections for update to authenticated
  using (public.current_app_role() = 'hrbp') with check (public.current_app_role() = 'hrbp');
revoke update on public.detections from authenticated;
grant update (statut) on public.detections to authenticated;

-- Ajout de sources (mails, comptes rendus) depuis le site par la RH et le HRBP.
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (public.current_app_role() in ('collab','hrbp') and live = false);

-- Onglet « Détection IA » pour le HRBP (idempotent).
update public.ref_content
   set value = (select jsonb_agg(case when e ->> 'id' = 'hrbp' then jsonb_set(e, '{tabs}', (e -> 'tabs') || '[["detection","Détection IA"]]'::jsonb) else e end)
                  from jsonb_array_elements(value) e),
       updated_at = now()
 where key = 'roles' and value::text not like '%"detection"%';

-- 7. Multi fournisseurs d'IA
-- Fournisseurs d'IA, réglages par défaut et clés chiffrées.
create table if not exists public.ai_providers (
  id text primary key, label text not null,
  kind text not null check (kind in ('anthropic','openai')),
  base_url text, default_model text, key_hint text,
  position int not null default 0, enabled boolean not null default true
);
create table if not exists public.ai_settings (
  id int primary key default 1 check (id = 1),
  default_provider text references public.ai_providers(id),
  updated_at timestamptz not null default now()
);
-- Clés : chiffrées (AES-GCM) par la fonction detect-irritants. Aucune règle d'accès : seul le serveur y touche.
create table if not exists public.ai_user_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null references public.ai_providers(id) on delete cascade,
  ciphertext text not null, iv text not null, updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
create table if not exists public.ai_default_keys (
  provider text primary key references public.ai_providers(id) on delete cascade,
  ciphertext text not null, iv text not null,
  updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now()
);
alter table public.detection_runs add column if not exists provider text;

alter table public.ai_providers enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_user_keys enable row level security;
alter table public.ai_default_keys enable row level security;
revoke all on public.ai_user_keys, public.ai_default_keys from anon, authenticated;
drop policy if exists ai_providers_read on public.ai_providers;
create policy ai_providers_read on public.ai_providers for select to authenticated using (public.current_app_role() = 'hrbp');
drop policy if exists ai_settings_read on public.ai_settings;
create policy ai_settings_read on public.ai_settings for select to authenticated using (public.current_app_role() = 'hrbp');

-- Catalogue. Les adresses sont celles des API publiques ; les modèles se choisissent dans le site (bouton « Charger les modèles »).
insert into public.ai_providers (id,label,kind,base_url,default_model,key_hint,position) values
 ('anthropic','Anthropic (Claude)','anthropic','https://api.anthropic.com','claude-sonnet-5-5','sk-ant-...',0),
 ('openai','OpenAI','openai','https://api.openai.com/v1',null,'sk-...',1),
 ('gemini','Google Gemini','openai','https://generativelanguage.googleapis.com/v1beta/openai',null,'AIza...',2),
 ('mistral','Mistral AI','openai','https://api.mistral.ai/v1',null,null,3),
 ('groq','Groq','openai','https://api.groq.com/openai/v1',null,'gsk_...',4),
 ('deepseek','DeepSeek','openai','https://api.deepseek.com',null,'sk-...',5),
 ('xai','xAI (Grok)','openai','https://api.x.ai/v1',null,'xai-...',6),
 ('openrouter','OpenRouter (multi modèles)','openai','https://openrouter.ai/api/v1',null,'sk-or-...',7),
 ('together','Together AI','openai','https://api.together.xyz/v1',null,null,8),
 ('custom','Autre API compatible OpenAI (adresse à saisir)','openai',null,null,null,9)
on conflict (id) do nothing;
insert into public.ai_settings (id, default_provider) values (1, 'anthropic') on conflict (id) do nothing;
