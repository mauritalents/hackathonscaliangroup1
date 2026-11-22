// Paramétrage : le HRBP ajoute, modifie et supprime des lignes des tables de référence depuis le site.
// Les droits sont garantis par la base (migration-parametrage.sql), pas par ce fichier.

const ADMIN_TABLES = [
  { id: "irritants", label: "Irritants", pk: "id", order: "position", resume: ["id", "titre", "reponse", "actif"], cols: [
    { k: "id", l: "Identifiant (unique)", t: "text", req: 1, pk: 1 }, { k: "position", l: "Position", t: "int", req: 1 },
    { k: "titre", l: "Titre", t: "text", req: 1 }, { k: "court", l: "Titre court", t: "text", req: 1 },
    { k: "signal", l: "Signal", t: "text", req: 1 }, { k: "color", l: "Couleur", t: "text", req: 1 },
    { k: "note", l: "Note", t: "int", req: 1 }, { k: "traitement", l: "Traitement", t: "text", req: 1 },
    { k: "reponse", l: "Réponse (identifiant)", t: "text", req: 1 }, { k: "demo", l: "Irritant de démonstration", t: "bool" }, { k: "actif", l: "Actif (affiché aux utilisateurs)", t: "bool", dflt: true },
    { k: "proposition", l: "Proposition", t: "ta", req: 1 }, { k: "pourquoi", l: "Pourquoi", t: "ta", req: 1 }] },
  { id: "events", label: "Sources (mails, comptes rendus)", pk: "position", order: "position", resume: ["position", "src", "ref", "titre"], cols: [
    { k: "position", l: "Position (unique)", t: "int", req: 1, pk: 1 }, { k: "jour", l: "Jour", t: "text", req: 1 },
    { k: "src", l: "Type", t: "sel", opts: ["mail", "cr"], req: 1 }, { k: "ref", l: "Référence", t: "text", req: 1 },
    { k: "de_nom", l: "Expéditeur", t: "text", nul: 1 }, { k: "titre", l: "Titre", t: "text", req: 1 },
    { k: "texte", l: "Texte", t: "ta", req: 1 }, { k: "irr", l: "Irritants liés (identifiants séparés par des virgules)", t: "arr" },
    { k: "conf", l: "Confidentiel", t: "bool" }, { k: "aparte", l: "À part", t: "ta", nul: 1 }, { k: "live", l: "Événement en direct (démo)", t: "bool" }] },
  { id: "arrivees", label: "Arrivées", pk: "id", order: "id", resume: ["id", "nom", "poste", "recu"], cols: [
    { k: "id", l: "Identifiant (unique)", t: "text", req: 1, pk: 1 }, { k: "nom", l: "Nom", t: "text", req: 1 }, { k: "poste", l: "Poste", t: "text", req: 1 },
    { k: "recu", l: "Reçue", t: "bool" }, { k: "complete", l: "Complète", t: "bool" },
    { k: "lieu", l: "Lieu", t: "text", nul: 1 }, { k: "materiel", l: "Matériel", t: "text", nul: 1 }, { k: "acces", l: "Accès", t: "text", nul: 1 }] },
  { id: "brouillons", label: "Brouillons de mails", pk: "id", order: "position", resume: ["id", "arrivee_id", "destinataire", "objet"], cols: [
    { k: "id", l: "Identifiant (unique)", t: "text", req: 1, pk: 1 }, { k: "position", l: "Position", t: "int", req: 1 },
    { k: "arrivee_id", l: "Arrivée (identifiant)", t: "text", req: 1 }, { k: "destinataire", l: "Destinataire", t: "text", req: 1 },
    { k: "objet", l: "Objet", t: "text", req: 1 }, { k: "corps", l: "Corps", t: "ta", req: 1 }, { k: "statut", l: "Statut", t: "text", nul: 1 }] },
  { id: "ref_content", label: "Textes de référence (JSON)", pk: "key", order: "key", resume: ["key", "value"], danger: "Ces contenus pilotent l'interface (rôles, onglets, spécifications). Une erreur peut bloquer l'accès au site.", cols: [
    { k: "key", l: "Clé (unique)", t: "text", req: 1, pk: 1 }, { k: "value", l: "Valeur (JSON valide)", t: "json", req: 1 }] },
  { id: "ai_providers", label: "Fournisseurs d'IA", pk: "id", order: "position", resume: ["id", "label", "kind", "enabled"], cols: [
    { k: "id", l: "Identifiant (unique)", t: "text", req: 1, pk: 1 }, { k: "label", l: "Nom affiché", t: "text", req: 1 },
    { k: "kind", l: "Type d'API", t: "sel", opts: ["anthropic", "openai"], req: 1 }, { k: "base_url", l: "Adresse de l'API", t: "text", nul: 1 },
    { k: "default_model", l: "Modèle par défaut", t: "text", nul: 1 }, { k: "key_hint", l: "Indice de clé", t: "text", nul: 1 },
    { k: "position", l: "Position", t: "int", req: 1 }, { k: "enabled", l: "Actif", t: "bool" }] },
  { id: "profiles", label: "Utilisateurs et profils", users: true },
  { id: "apikeys", label: "Clés d'API", keys: true }
];

state.adm = { table: "irritants", rows: [], loading: false, err: "", form: null, busy: false, uform: null, kform: null, tests: {}, kinfo: null, imp: null };

