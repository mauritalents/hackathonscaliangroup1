-- Attribuer un profil à un compte (à exécuter dans le SQL Editor après la création du compte).
-- Profils possibles : 'collab' (RH), 'manager', 'hrbp', 'dir'
update public.profiles set role = 'hrbp'    where email = 'julien@exemple.com';
update public.profiles set role = 'collab'  where email = 'camille@exemple.com';
update public.profiles set role = 'manager' where email = 'isabelle@exemple.com';
update public.profiles set role = 'dir'     where email = 'direction@exemple.com';
-- Vérifier : select email, role from public.profiles;
