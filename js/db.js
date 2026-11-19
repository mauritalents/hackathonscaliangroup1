/* Couche d'accès à Supabase pour ACIA.
   Si la configuration est absente, DB.enabled reste false et le site tourne en mode démonstration locale. */
const DB = { enabled: false, client: null, user: null, profile: null, demo: false };

function dbConfigured() {
  const c = window.ACIA_CONFIG || {};
  return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY &&
    c.SUPABASE_URL.indexOf("VOTRE") === -1 && c.SUPABASE_ANON_KEY.indexOf("VOTRE") === -1 && window.supabase);
}

function dbInit() {
  if (!dbConfigured()) return false;
  DB.client = window.supabase.createClient(window.ACIA_CONFIG.SUPABASE_URL, window.ACIA_CONFIG.SUPABASE_ANON_KEY);
  DB.enabled = true;
  return true;
}

function toast(msg, isErr) {
  const t = document.createElement("div");
  t.className = "toast" + (isErr ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 3500);
}

// Lance une écriture en base sans bloquer l'interface ; signale l'erreur à l'utilisateur.
function dbRun(promise, what) {
  if (!DB.enabled) return;
  Promise.resolve(promise).then(function (res) {
    if (res && res.error) { console.error(what, res.error); toast("Enregistrement impossible : " + res.error.message, true); }
  });
}

async function dbSignIn(email, password) {
  const r = await DB.client.auth.signInWithPassword({ email: email, password: password });
  if (r.error) throw r.error;
  DB.user = r.data.user;
}
async function dbSignUp(email, password, fullName) {
  const r = await DB.client.auth.signUp({ email: email, password: password, options: { data: { full_name: fullName || "" } } });
  if (r.error) throw r.error;
  return r.data; // data.session est null si la confirmation par e-mail est activée
}
// Mode démonstration : session anonyme Supabase + profil choisi, pour que tout soit enregistré en base.
async function dbDemoSignIn(roleId) {
  let r = await DB.client.auth.getSession();
  if (!r.data.session) {
    const a = await DB.client.auth.signInAnonymously();
    if (a.error) throw a.error;
    DB.user = a.data.user;
  } else { DB.user = r.data.session.user; }
  const s = await DB.client.rpc("set_demo_role", { r: roleId });
  if (s.error) throw s.error;
}
async function dbSignOut() { if (DB.enabled) await DB.client.auth.signOut(); DB.user = null; DB.profile = null; }

async function dbLoadProfile() {
  const r = await DB.client.from("profiles").select("id,email,full_name,role").eq("id", DB.user.id).single();
  if (r.error) throw r.error;
  DB.profile = r.data;
  return r.data;
}

function replaceContent(target, rows) { target.splice(0, target.length); rows.forEach(function (x) { target.push(x); }); }

function setContent(target, value) {
  if (Array.isArray(target)) { target.splice(0, target.length); (value || []).forEach(function (x) { target.push(x); }); }
  else { Object.keys(target).forEach(function (k) { delete target[k]; }); Object.assign(target, value || {}); }
}

// Table ref_content : clé SQL -> variable globale déclarée (vide) dans data.js
function contentTargets() {
  return { sources: SOURCES, reponses: REPONSES, contre: CONTRE, questions_contre: QUESTIONS_CONTRE,
    spec_integration: SPEC_INTEGRATION, gen_steps: GEN_STEPS, agent_steps: AGENT_STEPS, roles: ROLES,
    arrivees_passees: ARRIVEES_PASSEES, ident: IDENT, irr_manager: IRR_MANAGER, indicateurs: INDICATEURS,
    confiance: CONFIANCE, confiance_manager: CONFIANCE_MANAGER, futur_mail: FUTUR_MAIL };
}

