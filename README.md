# ACIA

AI Continuous Improvement Assistant : site web issu de la maquette v11, relié à Supabase (projet Hackathongroup1) et hébergeable sur GitHub Pages.

Mise en ligne pas à pas : voir GUIDE-DEPLOIEMENT.md

Agent de détection IA : voir GUIDE-AGENT-IA.md

## Paramétrage (HRBP)

L'onglet Paramétrage permet au HRBP, avec un vrai compte, d'ajouter, modifier et supprimer des lignes (irritants, sources, arrivées, brouillons, textes de référence, fournisseurs d'IA) et de changer le profil des utilisateurs. Il exige d'exécuter une fois `supabase/migration-parametrage.sql` dans le SQL Editor. La création ou la suppression de tables elles-mêmes reste à faire dans Supabase.

### Gestion des utilisateurs (fonction admin-users)

Créer, modifier, supprimer un utilisateur et définir son mot de passe exigent la clé service_role, qui reste côté serveur. Déployez la fonction `admin-users` comme celle de la détection : Supabase, Edge Functions, Deploy a new function, nom exact `admin-users`, collez `supabase/functions/admin-users/index.ts`. Aucun secret à ajouter. La fonction refuse tout appel hors HRBP réel, la suppression de son propre compte, le retrait de son propre profil HRBP et la suppression du dernier HRBP.

### Activer ou désactiver un irritant

Dans Paramétrage, Irritants, le bouton Désactiver retire l'irritant de tous les écrans sans le supprimer (ses statuts et avis sont conservés) ; Activer le remet. Exécutez une fois `supabase/migration-irritants-actif.sql`.

### Filtrer les analyses par date

Dans Détection IA, le bloc « Filtrer par date d'exécution » limite les résultats à une période (bornes incluses, date locale) avec les raccourcis Aujourd'hui, 7 jours, 30 jours et Toutes. Une liste « Analyse » permet aussi de choisir une analyse précise par sa date et son heure. Le site charge les 500 dernières propositions.

### Gérer les clés d'API depuis le site

Paramétrage, Clés d'API : pour chaque fournisseur, le HRBP voit si une clé personnelle, une clé par défaut du projet et un secret Supabase existent, avec la date et l'auteur de la clé par défaut. Il peut saisir ou remplacer sa clé personnelle, définir ou remplacer la clé par défaut du projet, supprimer l'une ou l'autre et tester chaque clé (le test liste les modèles du fournisseur). Aucune clé n'est jamais affichée. Cette page exige la version 4 de la fonction `detect-irritants` : redéployez `supabase/functions/detect-irritants/index.ts`. Le secret Supabase `<FOURNISSEUR>_API_KEY` se gère dans Supabase, pas dans le site.

### Importer depuis Excel ou CSV

Dans Paramétrage, les tables de données (irritants, sources, arrivées, brouillons, textes de référence, fournisseurs d'IA) ont un bouton « Importer (Excel ou CSV) ». Le fichier est lu dans le navigateur, sans bibliothèque externe : .csv (virgule, point virgule ou tabulation) ou .xlsx (première feuille). La première ligne contient les en-têtes (clé de la colonne ou son libellé) ; le bouton « Télécharger le modèle CSV » donne les en-têtes attendus. Chaque ligne est contrôlée avant import (champs obligatoires, nombres, oui/non, JSON) et un aperçu est affiché ; les lignes refusées sont listées avec leur numéro. Deux modes : ajouter seulement les lignes nouvelles, ou ajouter et mettre à jour selon l'identifiant. Non géré : l'ancien format .xls et la conversion des dates Excel.
