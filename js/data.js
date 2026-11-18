/* Données de référence (jeu fictif). Sert de secours si Supabase est absent ou vide. */
// ---------------------------------------------------------------------------
// Données : jeu de données v5 « intégration des nouveaux collaborateurs » (fictif)
// ---------------------------------------------------------------------------

const SOURCES = {
  mail: { label: "Boîte RH", cls: "b-violet" },
  cr:   { label: "Compte rendu", cls: "b-sky" },
};

// Types de réponse, du plus simple au plus lourd
const REPONSES = [
  { id: "reglage",        label: "Réglage d'un outil existant", color: "#64748b" },
  { id: "document",       label: "Document ou modèle unique",   color: "#059669" },
  { id: "automatisation", label: "Automatisation simple",       color: "#0284c7" },
  { id: "workflow",       label: "Workflow sans IA",            color: "#0d9488" },
  { id: "agent",          label: "Nouvel agent IA",             color: "#7c3aed" },
];

const IRRITANTS = [
  { id: "arrivee", titre: "Arrivées mal préparées : annonces incomplètes, demandes au support trop tardives", court: "Arrivées mal préparées", signal: "Arrivée mal préparée", color: "#e11d48",
    note: 11, traitement: "Assister", reponse: "agent", demo: true,
    proposition: "Agent d'intégration : à chaque annonce d'arrivée, il compare l'annonce à la checklist, liste ce qui manque, calcule le rétro-planning (poste 10 jours ouvrés, habilitation 15, badge 3) et prépare les messages au manager, à l'informatique et aux services généraux.",
    pourquoi: "Lire une annonce écrite librement, repérer ce qui manque selon le profil (une habilitation pour un consultant cybersécurité) et rédiger trois messages adaptés demande compréhension et rédaction. Un formulaire aide, mais les managers continueront d'écrire par mail (mails 1, 4, 14, 21). L'agent prépare, la RH envoie." },
  { id: "doc", titre: "Documentation dispersée : plusieurs versions, liens inaccessibles, règles contradictoires", court: "Documentation dispersée", signal: "Version incertaine", color: "#7c3aed",
    note: 10, traitement: "Simplifier (sans agent)", reponse: "document",
    proposition: "Pas d'agent. Une page de référence unique, une seule version par document, lisible avant l'arrivée. La RH archive les anciennes versions.",
    pourquoi: "Le problème n'est pas de trouver le document : il en existe trois. Un agent de recherche documentaire masquerait le désordre au lieu de le supprimer." },
  { id: "questions", titre: "Mêmes questions à chaque arrivée (télétravail, mutuelle, premier jour)", court: "Questions récurrentes", signal: "Question récurrente", color: "#0ea5e9",
    note: 7, traitement: "Simplifier", reponse: "document",
    proposition: "Une FAQ d'accueil jointe au mail de bienvenue. L'assistant en propose le contenu à partir des questions reçues, la RH valide.",
    pourquoi: "Les questions sont prévisibles et les réponses stables : un document suffit. L'IA sert une seule fois, pour rédiger la FAQ." },
  { id: "actions", titre: "Actions de réunion jamais fermées, comptes rendus diffusés tard et peu lus", court: "Actions jamais fermées", signal: "Action reportée", color: "#10b981",
    note: 7, traitement: "Simplifier", reponse: "document",
    proposition: "Un modèle de compte rendu avec un tableau d'actions (responsable, échéance, statut) repris en tête du compte rendu suivant. En option, l'assistant prépare le brouillon à partir de notes tapées, jamais d'un enregistrement.",
    pourquoi: "Ce qui manque, c'est un suivi des actions, pas une rédaction plus rapide. Visios et enregistrements sont exclus par Scalian." },
  { id: "boucle", titre: "Services généraux hors de la boucle des arrivées", court: "Acteur oublié", signal: "Acteur oublié", color: "#f59e0b",
    note: 6, traitement: "Simplifier", reponse: "reglage",
    proposition: "Ajouter les services généraux à la liste de diffusion des annonces d'arrivée.",
    pourquoi: "Un réglage de messagerie suffit : aucune IA n'est nécessaire pour mettre quelqu'un en copie." },
  { id: "pieces", titre: "Pièces renvoyées faute d'accusé de réception", court: "Pièces renvoyées", signal: "Renvoi", color: "#64748b",
    note: 6, traitement: "Automatiser", reponse: "automatisation",
    proposition: "Une réponse automatique à la réception d'un dossier, avec la liste des pièces attendues. L'assistant ne lit jamais le contenu des pièces.",
    pourquoi: "Accuser réception est une règle fixe. Les pièces contiennent des données personnelles : l'IA n'a rien à y faire." },
];

