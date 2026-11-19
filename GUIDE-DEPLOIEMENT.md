# ACIA : guide de mise en ligne (Supabase + GitHub Pages)

## Ce que contient le dossier

1. `index.html`, `css/`, `js/`, `assets/` : le site (issu de la maquette v11). Aucune donnée métier dans le code : tout est chargé depuis Supabase.
2. `js/config.js` : les deux valeurs Supabase à renseigner.
3. `supabase/schema.sql` : tables et règles de sécurité. `supabase/seed.sql` : jeu de données fictif. `supabase/roles.sql` : attribution des profils.

## Étape 1. Créer le projet Supabase

1. Ouvrir https://supabase.com/dashboard et choisir l'organisation HackathonStalian.
2. New project. Nom : Hackathongroup1. Région proche (Europe). Choisir un mot de passe de base de données et le conserver dans un gestionnaire de mots de passe.
3. Attendre la fin de la création (1 à 2 minutes).

## Étape 2. Créer les tables et les données

1. Menu SQL Editor, New query. Coller tout le contenu de `supabase/schema.sql`, cliquer Run.
2. Nouvelle requête. Coller `supabase/seed.sql`, Run.
3. Menu Table Editor : vous devez voir 6 irritants, 25 événements, 1 arrivée, 3 brouillons et 16 lignes dans ref_content (rôles, spécification, règles de confiance...).
4. Déjà lancé une version précédente ? Ne relancez pas `schema.sql` (il efface les tables) : exécutez seulement `supabase/migration-donnees.sql`.

## Étape 3. Régler l'authentification

1. Authentication, Sign In / Providers, Email : pour un hackathon, désactiver « Confirm email » (sinon chaque inscrit doit cliquer sur un lien reçu par mail).
2. Authentication, Sign In / Providers : activer « Allow anonymous sign-ins » (nécessaire pour le mode démonstration enregistré en base).
3. Authentication, URL Configuration : renseigner Site URL avec l'adresse GitHub Pages (étape 6). Ajouter aussi `http://localhost:8000` dans les Redirect URLs pour les tests.

## Étape 4. Copier les clés dans le site

1. Project Settings, API (ou API Keys selon la version de l'interface).
2. Copier le Project URL et la clé « anon public » (ou « publishable »).
3. Ouvrir `js/config.js` et remplacer les deux valeurs.
4. Ne jamais copier la clé « service_role » ni la clé « secret » : elles donnent tous les droits.

## Étape 5. Tester sur votre PC

1. Ouvrir un terminal dans le dossier du site.
2. Lancer `python -m http.server 8000` (ou utiliser l'extension Live Server de VS Code).
3. Ouvrir http://localhost:8000
4. Créer un compte, puis attribuer son profil (étape 7) et se reconnecter.

## Étape 5 bis. Installer Git (si besoin)

Vérifier avec `git --version`. Sinon installer Git for Windows (https://git-scm.com), puis `git config --global user.name "Votre nom"` et `git config --global user.email "vous@exemple.com"`.

## Étape 6. Publier sur GitHub Pages

1. Sur https://github.com, New repository. Nom : hackathongroup1 (ou acia). Visibilité Public (GitHub Pages gratuit exige un dépôt public ; un dépôt privé demande un abonnement payant). Ne cochez ni README ni .gitignore.
2. Dans PowerShell :

```
cd C:\DEV\IA\Hackathonscaliangroup1
git init
git add .
git commit -m "ACIA : premiere version"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/hackathongroup1.git
git push -u origin main
```

3. Sur GitHub : Settings, Pages. Source : Deploy from a branch. Branch : main, dossier / (root). Save.
4. Après 1 à 2 minutes, le site est à l'adresse https://VOTRE-COMPTE.github.io/hackathongroup1/
5. Retourner dans Supabase (étape 3) et mettre cette adresse dans Site URL.

## Étape 7. Donner un profil à chaque compte

1. Chaque personne crée son compte sur le site (onglet « Créer un compte »). Par défaut le profil est collaborateur.
2. Dans Supabase, SQL Editor, adapter et exécuter `supabase/roles.sql` avec les vraies adresses e-mail.
3. Profils : collab (RH), manager, hrbp, dir. Le HRBP voit le bouton « Réinitialiser la démo » dans le menu du compte.

## Mettre à jour le site

```
git add .
git commit -m "Description du changement"
git push
```

Le site se met à jour en 1 à 2 minutes.

## Points de vigilance

1. Le site et le dépôt sont publics. Le jeu de données est fictif : n'y mettez jamais de vrais mails ou comptes rendus Scalian.
2. La clé anon est publique par conception. Ce qui protège les données, ce sont les règles RLS de `schema.sql` : ne les désactivez pas.
3. Un projet Supabase gratuit se met en pause après environ une semaine sans activité : le réveiller depuis le tableau de bord avant une démonstration.
4. Mode démonstration : chacun entre sans compte avec le profil de son choix, et ses actions sont enregistrées dans la base partagée. Toute personne ayant l'adresse du site peut donc modifier les données de démonstration (y compris se donner le profil HRBP), mais pas les profils des vrais comptes. À désactiver après le hackathon (décocher « Allow anonymous sign-ins »).
5. Chaque entrée en démonstration crée un utilisateur anonyme : nettoyage possible avec la requête en commentaire à la fin de `roles.sql`.
