/* Conteneurs vides : toutes les données (irritants, mails, comptes rendus, spécification, rôles,
   textes de référence, brouillons) sont chargées depuis Supabase après la connexion (js/db.js).
   Pour modifier un contenu, éditez la base : tables irritants, events, brouillons, arrivees et ref_content. */
const SOURCES = {};
const REPONSES = [];
const IRRITANTS = [];
const EVENTS = [];
const LIVE_EVENT = {};
const CONTRE = {};
const QUESTIONS_CONTRE = [];
const SPEC_INTEGRATION = [];
const GEN_STEPS = [];
let PROMPT_GEN = "";
const AGENT_STEPS = [];
const ROLES = [];
const ARRIVEES_PASSEES = [];
const BROUILLONS = [];
const IDENT = {};
const IRR_MANAGER = [];
const INDICATEURS = {};
const CONFIANCE = [];
const CONFIANCE_MANAGER = [];
const FUTUR_MAIL = [];