// Charge toutes les données de référence depuis Supabase (plus aucune donnée métier dans le code).
async function dbLoadReference() {
  const role = DB.profile.role;
  const rc = await DB.client.from("ref_content").select("key,value");
  if (rc.error) throw rc.error;
  const targets = contentTargets();
  (rc.data || []).forEach(function (x) {
    if (x.key === "prompt_gen") PROMPT_GEN = x.value;
    else if (targets[x.key]) setContent(targets[x.key], x.value);
  });
  if (!ROLES.length) throw new Error("Base vide : exécutez supabase/seed.sql (table ref_content).");

  const irr = await DB.client.from("irritants").select("*").order("position");
  if (irr.error) throw irr.error;
  replaceContent(IRRITANTS, irr.data.map(function (x) {
    return { id: x.id, titre: x.titre, court: x.court, signal: x.signal, color: x.color, note: x.note,
      traitement: x.traitement, reponse: x.reponse, demo: x.demo, proposition: x.proposition, pourquoi: x.pourquoi };
  }));
  const full = (role === "collab" || role === "hrbp");
  // Les managers et la direction ne reçoivent que les références (pas le contenu des mails) : vue event_refs.
  const ev = full
    ? await DB.client.from("events").select("*").order("position")
    : await DB.client.from("event_refs").select("*").order("position");
  if (ev.error) throw ev.error;
  const map = function (x) {
    return { jour: x.jour, src: x.src, ref: x.ref, de: x.de_nom || undefined, titre: x.titre || "", texte: x.texte || "",
      irr: x.irr || [], conf: x.conf || undefined, aparte: x.aparte || "", live: x.live || undefined };
  };
  replaceContent(EVENTS, ev.data.filter(function (x) { return !x.live; }).map(map));
  const live = ev.data.filter(function (x) { return x.live; });
  if (live.length) Object.assign(LIVE_EVENT, map(live[0]));
}

// Charge l'état partagé (validations, avis, arrivée) et le met dans l'objet state de app.js.
async function dbLoadState() {
  const role = DB.profile.role;
  const st = await DB.client.from("irritant_status").select("irritant_id,status");
  if (!st.error) (st.data || []).forEach(function (x) { state.status[x.irritant_id] = x.status; });

  state.avisMgr = {};
  if (role === "manager" || role === "hrbp") {
    const av = await DB.client.from("manager_avis").select("irritant_id,avis,updated_at").order("updated_at");
    if (!av.error) (av.data || []).forEach(function (x) { state.avisMgr[x.irritant_id] = x.avis; });
  }

  if (role !== "dir") {
    const ar = await DB.client.from("arrivees").select("*").eq("id", "lucas-fabre").maybeSingle();
    if (!ar.error && ar.data) {
      state.lucas.recu = ar.data.recu;
      state.lucas.complete = ar.data.complete;
      state.lucas.infos = { lieu: ar.data.lieu || "", materiel: ar.data.materiel || "", acces: ar.data.acces || "" };
    }
    if (role === "collab" || role === "hrbp") {
      const br = await DB.client.from("brouillons").select("id,destinataire,objet,corps,statut,position").order("position");
      if (!br.error) {
        state.lucas.envoyes = {};
        replaceContent(BROUILLONS, (br.data || []).map(function (x) { return { id: x.id, a: x.destinataire, objet: x.objet, corps: x.corps }; }));
        (br.data || []).forEach(function (x) { if (x.statut) state.lucas.envoyes[x.id] = x.statut; });
      }
    }
  }
}

function dbSetStatus(id, status) {
  dbRun(DB.client.from("irritant_status").update({ status: status, updated_by: DB.user && DB.user.id, updated_at: new Date().toISOString() }).eq("irritant_id", id), "status");
}
function dbSetAvis(id, avis) {
  dbRun(DB.client.from("manager_avis").upsert({ irritant_id: id, user_id: DB.user.id, avis: avis, updated_at: new Date().toISOString() }, { onConflict: "irritant_id,user_id" }), "avis");
}
function dbSaveArrivee(patch) {
  dbRun(DB.client.from("arrivees").update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq("id", "lucas-fabre"), "arrivee");
}
function dbSetBrouillon(id, statut) {
  dbRun(DB.client.from("brouillons").update({ statut: statut }).eq("id", id), "brouillon");
}
async function dbResetDemo() {
  const r = await DB.client.rpc("reset_demo");
  if (r.error) throw r.error;
}