function admDef() { return ADMIN_TABLES.find(function (t) { return t.id === state.adm.table; }); }
function admPeutEcrire() { return !!(DB.enabled && !DB.demo && DB.user && !DB.user.is_anonymous); }
function admErr(e) { state.adm.err = (e && e.message) || String(e); }

async function admCharger() {
  const A = state.adm, d = admDef();
  A.loading = true; A.err = ""; A.form = null; A.uform = null; A.kform = null; A.imp = null; render();
  try {
    if (d.keys) {
      const pg = await dbAi("ping");
      if (pg.version < 4) throw new Error("La fonction detect-irritants déployée est en version " + pg.version + " : redéployez supabase/functions/detect-irritants/index.ts (version 4) pour gérer les clés.");
      const k = await dbAi("keys_overview");
      A.rows = k.providers || []; A.kinfo = { default_provider: k.default_provider, can_store: k.can_store };
    } else if (d.users) {
      const r = await DB.client.from("profiles").select("id,email,full_name,role").not("email", "is", null).order("email");
      if (r.error) throw r.error;
      A.rows = r.data || [];
    } else {
      const r = await DB.client.from(d.id).select("*").order(d.order);
      if (r.error) throw r.error;
      A.rows = r.data || [];
    }
  } catch (e) { A.rows = []; admErr(e); }
  A.loading = false; render();
}
function admChoisir(id) { state.adm.table = id; admCharger(); }