// Fil d'événements, dans l'ordre des jours. Le mail 21 est gardé pour « l'envoi en direct ».
const EVENTS = [
  { jour: "J1", src: "mail", ref: "Mail 1", de: "Olivier Lambert, manager", titre: "Arrivée Hugo Lefèvre", texte: "Hugo arrive le lundi 15 comme consultant test logiciel. « Vous pouvez lancer le nécessaire ? »", irr: ["arrivee"], aparte: "" },
  { jour: "J2", src: "cr", ref: "CR-1", titre: "Point hebdo intégration", texte: "« Arrivées à venir : aucune signalée. » Délai poste rappelé : 10 jours ouvrés. Mise à jour du livret d'accueil : reportée, prévue depuis septembre. Accès aux documents avant l'arrivée : sans responsable.", irr: ["arrivee", "doc", "actions"] },
  { jour: "J2", src: "mail", ref: "Mail 2", de: "Camille Rousseau, RH", titre: "Bienvenue chez nous !", texte: "Liste des pièces à retourner, et lien vers le livret d'accueil : Livret_accueil_2024.pdf.", irr: ["doc"] },
  { jour: "J3", src: "mail", ref: "Mail 3", de: "Hugo Lefèvre, futur employé", titre: "RE: Bienvenue chez nous !", texte: "« Le livret indique un jour de télétravail, en entretien on m'a parlé de deux. » Ne trouve pas le formulaire de mutuelle.", irr: ["doc", "questions"] },
  { jour: "J4", src: "mail", ref: "Mail 4", de: "Olivier Lambert, manager", titre: "Encore une arrivée le 15", texte: "Sarah arrive aussi le 15. « Il lui faudra un PC, je ne sais pas trop à qui faire la demande. »", irr: ["arrivee"] },
  { jour: "J5", src: "mail", ref: "Mail 5", de: "Sarah Benmoussa, future employée", titre: "Lien mutuelle", texte: "Le lien vers le formulaire de mutuelle affiche « accès refusé ».", irr: ["doc", "questions"] },
  { jour: "J8", src: "mail", ref: "Mail 6", de: "Camille Rousseau, RH", titre: "2 postes pour lundi 15", texte: "Demande à l'informatique deux PC et les comptes, 5 jours ouvrés avant l'arrivée.", irr: ["arrivee"] },
  { jour: "J9", src: "cr", ref: "CR-2", titre: "Point hebdo intégration", texte: "Postes commandés, livraison deux jours après l'arrivée. Formulaires de compte en attente. Livret : reporté. Checklist commune : « à lancer ». Services généraux excusés pour la 2e fois.", irr: ["actions", "boucle", "arrivee"] },
  { jour: "J9", src: "mail", ref: "Mail 7", de: "Marc Dubois, informatique", titre: "RE: 2 postes pour lundi 15", texte: "« Le délai, c'est 10 jours ouvrés. » Livraison le 17 au plus tôt ; formulaire de création de compte manquant pour les deux.", irr: ["arrivee"] },
  { jour: "J9", src: "mail", ref: "Mail 8", de: "Hugo Lefèvre, futur employé", titre: "Mes documents (2e envoi)", texte: "Renvoie ses documents : pas de confirmation du premier envoi.", irr: ["pieces"] },
  { jour: "J10", src: "mail", ref: "Mail 9", de: "Camille Rousseau, RH", titre: "Formulaire création de compte", texte: "« Je crois que c'est la bonne version, il y en a deux sur le SharePoint. »", irr: ["doc"] },
  { jour: "J11", src: "mail", ref: "Mail 10", de: "Sarah Benmoussa, future employée", titre: "Lundi : où et à quelle heure ?", texte: "Pas de programme reçu : agence ou client ? À quelle heure ?", irr: ["questions"] },
  { jour: "J12", src: "mail", ref: "Mail 11", de: "Sandrine Petit, services généraux", titre: "Arrivées de lundi ?", texte: "« J'apprends à la machine à café que deux personnes arrivent lundi. » Badges non commandés.", irr: ["boucle", "arrivee"] },
  { jour: "J15", src: "mail", ref: "Mail 12", de: "Olivier Lambert, manager", titre: "Premier jour sans PC", texte: "Les deux arrivants passent la journée sans PC. « Est-ce qu'on peut éviter ça la prochaine fois ? »", irr: ["arrivee"] },
  { jour: "J16", src: "mail", ref: "Mail 13", de: "Hugo Lefèvre, nouvel arrivant", titre: "Quel livret d'accueil ?", texte: "Trois livrets dans le dossier Accueil (2024, 2025_v2, 2025 FINAL) : « Lequel fait foi ? » Note de frais introuvable.", irr: ["doc"] },
  { jour: "J16", src: "mail", ref: "Mail 14", de: "Julien Mercier, HRBP", titre: "Arrivée Antoine Roche lundi 22", texte: "Consultant sécurité, arrive dans 6 jours. « Tu as une checklist d'arrivée à jour ? Je n'ai que celle de 2023. »", irr: ["arrivee", "doc"] },
  { jour: "J17", src: "mail", ref: "Mail 15", de: "Antoine Roche, futur employé", titre: "Quelques questions avant lundi", texte: "Télétravail ? Mutuelle ? Heure d'arrivée lundi ? Les mêmes questions que les deux arrivants précédents.", irr: ["questions"] },
  { jour: "J18", src: "mail", ref: "Mail 16", de: "Marc Dubois, informatique", titre: "Habilitation Antoine", texte: "Une habilitation cybersécurité se demande 15 jours ouvrés avant. « Personne ne me l'a demandée. »", irr: ["arrivee"] },
  { jour: "J18", src: "mail", ref: "Mail 17", de: "Expéditeur masqué", titre: "Demande de rendez-vous confidentiel", texte: "Contenu non affiché.", irr: [], conf: true, aparte: "Classé confidentiel sur son objet : contenu non analysé, non résumé, non inscrit au registre. Transmis tel quel au HRBP." },
  { jour: "J19", src: "mail", ref: "Mail 18", de: "Mutuelle", titre: "Votre lettre d'information de novembre", texte: "Newsletter.", irr: [], aparte: "Bruit : ignoré." },
  { jour: "J19", src: "mail", ref: "Mail 19", de: "Comité d'agence", titre: "Afterwork de fin d'année", texte: "Invitation.", irr: [], aparte: "Bruit : ignoré." },
  { jour: "J19", src: "cr", ref: "CR-3", titre: "Point hebdo intégration (réunion J16, diffusé J19)", texte: "Deux arrivants sans PC le premier jour. Chacun tient sa liste : tableur RH, outil informatique, cahier des services généraux. Livret : 3e report. Checklist commune : pas commencée.", irr: ["actions", "boucle", "doc"] },
  { jour: "J19", src: "cr", ref: "CR-4", titre: "Comité RH mensuel", texte: "Premiers jours difficiles remontés par deux managers. Télétravail : l'accord 2025 dit deux jours, le livret un seul. Checklist commune déjà décidée au comité précédent. Les managers ne lisent pas les comptes rendus des points hebdo. Sujet reporté.", irr: ["actions", "doc", "arrivee"] },
  { jour: "J22", src: "mail", ref: "Mail 20", de: "Karine Dumas, manager", titre: "Arrivée d'Antoine", texte: "PC de secours prêté, mais pas d'accès à l'outil des temps ni d'habilitation avant deux semaines : impossible de le positionner sur sa mission.", irr: ["arrivee"] },
];

