-- À exécuter UNE FOIS (SQL Editor) pour activer l'agent de détection IA. Ne supprime aucune donnée.

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
