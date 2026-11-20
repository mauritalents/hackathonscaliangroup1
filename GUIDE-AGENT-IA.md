# Agent de détection IA : mise en service

## Comment ça marche

1. Le site (GitHub Pages) est public : une clé d'API placée dans le site ou dans le dépôt serait lisible par tout le monde.
2. Le site appelle donc la fonction Supabase `detect-irritants` (dossier `supabase/functions/detect-irritants/`). Elle lit les mails et comptes rendus en base, appelle le fournisseur d'IA choisi, contrôle le résultat et l'enregistre.
3. Le HRBP choisit le fournisseur, le modèle et la clé dans l'onglet « Détection IA », puis valide ou ignore les irritants proposés. Rien n'est envoyé ni décidé automatiquement.

## Fournisseurs disponibles

1. Anthropic (Claude), via son API native.
2. Tous les fournisseurs compatibles OpenAI : OpenAI, Google Gemini, Mistral AI, Groq, DeepSeek, xAI, OpenRouter, Together AI.
3. « Autre API compatible OpenAI » : vous saisissez l'adresse (https, nom de domaine public). Cela couvre aussi les passerelles et hébergeurs de modèles qui copient l'API OpenAI.
4. Non couverts : Azure OpenAI (chemins et authentification différents), AWS Bedrock, Vertex AI, et un modèle local sur votre PC (la fonction tourne chez Supabase et ne peut pas l'atteindre).
5. Les noms de modèles changent souvent : le bouton « Charger les modèles » interroge le fournisseur avec votre clé et remplit la liste. Seul Anthropic a un modèle par défaut prérempli (`claude-sonnet-5-5`, à vérifier dans votre compte).

## D'où vient la clé : quatre possibilités, dans cet ordre

1. Clé saisie dans le champ « Clé d'API » : utilisée pour cette analyse, jamais stockée. Elle reste en mémoire dans la page jusqu'au rechargement.
2. Clé personnelle mémorisée (bouton « Mémoriser ma clé ») : chiffrée par la fonction avant d'être écrite en base, utilisable seulement par votre compte.
3. Clé par défaut du projet en base (bouton « Définir comme défaut du projet ») : fournisseur, modèle et clé partagés par tous les HRBP, chiffrés en base.
4. Secret Supabase nommé `<FOURNISSEUR>_API_KEY` (par exemple `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`) : c'est le « défaut en configuration ».

Pourquoi pas dans `js/config.js` : ce fichier est publié avec le site, donc public. Y mettre une clé d'API reviendrait à la donner à tout visiteur. Les deux endroits sûrs sont le secret Supabase (4) et la base chiffrée (3).

## Étape 1. Obtenir une clé d'API

1. Créer un compte développeur chez le fournisseur de votre choix (par exemple console.anthropic.com, platform.openai.com, aistudio.google.com, console.mistral.ai). C'est distinct d'un abonnement grand public.
2. Ajouter du crédit et fixer une limite de dépense basse pour le hackathon.
3. Créer une clé et ne la coller ni dans le site, ni dans GitHub, ni dans un mail.

## Étape 2. Créer les tables

1. Supabase, SQL Editor : lancer `supabase/migration-detection.sql`, puis `supabase/migration-ia.sql`.
2. Nouvelle installation depuis zéro : `schema.sql` puis `seed.sql` suffisent, les deux migrations sont déjà incluses.

## Étape 3. Déployer la fonction

Option A, sans outil en ligne de commande :

1. Supabase, Edge Functions. Si la fonction `detect-irritants` existe déjà, l'ouvrir et remplacer son code. Sinon : Deploy a new function, Via Editor, nom exact `detect-irritants`.
2. Coller le contenu de `supabase/functions/detect-irritants/index.ts`, puis Deploy. Laisser « Verify JWT » activé.
3. Edge Functions, Secrets : ajouter `KEY_ENCRYPTION_SECRET` avec une longue phrase aléatoire que vous gardez (par exemple 40 caractères). Elle sert à chiffrer les clés mémorisées. Si vous la changez plus tard, les clés déjà mémorisées deviennent illisibles : il faudra les ressaisir.
4. Facultatif : ajouter un ou plusieurs secrets `<FOURNISSEUR>_API_KEY` pour un défaut en configuration.

Option B, avec la CLI :

```
npx supabase login
npx supabase link --project-ref VOTRE_REF_PROJET
npx supabase secrets set KEY_ENCRYPTION_SECRET=une-longue-phrase-aleatoire
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
npx supabase functions deploy detect-irritants
```

## Étape 4. Publier le site

```
git add .
git commit -m "IA multi fournisseurs"
git push
```

## Étape 5. Tester

1. Se connecter avec un vrai compte au profil HRBP (pas la démonstration), onglet « Détection IA ».
2. Choisir le fournisseur, cliquer « Charger les modèles » (après avoir saisi une clé ou si une clé par défaut existe), choisir le modèle.
3. Cliquer « Lancer la détection ». L'analyse prend quelques secondes.
4. Pour garder ce réglage pour tous : « Définir comme défaut du projet ».

Erreurs fréquentes : 400 (pas de clé, pas de modèle ou adresse refusée), 401 (non connecté), 403 (pas HRBP, ou session de démonstration), 429 (plus de 10 analyses dans l'heure), 502 (le fournisseur a refusé : clé, crédit, modèle sans appel d'outil). Journaux détaillés : Supabase, Edge Functions, detect-irritants, Logs.

## Ce que le système garantit, et ce qu'il ne garantit pas

1. Les mails confidentiels ne sont jamais transmis au fournisseur d'IA, et un mail déclaré confidentiel dans le formulaire n'est même pas enregistré.
2. Seul le rôle de l'expéditeur est transmis, pas son nom. Les noms qui figurent dans l'objet ou le texte, eux, sont transmis.
3. Chaque irritant doit citer des sources qui existent, sinon il est rejeté. Cela limite les inventions mais ne prouve pas que l'interprétation soit juste : le HRBP relit.
4. Les clés mémorisées sont chiffrées (AES-GCM) et le site ne peut pas les relire. Elles restent déchiffrables par la fonction, donc par quiconque administre votre projet Supabase et ses secrets. Une clé tapée transite par la fonction (https) : ne la saisissez que sur votre propre site.
5. Tous les HRBP du projet peuvent utiliser la clé par défaut, donc dépenser dessus. Limite de 10 analyses par heure et par compte, 200 sources par analyse (modifiable en tête de `index.ts`).
6. La démonstration anonyme n'a pas accès à la détection, sinon n'importe qui avec l'adresse du site déclencherait des appels payants.
7. Cette version a été testée avec de faux fournisseurs, pas avec les vrais. Les fournisseurs compatibles OpenAI diffèrent par détails (appel d'outil forcé, paramètres des modèles de raisonnement) : la fonction réessaie sans forcer l'outil et lit un JSON dans le texte en dernier recours, mais un modèle peut malgré tout échouer. Dans ce cas, essayez un autre modèle ou fournisseur.

## Avant d'utiliser de vrais mails

Les données du hackathon sont fictives. Pour de vrais mails Scalian : accord écrit de Scalian pour envoyer ces contenus à un fournisseur d'IA, vérification des conditions de traitement du fournisseur (conservation, localisation, usage pour l'entraînement), information des personnes concernées, et dépôt privé plutôt que public.

## Suite possible (non construite)

1. Analyse planifiée (toutes les nuits) avec Supabase Cron.
2. Alimentation automatique : redirection des mails de la boîte RH vers un webhook (Make) qui ajoute les sources en base.
3. Promotion d'une détection validée en irritant de référence du registre.

## Dépannage : « Failed to send a request to the Edge Function »

Ce message vient du navigateur : il n'a obtenu aucune réponse lisible de la fonction. Il ne dit pas pourquoi. L'onglet Détection IA l'explique désormais lui même : chaque erreur affiche une origine probable et des actions numérotées, et le bouton « Diagnostiquer » teste chaque maillon.

Ordre des vérifications faites par le diagnostic :

1. js/config.js : URL et clé anon renseignées.
2. Projet Supabase joignable (pas en pause, bonne adresse).
3. Session réelle (pas la démo) et profil HRBP.
4. Tables de détection et d'IA présentes (migration-detection.sql puis migration-ia.sql).
5. Fonction detect-irritants joignable. Si le serveur répond sans en-têtes CORS, la fonction n'est pas déployée sous ce nom exact ou plante au démarrage.
6. Version de la fonction (3 attendue), secret KEY_ENCRYPTION_SECRET, secrets de clés, clé disponible pour le fournisseur.

Cause la plus fréquente : la fonction n'a pas été déployée. Dans Supabase : Edge Functions, Deploy a new function, nom exact detect-irritants, collez supabase/functions/detect-irritants/index.ts, Deploy. Après chaque modification de index.ts, redéployez : le site ne met pas la fonction à jour tout seul.

Codes d'erreur renvoyés par la fonction : AUTH, ANON, ROLE, TABLES, NO_KEY, NO_MODEL, NO_SECRET, BAD_URL, RATE, NO_SOURCES, BAD_RESPONSE, PROVIDER, INTERNE.