const LIVE_EVENT = { jour: "Live", src: "mail", ref: "Mail 21", de: "Isabelle Moreau, manager", titre: "Arrivée Lucas Fabre lundi prochain", texte: "« Lucas Fabre nous rejoint lundi prochain comme consultant data. Merci de faire le nécessaire ! »", irr: ["arrivee"], live: true };



// Contre-analyse : seuls les résultats écrits dans le jeu de données sont affichés
const CONTRE = {
  arrivee: { objection: "Un formulaire d'annonce obligatoire suffirait peut-être, sans agent.", verif: "Les 4 annonces arrivent par mail, écrites librement, par 4 personnes différentes (mails 1, 4, 14, 21). Le délai de 10 jours est connu de tous (CR-1, mail 7) et pourtant dépassé : le problème est autant le calcul des échéances que la saisie.", conclusion: "Irritant maintenu, confiance moyenne. Recommandation : un formulaire (sans IA) ET l'agent pour les annonces qui continueront d'arriver par mail. À confirmer avec la RH.", ok: true },
  doc: { objection: "Un agent de recherche documentaire aiderait-il les arrivants à trouver le bon livret ?", verif: "Le problème n'est pas de trouver : il existe 3 livrets, 2 formulaires de compte et 2 textes sur le télétravail qui se contredisent (mails 3, 9, 13, CR-4).", conclusion: "Pas d'agent. Une page de référence unique, une version par document. Un agent masquerait le désordre au lieu de le supprimer.", ok: true },
};
const QUESTIONS_CONTRE = [
  "Le mail est-il vraiment ce que la détection affirme (une annonce, une question, un renvoi) ?",
  "L'information a-t-elle pu circuler ailleurs (téléphone, réunion) ?",
  "L'irritant tient-il au processus, ou à un cas isolé ?",
  "Les sources citées disent-elles bien ce que la détection affirme ?",
  "La réponse proposée est-elle la plus simple ? Un document ou un réglage suffirait-il ?",
];

