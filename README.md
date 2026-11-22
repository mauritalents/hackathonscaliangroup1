# ACIA

AI Continuous Improvement Assistant : site web issu de la maquette v11, relié à Supabase (projet Hackathongroup1) et hébergeable sur GitHub Pages.

Mise en ligne pas à pas : voir GUIDE-DEPLOIEMENT.md

Agent de détection IA : voir GUIDE-AGENT-IA.md

## Paramétrage (HRBP)

L'onglet Paramétrage permet au HRBP, avec un vrai compte, d'ajouter, modifier et supprimer des lignes (irritants, sources, arrivées, brouillons, textes de référence, fournisseurs d'IA) et de changer le profil des utilisateurs. Il exige d'exécuter une fois `supabase/migration-parametrage.sql` dans le SQL Editor. La création ou la suppression de tables elles-mêmes reste à faire dans Supabase.