function admValTexte(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function admCourt(v) {
  if (v === true) return "oui";
  if (v === false) return "non"; const s = admValTexte(v); return s.length > 70 ? s.slice(0, 70) + "…" : s; }

function admNouveau() {
  const d = admDef(), vals = {};
  d.cols.forEach(function (c) { vals[c.k] = c.t === "bool" ? !!c.dflt : c.t === "sel" ? c.opts[0] : ""; });
  state.adm.form = { mode: "new", vals: vals, orig: null, err: "" };
  render();
}
function admModifier(i) {
  const d = admDef(), row = state.adm.rows[i], vals = {};
  d.cols.forEach(function (c) {
    const v = row[c.k];
    vals[c.k] = c.t === "bool" ? !!v : c.t === "arr" ? (v || []).join(", ") : c.t === "json" ? JSON.stringify(v, null, 2) : (v === null || v === undefined ? "" : String(v));
  });
  state.adm.form = { mode: "edit", vals: vals, orig: row[d.pk], err: "" };
  render();
}
function admAnnuler() { state.adm.form = null; render(); }

function admLire() {
  const d = admDef(), out = {};
  for (const c of d.cols) {
    const el = document.getElementById("adm-f-" + c.k);
    if (!el) continue;
    if (c.t === "bool") { out[c.k] = el.checked; continue; }
    const raw = String(el.value).trim();
    if (raw === "") {
      if (c.req) throw new Error("Le champ « " + c.l + " » est obligatoire.");
      out[c.k] = c.t === "arr" ? [] : null;
      continue;
    }
    if (c.t === "int") { const n = Number(raw); if (!Number.isInteger(n)) throw new Error("« " + c.l + " » doit être un nombre entier."); out[c.k] = n; }
    else if (c.t === "arr") out[c.k] = raw.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    else if (c.t === "json") { try { out[c.k] = JSON.parse(raw); } catch (e) { throw new Error("« " + c.l + " » n'est pas un JSON valide : " + e.message); } }
    else out[c.k] = raw;
  }
  return out;
}

// Conserve ce qui est tapé quand le formulaire est réaffiché après une erreur.
function admGarder() {
  const d = admDef(), f = state.adm.form;
  if (!f) return;
  d.cols.forEach(function (c) {
    const el = document.getElementById("adm-f-" + c.k);
    if (el) f.vals[c.k] = c.t === "bool" ? el.checked : el.value;
  });
}

async function admRecharger() {
  // Les données de référence sont relues pour que les autres onglets reflètent les changements.
  try { await dbLoadReference(); await dbLoadState(); } catch (e) { console.error(e); }
}

async function admEnregistrer() {
  const A = state.adm, d = admDef(), f = A.form;
  if (!f || A.busy) return;
  if (!admPeutEcrire()) { f.err = "Modification impossible en mode démonstration."; render(); return; }
  let vals;
  admGarder();
  try { vals = admLire(); } catch (e) { f.err = e.message; render(); return; }
  A.busy = true; f.err = "";
  try {
    let r;
    if (f.mode === "new") {
      r = await DB.client.from(d.id).insert(vals);
      if (r.error) throw r.error;
      if (d.id === "irritants") {
        const s = await DB.client.from("irritant_status").insert({ irritant_id: vals.id });
        if (s.error) throw s.error;
      }
    } else {
      const patch = Object.assign({}, vals); delete patch[d.pk];
      r = await DB.client.from(d.id).update(patch).eq(d.pk, f.orig).select();
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw new Error("Aucune ligne modifiée : droits insuffisants ou ligne introuvable.");
    }
    toast("Enregistré.");
    A.busy = false;
    await admRecharger();
    await admCharger();
  } catch (e) {
    A.busy = false; f.err = e.message || String(e); render();
  }
}

async function admBasculer(i) {
  const A = state.adm, d = admDef(), row = A.rows[i];
  if (!admPeutEcrire()) { A.err = "Modification impossible en mode démonstration."; render(); return; }
  const actif = row.actif === false;
  try {
    const r = await DB.client.from(d.id).update({ actif: actif }).eq(d.pk, row[d.pk]).select();
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error("Aucune ligne modifiée : droits insuffisants ou ligne introuvable.");
    toast(actif ? "Irritant activé." : "Irritant désactivé : il n'apparaît plus aux utilisateurs.");
    await admRecharger();
    await admCharger();
  } catch (e) { admErr(e); render(); }
}

async function admSupprimer(i) {
  const A = state.adm, d = admDef(), row = A.rows[i];
  if (!admPeutEcrire()) { A.err = "Suppression impossible en mode démonstration."; render(); return; }
  const extra = d.id === "irritants" ? "\nSes statuts et avis de managers seront supprimés aussi." : d.id === "arrivees" ? "\nSes brouillons de mails seront supprimés aussi." : "";
  if (!confirm("Supprimer définitivement « " + admCourt(row[d.pk]) + " » ?" + extra + "\nCette action est irréversible.")) return;
  try {
    const r = await DB.client.from(d.id).delete().eq(d.pk, row[d.pk]).select();
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error("Aucune ligne supprimée : droits insuffisants ou ligne introuvable.");
    toast("Supprimé.");
    await admRecharger();
    await admCharger();
  } catch (e) { admErr(e); render(); }
}

// Gestion des utilisateurs : passe par la fonction admin-users (clé service_role côté serveur).
async function admFn(action, payload) {
  const r = await DB.client.functions.invoke("admin-users", { body: Object.assign({ action: action }, payload || {}) });
  if (r.error) {
    let msg = r.error.message;
    if (r.error.name === "FunctionsFetchError") msg = "La fonction admin-users ne répond pas : elle n'est probablement pas déployée (Supabase, Edge Functions, nom exact admin-users).";
    else { try { const j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (x) { /* corps non JSON */ } }
    throw new Error(msg);
  }
  if (r.data && r.data.error) throw new Error(r.data.error);
  return r.data;
}
function admUNouveau() { state.adm.uform = { mode: "new", id: null, vals: { email: "", full_name: "", role: "collab" }, err: "" }; render(); }
function admUModifier(i) {
  const u = state.adm.rows[i];
  state.adm.uform = { mode: "edit", id: u.id, self: !!(DB.user && u.id === DB.user.id), vals: { email: u.email || "", full_name: u.full_name || "", role: u.role }, err: "" };
  render();
}
function admUAnnuler() { state.adm.uform = null; render(); }
async function admUEnregistrer() {
  const A = state.adm, f = A.uform;
  if (!f || A.busy) return;
  if (!admPeutEcrire()) { f.err = "Modification impossible en mode démonstration."; render(); return; }
  const g = function (k) { const el = document.getElementById("adm-u-" + k); return el ? String(el.value) : ""; };
  const email = g("email").trim(), name = g("full_name").trim(), role = g("role"), pw = g("password"), pw2 = g("password2");
  f.vals.email = email; f.vals.full_name = name; if (!f.self) f.vals.role = role;
  if (!email) { f.err = "L'adresse e-mail est obligatoire."; render(); return; }
  if (f.mode === "new" && !pw) { f.err = "Le mot de passe est obligatoire pour un nouvel utilisateur."; render(); return; }
  if (pw !== pw2) { f.err = "Les deux mots de passe ne sont pas identiques."; render(); return; }
  if (pw && pw.length < 8) { f.err = "Le mot de passe doit contenir au moins 8 caractères."; render(); return; }
  A.busy = true; f.err = ""; render();
  try {
    if (f.mode === "new") await admFn("create", { email: email, full_name: name, role: role, password: pw });
    else await admFn("update", { id: f.id, email: email, full_name: name, role: f.self ? undefined : role, password: pw || undefined });
    A.busy = false;
    toast(f.mode === "new" ? "Utilisateur créé." : "Utilisateur modifié.");
    await admCharger();
  } catch (e) { A.busy = false; f.err = e.message || String(e); render(); }
}
async function admUSupprimer(i) {
  const A = state.adm, u = A.rows[i];
  if (!admPeutEcrire()) { A.err = "Suppression impossible en mode démonstration."; render(); return; }
  if (!confirm("Supprimer définitivement le compte « " + u.email + " » ?\nSes avis de manager seront supprimés aussi.\nCette action est irréversible.")) return;
  try { await admFn("delete", { id: u.id }); toast("Utilisateur supprimé."); await admCharger(); }
  catch (e) { admErr(e); render(); }
}

function admUFormulaire() {
  const A = state.adm, f = A.uform;
  if (!f) return "";
  const inp = function (k, label, type, val, extra) {
    return '<label class="fl" style="display:block;margin-top:10px">' + esc(label) + '<input id="adm-u-' + k + '" type="' + type + '" value="' + esc(val) + '" ' + (extra || "") +
      ' style="display:block;width:100%;margin-top:4px;font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--lav2);border-radius:4px"></label>';
  };
  const sel = '<label class="fl" style="display:block;margin-top:10px">Profil<select id="adm-u-role" class="ctl" style="display:block;margin-top:4px"' + (f.self ? " disabled" : "") + ">" +
    ["collab", "manager", "hrbp", "dir"].map(function (r) { return "<option" + (r === f.vals.role ? " selected" : "") + ">" + r + "</option>"; }).join("") + "</select></label>";
  const edit = f.mode === "edit";
  return '<div class="card" style="margin-bottom:16px"><div class="spechead">' + (edit ? "Modifier l'utilisateur" : "Ajouter un utilisateur") + "</div>" +
    (f.err ? '<div class="obj"><b>Erreur :</b> ' + esc(f.err) + "</div>" : "") +
    inp("email", "Adresse e-mail *", "email", f.vals.email, 'autocomplete="off"') + inp("full_name", "Nom affiché", "text", f.vals.full_name) + sel +
    (f.self ? '<p class="note">Vous ne pouvez pas changer votre propre profil.</p>' : "") +
    inp("password", edit ? "Nouveau mot de passe (laisser vide pour ne pas le changer)" : "Mot de passe * (8 caractères minimum)", "password", "", 'autocomplete="new-password"') +
    inp("password2", "Confirmer le mot de passe", "password", "", 'autocomplete="new-password"') +
    '<p class="note">Le mot de passe est envoyé en HTTPS à la fonction admin-users et n\'est jamais affiché ni enregistré par le site. Communiquez-le à la personne par un canal sûr.</p>' +
    '<div class="btns"><button class="btn" onclick="admUEnregistrer()"' + (A.busy ? " disabled" : "") + ">" + (A.busy ? "Enregistrement…" : "Enregistrer") + '</button><button class="btn ghost" onclick="admUAnnuler()">Annuler</button></div></div>';
}

// Gestion des clés d'API : tout passe par la fonction detect-irritants, qui seule voit les clés en clair.
function admKOuvrir(i, scope) { state.adm.kform = { provider: state.adm.rows[i].id, label: state.adm.rows[i].label, scope: scope, err: "" }; render(); }
function admKAnnuler() { state.adm.kform = null; render(); }
async function admKEnregistrer() {
  const A = state.adm, f = A.kform;
  if (!f || A.busy) return;
  const el = document.getElementById("adm-k-key");
  const key = el ? el.value.trim() : "";
  if (key.length < 8) { f.err = "La clé est trop courte (8 caractères minimum)."; render(); return; }
  A.busy = true; f.err = ""; render();
  try {
    await dbAi(f.scope === "user" ? "save_key" : "set_default", { provider: f.provider, api_key: key });
    A.busy = false; toast(f.scope === "user" ? "Votre clé est mémorisée." : "Clé par défaut du projet enregistrée.");
    await admCharger();
  } catch (e) { A.busy = false; f.err = e.message || String(e); render(); }
}
async function admKSupprimer(i, scope) {
  const A = state.adm, r = A.rows[i];
  const txt = scope === "user" ? "Supprimer votre clé personnelle pour " + r.label + " ?" : "Supprimer la clé par défaut du projet pour " + r.label + " ?\nTous les HRBP qui s'en servent devront saisir leur propre clé.";
  if (!confirm(txt)) return;
  try { await dbAi(scope === "user" ? "delete_key" : "delete_default", { provider: r.id }); toast("Clé supprimée."); await admCharger(); }
  catch (e) { admErr(e); render(); }
}
async function admKTester(i, source) {
  const A = state.adm, r = A.rows[i], id = r.id + ":" + source;
  A.tests[id] = { wait: true }; render();
  try { const x = await dbAi("test_key", { provider: r.id, source: source }); A.tests[id] = { ok: !!x.ok, message: x.message || "" }; }
  catch (e) { A.tests[id] = { ok: false, message: e.message || String(e) }; }
  render();
}
function admKResultat(id) {
  const t = state.adm.tests[id];
  if (!t) return "";
  if (t.wait) return '<div class="note" style="margin:2px 0 0">Test en cours…</div>';
  return '<div class="note" style="margin:2px 0 0;color:' + (t.ok ? "#047857" : "#be123c") + '">' + esc(t.message) + "</div>";
}
function admKFormulaire() {
  const f = state.adm.kform;
  if (!f) return "";
  return '<div class="card" style="margin-bottom:16px"><div class="spechead">' + (f.scope === "user" ? "Ma clé personnelle" : "Clé par défaut du projet") + " · " + esc(f.label) + "</div>" +
    (f.err ? '<div class="obj"><b>Erreur :</b> ' + esc(f.err) + "</div>" : "") +
    '<label class="fl" style="display:block;margin-top:10px">Clé d\'API<input id="adm-k-key" type="password" autocomplete="off" placeholder="Collez la clé du fournisseur" style="display:block;width:100%;margin-top:4px;font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--lav2);border-radius:4px"></label>' +
    '<p class="note">' + (f.scope === "user" ? "Elle est chiffrée côté serveur, rattachée à votre compte, et jamais relue par le site. Une nouvelle clé remplace l'ancienne."
      : "Elle est chiffrée côté serveur et partagée par tous les HRBP. Ce fournisseur devient aussi le fournisseur par défaut du projet. Une nouvelle clé remplace l'ancienne.") + "</p>" +
    '<div class="btns"><button class="btn" onclick="admKEnregistrer()"' + (state.adm.busy ? " disabled" : "") + ">" + (state.adm.busy ? "Enregistrement…" : "Enregistrer") + '</button><button class="btn ghost" onclick="admKAnnuler()">Annuler</button></div></div>';
}
function admKListe() {
  const A = state.adm, ecrire = admPeutEcrire(), info = A.kinfo || {};
  if (!A.rows.length) return '<p class="note">Aucun fournisseur.</p>';
  const fmt = function (d) { return d ? new Date(d).toLocaleString("fr-FR") : ""; };
  return (info.can_store === false ? '<div class="obj todo"><b>Mémorisation impossible :</b> ajoutez le secret KEY_ENCRYPTION_SECRET dans Supabase, Edge Functions, Secrets. Les clés saisies pour un seul appel restent possibles.</div>' : "") +
    '<div style="overflow-x:auto"><table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px"><tr><th align="left">Fournisseur</th><th align="left">Ma clé</th><th align="left">Clé par défaut du projet</th><th align="left">Secret Supabase</th></tr>' +
    A.rows.map(function (r, i) {
      const u = r.user_key, d = r.default_key;
      const btn = function (label, fn, off) { return '<button class="ctl" onclick="' + fn + '"' + (off || !ecrire ? " disabled" : "") + ">" + label + "</button> "; };
      const cu = (u ? "Définie · " + esc(fmt(u.updated_at)) : "Aucune") + '<div style="margin-top:4px">' + btn(u ? "Remplacer" : "Saisir", "admKOuvrir(" + i + ",'user')", info.can_store === false) +
        (u ? btn("Tester", "admKTester(" + i + ",'user')") + btn("Supprimer", "admKSupprimer(" + i + ",'user')") : "") + "</div>" + admKResultat(r.id + ":user");
      const cd = (d ? "Définie · " + esc(fmt(d.updated_at)) + (d.updated_by ? " · par " + esc(d.updated_by) : "") : "Aucune") +
        (info.default_provider === r.id ? ' <b>(fournisseur par défaut)</b>' : "") + '<div style="margin-top:4px">' + btn(d ? "Remplacer" : "Saisir", "admKOuvrir(" + i + ",'default')", info.can_store === false) +
        (d ? btn("Tester", "admKTester(" + i + ",'default')") + btn("Supprimer", "admKSupprimer(" + i + ",'default')") : "") + "</div>" + admKResultat(r.id + ":default");
      const ce = r.env_key ? "Définie" + '<div style="margin-top:4px">' + btn("Tester", "admKTester(" + i + ",'env')") + "</div>" + admKResultat(r.id + ":env") : "Aucune";
      return '<tr style="border-top:1px solid var(--lav2);vertical-align:top"><td><b>' + esc(r.label) + "</b>" + (r.enabled ? "" : " (inactif)") + "</td><td>" + cu + "</td><td>" + cd + "</td><td>" + ce + "</td></tr>";
    }).join("") + "</table></div>" +
    '<p class="note">Ordre d\'utilisation : clé saisie dans Détection IA, puis ma clé, puis clé par défaut du projet, puis secret Supabase. Le secret Supabase se gère dans Supabase (Edge Functions, Secrets), jamais dans ce site. Aucune clé n\'est jamais affichée.</p>';
}

// ---------------------------------------------------------------------------
// Import depuis un fichier CSV ou Excel (.xlsx). Aucune bibliothèque externe : le fichier est lu dans le navigateur.
// ---------------------------------------------------------------------------
function admNorm(x) { return String(x == null ? "" : x).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }

function csvParse(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const sep = [";", "\t", ","].map(function (c) { return [c, first.split(c).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function zipEntries(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; } }
  if (e < 0) throw new Error("Ce fichier n'est pas un classeur Excel .xlsx valide.");
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = {};
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true), start = lo + 30 + lnl + lxl;
    out[name] = { method: method, data: u8.subarray(start, start + csize) };
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function zipText(files, name) {
  const f = files[name]; if (!f) return null;
  const raw = f.method === 0 ? f.data : await inflateRaw(f.data);
  return new TextDecoder().decode(raw);
}
function colIndex(ref) { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
async function xlsxParse(buf) {
  if (typeof DecompressionStream === "undefined") throw new Error("Ce navigateur ne sait pas lire les fichiers Excel : enregistrez le fichier en CSV.");
  const files = await zipEntries(buf);
  const parser = new DOMParser();
  const sheetName = Object.keys(files).filter(function (n) { return /^xl\/worksheets\/[^/]+\.xml$/.test(n); }).sort()[0];
  if (!sheetName) throw new Error("Aucune feuille trouvée dans ce classeur.");
  const shared = [];
  const sst = await zipText(files, "xl/sharedStrings.xml");
  if (sst) {
    parser.parseFromString(sst, "application/xml").querySelectorAll("si").forEach(function (si) {
      shared.push(Array.from(si.querySelectorAll("t")).map(function (t) { return t.textContent; }).join(""));
    });
  }
  const doc = parser.parseFromString(await zipText(files, sheetName), "application/xml");
  const rows = [];
  doc.querySelectorAll("sheetData > row").forEach(function (r) {
    const row = [];
    r.querySelectorAll("c").forEach(function (c) {
      const t = c.getAttribute("t"), v = c.querySelector("v"), idx = colIndex(c.getAttribute("r") || "A1");
      let val = "";
      if (t === "s" && v) val = shared[Number(v.textContent)] || "";
      else if (t === "inlineStr") val = Array.from(c.querySelectorAll("t")).map(function (x) { return x.textContent; }).join("");
      else if (t === "b" && v) val = v.textContent === "1" ? "true" : "false";
      else if (v) val = v.textContent;
      row[idx] = val;
    });
    rows.push(row);
  });
  return rows.map(function (r) { const o = []; for (let i = 0; i < r.length; i++) o.push(r[i] == null ? "" : r[i]); return o; });
}

// Convertit une cellule en valeur de la colonne, ou lève une erreur lisible.
function admCoerce(c, raw) {
  const v = String(raw == null ? "" : raw).trim();
  if (c.t === "bool") {
    if (v === "") return !!c.dflt;
    const x = admNorm(v);
    if (["oui", "true", "vrai", "1", "yes", "x"].indexOf(x) >= 0) return true;
    if (["non", "false", "faux", "0", "no"].indexOf(x) >= 0) return false;
    throw new Error("« " + c.k + " » : oui ou non attendu (valeur : " + v + ")");
  }
  if (v === "") {
    if (c.req) throw new Error("« " + c.k + " » est obligatoire");
    return c.t === "arr" ? [] : null;
  }
  if (c.t === "int") { const n = Number(v.replace(",", ".")); if (!Number.isInteger(n)) throw new Error("« " + c.k + " » : nombre entier attendu (valeur : " + v + ")"); return n; }
  if (c.t === "arr") return v.split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean);
  if (c.t === "json") { try { return JSON.parse(v); } catch (e) { throw new Error("« " + c.k + " » : JSON invalide"); } }
  if (c.t === "sel" && c.opts.indexOf(v) < 0) throw new Error("« " + c.k + " » : valeur permise " + c.opts.join(" ou ") + " (valeur : " + v + ")");
  return v;
}

function admImpOuvrir() { state.adm.imp = { name: "", rows: [], errors: [], total: 0, mode: "new", busy: false, ignored: [], done: "" }; render(); }
function admImpAnnuler() { state.adm.imp = null; render(); }
function admImpMode(m) { state.adm.imp.mode = m; render(); }

async function admImpFichier(input) {
  const A = state.adm, d = admDef(), I = A.imp, file = input.files && input.files[0];
  if (!file) return;
  I.name = file.name; I.rows = []; I.errors = []; I.ignored = []; I.total = 0; I.done = "";
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("Fichier trop volumineux (5 Mo maximum).");
    let table;
    if (/\.xlsx$/i.test(file.name)) table = await xlsxParse(await file.arrayBuffer());
    else if (/\.xls$/i.test(file.name)) throw new Error("Le format .xls (ancien Excel) n'est pas lu : enregistrez le fichier en .xlsx ou en CSV.");
    else table = csvParse(await file.text());
    table = table.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
    if (table.length < 2) throw new Error("Le fichier doit contenir une ligne d'en-têtes et au moins une ligne de données.");
    // Correspondance des en-têtes avec les colonnes, par clé ou par libellé.
    const head = table[0].map(function (h) { return admNorm(h); }), cols = [];
    d.cols.forEach(function (c) {
      let i = head.indexOf(admNorm(c.k));
      if (i < 0) i = head.indexOf(admNorm(c.l));
      if (i < 0) i = head.indexOf(admNorm(c.l.replace(/\s*\(.*\)\s*/g, "").replace(/\s*\*$/, "")));
      if (i >= 0) cols.push({ c: c, i: i });
    });
    const used = cols.map(function (x) { return x.i; });
    I.ignored = table[0].filter(function (h, i) { return used.indexOf(i) < 0 && String(h).trim() !== ""; });
    const manque = d.cols.filter(function (c) { return c.req && !cols.some(function (x) { return x.c.k === c.k; }); });
    if (manque.length) throw new Error("Colonnes obligatoires absentes : " + manque.map(function (c) { return c.k; }).join(", ") + ". Téléchargez le modèle pour voir les en-têtes attendus.");
    const vus = {};
    for (let r = 1; r < table.length; r++) {
      I.total++;
      try {
        const o = {};
        cols.forEach(function (x) { o[x.c.k] = admCoerce(x.c, table[r][x.i]); });
        const key = String(o[d.pk]);
        if (vus[key]) throw new Error("identifiant en double dans le fichier (" + key + ")");
        vus[key] = 1;
        I.rows.push(o);
      } catch (e) { I.errors.push("Ligne " + (r + 1) + " : " + e.message); }
    }
  } catch (e) { I.errors = [e.message]; I.total = 0; }
  render();
}

async function admImpConfirmer() {
  const A = state.adm, d = admDef(), I = A.imp;
  if (!I || I.busy || !I.rows.length) return;
  if (!admPeutEcrire()) { I.errors = ["Import impossible en mode démonstration."]; render(); return; }
  I.busy = true; I.done = ""; render();
  try {
    for (let i = 0; i < I.rows.length; i += 200) {
      const chunk = I.rows.slice(i, i + 200);
      const r = await DB.client.from(d.id).upsert(chunk, { onConflict: d.pk, ignoreDuplicates: I.mode === "new" });
      if (r.error) throw new Error("Lignes " + (i + 2) + " à " + (i + chunk.length + 1) + " : " + r.error.message);
      if (d.id === "irritants") {
        const st = await DB.client.from("irritant_status").upsert(chunk.map(function (x) { return { irritant_id: x.id }; }), { onConflict: "irritant_id", ignoreDuplicates: true });
        if (st.error) throw st.error;
      }
    }
    const n = I.rows.length;
    I.busy = false; toast("Import terminé : " + n + " ligne(s) traitée(s).");
    await admRecharger();
    const done = I.mode === "new" ? n + " ligne(s) lues ; celles dont l'identifiant existait déjà sont conservées sans changement." : n + " ligne(s) ajoutée(s) ou mises à jour.";
    await admCharger();
    A.imp = { name: I.name, rows: [], errors: [], total: 0, mode: I.mode, busy: false, ignored: [], done: done };
    render();
  } catch (e) { I.busy = false; I.errors = [e.message]; render(); }
}

function admImpModele() {
  const d = admDef();
  const ligne = d.cols.map(function (c) { return c.k; }).join(";");
  const blob = new Blob(["﻿" + ligne + "\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "modele-" + d.id + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function admImpPanneau() {
  const A = state.adm, I = A.imp, d = admDef();
  if (!I) return "";
  const aide = d.cols.map(function (c) { return "<code>" + esc(c.k) + "</code>" + (c.req ? " *" : ""); }).join(", ");
  const apercu = I.rows.slice(0, 5).map(function (r) {
    return "<tr>" + d.resume.map(function (k) { return "<td>" + esc(admCourt(r[k])) + "</td>"; }).join("") + "</tr>";
  }).join("");
  return '<div class="card" style="margin-bottom:16px"><div class="spechead">Importer dans « ' + esc(d.label) + ' »</div>' +
    '<p class="note">Fichier <b>.csv</b> (séparateur virgule, point virgule ou tabulation) ou <b>.xlsx</b> (première feuille). La première ligne contient les en-têtes. Colonnes reconnues (* obligatoire) : ' + aide + ". Booléens : oui ou non. Listes : valeurs séparées par des virgules. Les dates Excel ne sont pas converties : écrivez-les en texte.</p>" +
    '<div class="btns"><button class="ctl" onclick="admImpModele()">Télécharger le modèle CSV</button></div>' +
    '<label class="fl" style="display:block;margin-top:10px">Fichier<input type="file" accept=".csv,.txt,.xlsx" onchange="admImpFichier(this)" style="display:block;margin-top:4px"></label>' +
    '<div style="margin-top:10px"><label style="display:block"><input type="radio" name="imp-mode" ' + (I.mode === "new" ? "checked " : "") + 'onchange="admImpMode(\'new\')"> Ajouter seulement les lignes nouvelles (les identifiants existants ne changent pas)</label>' +
    '<label style="display:block;margin-top:4px"><input type="radio" name="imp-mode" ' + (I.mode === "upd" ? "checked " : "") + 'onchange="admImpMode(\'upd\')"> Ajouter et mettre à jour les lignes existantes (selon l\'identifiant)</label></div>' +
    (I.done ? '<div class="result" style="margin-top:10px"><b>Import terminé</b><p>' + esc(I.done) + "</p></div>" : "") +
    (I.name && !I.errors.length && !I.done ? '<p class="note" style="margin-top:10px"><b>' + esc(I.name) + "</b> : " + I.rows.length + " ligne(s) valide(s) sur " + I.total + (I.ignored.length ? ". Colonnes ignorées : " + esc(I.ignored.join(", ")) : "") + ".</p>" : "") +
    (I.errors.length ? '<div class="obj" style="margin-top:10px"><b>' + (I.rows.length ? I.errors.length + " ligne(s) refusée(s) : elles ne seront pas importées." : "Import impossible.") + "</b><ul style=\"margin:6px 0 0 18px\">" + I.errors.slice(0, 15).map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + (I.errors.length > 15 ? "<li>… et " + (I.errors.length - 15) + " autre(s)</li>" : "") + "</ul></div>" : "") +
    (I.rows.length ? '<table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px"><tr>' + d.resume.map(function (k) { return '<th align="left">' + esc(k) + "</th>"; }).join("") + "</tr>" + apercu + "</table>" +
      (I.rows.length > 5 ? '<p class="note">Aperçu des 5 premières lignes sur ' + I.rows.length + ".</p>" : "") : "") +
    '<div class="btns"><button class="btn" onclick="admImpConfirmer()"' + (I.rows.length && !I.busy ? "" : " disabled") + ">" + (I.busy ? "Import en cours…" : "Importer " + I.rows.length + " ligne(s)") + '</button><button class="btn ghost" onclick="admImpAnnuler()">Fermer</button></div></div>';
}

function admFormulaire() {
  const A = state.adm, d = admDef(), f = A.form;
  if (!f) return "";
  const champs = d.cols.map(function (c) {
    const id = "adm-f-" + c.k, v = f.vals[c.k], lock = f.mode === "edit" && c.pk;
    let input;
    if (c.t === "bool") input = '<input type="checkbox" id="' + id + '"' + (v ? " checked" : "") + "> ";
    else if (c.t === "ta" || c.t === "json") input = '<textarea id="' + id + '" rows="' + (c.t === "json" ? 8 : 3) + '"' + (c.t === "json" ? ' style="font-family:monospace"' : "") + ">" + esc(v) + "</textarea>";
    else if (c.t === "sel") input = '<select id="' + id + '" class="ctl" style="display:block;margin-top:4px">' + c.opts.map(function (o) { return '<option' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
    else input = '<input id="' + id + '" type="text" value="' + esc(v) + '"' + (lock ? " disabled" : "") + ' style="display:block;width:100%;margin-top:4px;font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--lav2);border-radius:4px">';
    return c.t === "bool" ? '<label class="fl" style="display:block;margin-top:10px">' + input + esc(c.l) + "</label>"
      : '<label class="fl" style="display:block;margin-top:10px">' + esc(c.l) + (c.req ? " *" : "") + input + "</label>";
  }).join("");
  return '<div class="card" style="margin-bottom:16px"><div class="spechead">' + (f.mode === "new" ? "Ajouter une ligne" : "Modifier la ligne") + " · " + esc(d.label) + "</div>" +
    (f.err ? '<div class="obj"><b>Erreur :</b> ' + esc(f.err) + "</div>" : "") + champs +
    '<div class="btns"><button class="btn" onclick="admEnregistrer()"' + (A.busy ? " disabled" : "") + ">" + (A.busy ? "Enregistrement…" : "Enregistrer") + '</button><button class="btn ghost" onclick="admAnnuler()">Annuler</button></div></div>';
}

function admListe() {
  const A = state.adm, d = admDef(), ecrire = admPeutEcrire();
  if (A.loading) return '<p class="note">Chargement…</p>';
  if (d.keys) return admKListe();
  if (d.users) {
    if (!A.rows.length) return '<p class="note">Aucun utilisateur.</p>';
    return '<table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px"><tr><th align="left">E-mail</th><th align="left">Nom</th><th align="left">Profil</th><th></th></tr>' +
      A.rows.map(function (u, i) {
        const moi = DB.user && u.id === DB.user.id;
        return '<tr style="border-top:1px solid var(--lav2)"><td>' + esc(u.email) + (moi ? " (vous)" : "") + "</td><td>" + esc(u.full_name || "") + "</td><td>" + esc(u.role) + "</td>" +
          '<td style="white-space:nowrap"><button class="ctl" onclick="admUModifier(' + i + ')"' + (ecrire ? "" : " disabled") + '>Modifier</button> <button class="ctl" onclick="admUSupprimer(' + i + ')"' + (ecrire && !moi ? "" : " disabled") + ">Supprimer</button></td></tr>";
      }).join("") + "</table>";
  }
  if (!A.rows.length) return '<p class="note">Aucune ligne dans cette table.</p>';
  return '<div style="overflow-x:auto"><table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px"><tr>' +
    d.resume.map(function (k) { return '<th align="left">' + esc(k) + "</th>"; }).join("") + "<th></th></tr>" +
    A.rows.map(function (r, i) {
      return '<tr style="border-top:1px solid var(--lav2)">' + d.resume.map(function (k) { return "<td>" + esc(admCourt(r[k])) + "</td>"; }).join("") +
        '<td style="white-space:nowrap">' + (d.id === "irritants" ? '<button class="ctl" onclick="admBasculer(' + i + ')"' + (ecrire ? "" : " disabled") + ">" + (r.actif === false ? "Activer" : "Désactiver") + "</button> " : "") + '<button class="ctl" onclick="admModifier(' + i + ')"' + (ecrire ? "" : " disabled") + '>Modifier</button> <button class="ctl" onclick="admSupprimer(' + i + ')"' + (ecrire ? "" : " disabled") + ">Supprimer</button></td></tr>";
    }).join("") + "</table></div>";
}

function viewParametrage() {
  const A = state.adm, d = admDef(), ecrire = admPeutEcrire();
  const chips = ADMIN_TABLES.map(function (t) { return '<button class="chip' + (t.id === A.table ? " active" : "") + '" onclick="admChoisir(\'' + t.id + "')\">" + esc(t.label) + "</button>"; }).join(" ");
  return '<div class="card"><h2>Paramétrage</h2>' +
    '<p class="note">Ajoutez, modifiez ou supprimez les lignes des tables du site. Les changements sont enregistrés dans la base et visibles par les autres profils après rechargement de leur page. La création ou la suppression de tables elles-mêmes se fait dans Supabase (SQL Editor).</p>' +
    (ecrire ? "" : '<div class="obj todo"><b>Lecture seule :</b> la modification est réservée à un compte HRBP réel. Le mode démonstration ne peut pas modifier les données.</div>') +
    '<div class="btns" style="flex-wrap:wrap">' + chips + "</div>" +
    (d.danger ? '<div class="obj todo"><b>Attention :</b> ' + esc(d.danger) + "</div>" : "") +
    (A.err ? '<div class="obj"><b>Erreur :</b> ' + esc(A.err) + (/row-level security|permission denied|policy/i.test(A.err) ? " Exécutez supabase/migration-parametrage.sql et vérifiez que votre profil est HRBP." : /actif/.test(A.err) ? " Exécutez supabase/migration-irritants-actif.sql." : "") + "</div>" : "") +
    (d.keys ? '<div class="btns"><button class="btn ghost" onclick="admCharger()">Actualiser</button></div>' : d.users ? '<div class="btns"><button class="btn" onclick="admUNouveau()"' + (ecrire ? "" : " disabled") + ">Ajouter un utilisateur</button><button class=\"btn ghost\" onclick=\"admCharger()\">Actualiser</button></div>"
      : '<div class="btns"><button class="btn" onclick="admNouveau()"' + (ecrire ? "" : " disabled") + ">Ajouter une ligne</button><button class=\"btn ghost\" onclick=\"admImpOuvrir()\"" + (ecrire ? "" : " disabled") + ">Importer (Excel ou CSV)</button><button class=\"btn ghost\" onclick=\"admCharger()\">Actualiser</button></div>") +
    "</div>" + admImpPanneau() + admFormulaire() + admUFormulaire() + admKFormulaire() + '<div class="card" style="margin-top:16px">' + admListe() + "</div>";
}
