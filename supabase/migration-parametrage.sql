-- ACIA : pages de paramétrage pour le HRBP (ajouter, modifier, supprimer des lignes depuis le site).
-- À exécuter dans Supabase > SQL Editor, après schema.sql, seed.sql, migration-detection.sql et migration-ia.sql. Rejouable.

-- Le HRBP connecté avec un vrai compte (pas la démonstration anonyme).
create or replace function public.is_hrbp_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'hrbp', false)
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;
grant execute on function public.is_hrbp_admin() to authenticated;

-- Écriture (ajout, modification, suppression) réservée à ce HRBP sur les tables de paramétrage.
do $$
declare t text;
begin
  foreach t in array array['irritants','events','ref_content','arrivees','brouillons','ai_providers','ai_settings'] loop
    execute format('drop policy if exists adm_insert on public.%I', t);
    execute format('drop policy if exists adm_update on public.%I', t);
    execute format('drop policy if exists adm_delete on public.%I', t);
    execute format('create policy adm_insert on public.%I for insert to authenticated with check (public.is_hrbp_admin())', t);
    execute format('create policy adm_update on public.%I for update to authenticated using (public.is_hrbp_admin()) with check (public.is_hrbp_admin())', t);
    execute format('create policy adm_delete on public.%I for delete to authenticated using (public.is_hrbp_admin())', t);
  end loop;
end $$;

-- Un nouvel irritant reçoit sa ligne de statut.
drop policy if exists adm_insert on public.irritant_status;
create policy adm_insert on public.irritant_status for insert to authenticated with check (public.is_hrbp_admin());

-- Utilisateurs : le HRBP voit les profils et change les rôles, jamais le sien.
drop policy if exists profiles_select_hrbp on public.profiles;
create policy profiles_select_hrbp on public.profiles for select to authenticated using (public.is_hrbp_admin());

create or replace function public.admin_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_hrbp_admin() then raise exception 'Réservé au HRBP'; end if;
  if new_role not in ('collab','manager','hrbp','dir') then raise exception 'Profil inconnu'; end if;
  if target = auth.uid() then raise exception 'Vous ne pouvez pas changer votre propre profil'; end if;
  update public.profiles set role = new_role where id = target;
end $$;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- Onglet « Paramétrage » pour le HRBP (idempotent).
update public.ref_content
   set value = (select jsonb_agg(case when e ->> 'id' = 'hrbp' then jsonb_set(e, '{tabs}', (e -> 'tabs') || '[["parametrage","Paramétrage"]]'::jsonb) else e end)
                  from jsonb_array_elements(value) e),
       updated_at = now()
 where key = 'roles' and value::text not like '%"parametrage"%';