// Livrable 03 : spec complète de l'agent d'intégration (modèle en 11 rubriques)
const SPEC_INTEGRATION = [
  ["Irritant détecté", "Les arrivées sont mal préparées : 3 annonces incomplètes sur 3, demandes au support parties après les délais connus, 3 arrivants sur 3 sans poste ou sans accès complet le premier jour. Sources : mails 1, 4, 6, 7, 11, 12, 14, 16, 20 ; CR-1 à CR-4. Confiance moyenne après contre-analyse. Interprétation des signaux, pas une cause prouvée. Données fictives."],
  ["Besoin métier", "« Quand un manager m'annonce une arrivée, je veux savoir tout de suite ce qui manque et ce qui est déjà en retard, et avoir les messages prêts. » (administration du personnel)"],
  ["Utilisateurs", "L'administration du personnel (valide et envoie), le manager (reçoit la demande d'informations), l'informatique et les services généraux (reçoivent les demandes), le HRBP (propriétaire du processus)."],
  ["Entrées", "Mails de la boîte RH qui annoncent une arrivée ; checklist d'intégration de référence et délais par étape (Notion)."],
  ["Sorties", "Une fiche d'arrivée dans Notion (étapes, échéances, statut) ; 3 brouillons : au manager (informations manquantes), à l'informatique (poste, comptes, habilitation), aux services généraux (badge, place) ; une alerte si un délai est déjà dépassé, avec une solution de repli."],
  ["Workflow", "1. Un mail annonce une arrivée. 2. L'agent extrait date, poste, manager, lieu, matériel, accès. 3. Il compare à la checklist et liste ce qui manque. 4. Il calcule le rétro-planning et repère les délais dépassés. 5. Il crée la fiche d'arrivée et prépare les 3 brouillons. 6. La RH relit, modifie, envoie. 7. Cinq jours avant l'arrivée, l'agent signale les étapes non faites."],
  ["Niveau d'autonomie", "Préparer. L'agent n'envoie rien : une mauvaise date ou un message mal formulé peut coûter un premier jour. Le passage à « agir » (envoi automatique des demandes standard à l'informatique) n'est envisageable qu'après une période de mesure, sur décision du HRBP."],
  ["Permissions et risques", "Lecture de la boîte RH ; écriture de la fiche d'arrivée et des brouillons. Jamais : lire les pièces administratives, lire un mail classé confidentiel, envoyer un mail, évaluer une personne. Risque : données personnelles du futur employé. Parade : l'agent ne traite que l'annonce (nom, date, poste), jamais le dossier. Risque : faux positif. Parade : la RH valide chaque fiche."],
  ["Agent proposé", "Nouvel agent, branché sur la boîte RH (MCP Thunderbird) et sur Notion (checklist, fiches d'arrivée). En complément, sans IA : un formulaire d'annonce pour les managers qui préfèrent l'utiliser."],
  ["Critères d'acceptation", "Sur le jeu de données : les 4 annonces reconnues (mails 1, 4, 14, 21) ; les informations manquantes listées sans erreur ; le délai dépassé signalé pour le mail 21 ; l'habilitation de l'arrivant cybersécurité repérée dès le mail 14 ; le mail 17 jamais analysé ; aucun mail envoyé."],
  ["Gain attendu et indicateur", "Indicateur principal : part des arrivants avec poste et accès prêts le premier jour. Secondaire : nombre de mails échangés par arrivée avant le premier jour. Valeurs : à mesurer, avant et après."],
];

