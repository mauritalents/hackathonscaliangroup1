-- À exécuter UNE FOIS si schema.sql a déjà été lancé avant l'ajout du mode démonstration enregistré en base.
-- Ne supprime aucune donnée.

-- Mode démonstration : session anonyme Supabase, profil choisi depuis l'écran de connexion.
-- Réservé aux sessions anonymes : un vrai compte ne peut pas changer son profil par ce biais.
create or replace function public.set_demo_role(r text, n text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is not true then
    raise exception 'Réservé au mode démonstration';
  end if;
  if r not in ('collab','manager','hrbp','dir') then raise exception 'Profil inconnu'; end if;
  update public.profiles set role = r, full_name = coalesce(nullif(n,''), full_name) where id = auth.uid();
end $$;
revoke all on function public.set_demo_role(text, text) from public, anon;
grant execute on function public.set_demo_role(text, text) to authenticated;