const GEN_STEPS = ["Lecture de l'irritant validé et de ses sources", "Application du modèle en 11 rubriques", "Choix du niveau d'autonomie le plus bas qui suffit", "Vérification : validation humaine, aucun envoi, aucun chiffre inventé, aucune donnée individuelle"];

const PROMPT_GEN = "Tu es analyste métier RH. À partir de l'irritant ci-dessous et de ses sources, rédige une spécification selon ce modèle : Irritant détecté, Besoin métier, Utilisateurs, Entrées, Sorties, Workflow, Niveau d'autonomie, Permissions et risques, Agent proposé, Critères d'acceptation, Gain attendu et indicateur.\n\nRègles :\n- Propose d'abord la réponse la plus simple : un réglage, un document ou un workflow sans IA avant un agent.\n- Le workflow contient toujours une étape de validation humaine.\n- Rien n'est envoyé sans validation.\n- Aucune donnée individuelle : l'irritant décrit une étape du processus, jamais une personne.\n- Les mails confidentiels et les pièces administratives ne sont jamais lus.\n- N'invente aucun chiffre : si un gain n'est pas chiffrable, écris-le.\n- Cite les sources (numéros de mails, comptes rendus).";

// Livrable 04 : simulation de l'agent d'intégration sur le mail 21
const AGENT_STEPS = [
  { label: "Lecture du mail 21", detail: "« Lucas Fabre nous rejoint lundi prochain comme consultant data. Merci de faire le nécessaire ! »", outil: "MCP Thunderbird" },
  { label: "Reconnaissance d'une annonce d'arrivée", detail: "Nom, poste (consultant data), date (lundi prochain), manager (expéditrice).", outil: "Claude" },
  { label: "Comparaison avec la checklist", detail: "Manquent 3 informations sur 6 : lieu du premier jour, matériel, accès particuliers.", outil: "MCP Notion" },
  { label: "Calcul du rétro-planning", detail: "Poste : 10 jours ouvrés, délai déjà dépassé. Badge : 3 jours, possible si demandé aujourd'hui. Repli proposé : PC de secours.", outil: "Claude" },
  { label: "Rapprochement avec l'historique", detail: "Même schéma pour les 3 arrivées précédentes, quel que soit le manager : c'est le processus qui est en cause, pas une personne.", outil: "Claude" },
  { label: "Contre-analyse", detail: "Les informations ont-elles été données par téléphone ? Aucune trace écrite : l'agent pose la question au lieu de supposer.", outil: "Claude" },
  { label: "Fiche d'arrivée et 3 brouillons", detail: "Fiche créée dans Notion. Brouillons : à la manager, à l'informatique, aux services généraux.", outil: "MCP Notion" },
  { label: "La RH relit et envoie", detail: "Camille valide, modifie ou ignore. L'agent n'envoie rien lui-même.", outil: "Humain", human: true },
];

const ROLES = [
  { id: "collab",  nom: "Camille", role: "Administration du personnel", persona: "Collaborateur",
    tabs: [["arrivees", "Arrivées à préparer"], ["registre", "Ce que l'assistant repère dans mon activité"]] },
  { id: "manager", nom: "Isabelle", role: "Manager BU Data", persona: "Manager",
    tabs: [["mesarrivees", "Mes arrivées"], ["equipe", "Irritants qui touchent mon équipe"]] },
  { id: "hrbp",    nom: "Julien", role: "HRBP", persona: "HRBP",
    tabs: [["registre", "Registre RH"], ["orienter", "Valider et orienter"], ["spec", "Spécifications"], ["suivre", "Suivi des réponses"]] },
  { id: "dir",     nom: "Direction", role: "Direction d'agence", persona: "Dirigeants",
    tabs: [["tableau", "Tableau de bord"]] },
  { id: "futur",   nom: "Lucas", role: "Futur employé", persona: "Futur employé",
    tabs: [["futur", "Ce qu'il reçoit"]] },
];

const ARRIVEES_PASSEES = [
  { nom: "Hugo Lefèvre", poste: "Consultant test logiciel", date: "J15", etat: "Premier jour sans poste (mail 12)" },
  { nom: "Sarah Benmoussa", poste: "Consultante PMO", date: "J15", etat: "Premier jour sans poste (mail 12)" },
  { nom: "Antoine Roche", poste: "Consultant cybersécurité", date: "J22", etat: "PC de secours ; habilitation et outil des temps manquants (mail 20)" },
];

const BROUILLONS = [
  { id: "manager", a: "Isabelle Moreau, manager", objet: "Arrivée de Lucas Fabre : 3 informations manquantes",
    corps: "Bonjour Isabelle, pour préparer l'arrivée de Lucas lundi, il nous manque le lieu du premier jour (agence ou client), le matériel nécessaire et les accès particuliers éventuels. Le délai habituel d'un poste (10 jours ouvrés) est dépassé : nous demandons un PC de secours. Vous pouvez aussi compléter l'annonce dans ACIA. Camille" },
  { id: "it", a: "Marc Dubois, informatique", objet: "Arrivée lundi : PC de secours et comptes",
    corps: "Bonjour Marc, Lucas Fabre, consultant data, arrive lundi dans la BU Data. Le délai poste est dépassé : un PC de secours est-il possible ? Le formulaire de création de compte, signé par Isabelle Moreau, suit. Camille" },
  { id: "sg", a: "Sandrine Petit, services généraux", objet: "Arrivée lundi : badge et place",
    corps: "Bonjour Sandrine, Lucas Fabre arrive lundi : badge et place à prévoir. Le lieu du premier jour est en cours de confirmation avec sa manager. Camille" },
];

const IDENT = {
  collab:  ["Camille Rousseau", "Chargée d'administration du personnel"],
  manager: ["Isabelle Moreau", "Manager BU Data"],
  hrbp:    ["Julien Mercier", "HRBP de l'agence"],
  dir:     ["Direction", "Direction d'agence"],
  futur:   ["Lucas Fabre", "Futur employé, consultant data"],
};

// Le manager ne voit que les irritants dont une étape dépend de lui, décrits au niveau du processus.
// Jamais de nom de collègue, jamais de comparaison entre managers ou entre équipes.
const IRR_MANAGER = [
  ["arrivee", "L'annonce de l'arrivée est l'étape du manager : c'est elle qui déclenche le poste, les comptes, l'habilitation et le badge."],
  ["boucle", "Les annonces d'arrivée partent sans les services généraux : le badge et la place sont demandés trop tard."],
  ["actions", "Au comité où les managers sont présents, des actions sur l'intégration sont décidées sans responsable ni échéance."],
];
