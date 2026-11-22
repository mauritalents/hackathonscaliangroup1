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
  { id: "profiles", label: "Utilisateurs et profils", users: true }
];

state.adm = { table: "irritants", rows: [], loading: false, err: "", form: null, busy: false, uform: null };

function admDef() { return ADMIN_TABLES.find(function (t) { return t.id === state.adm.table; }); }
function admPeutEcrire() { return !!(DB.enabled && !DB.demo && DB.user && !DB.user.is_anonymous); }
function admErr(e) { state.adm.err = (e && e.message) || String(e); }

async function admCharger() {
  const A = state.adm, d = admDef();
  A.loading = true; A.err = ""; A.form = null; A.uform = null; render();
  try {
    if (d.users) {
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
    (d.users ? '<div class="btns"><button class="btn" onclick="admUNouveau()"' + (ecrire ? "" : " disabled") + ">Ajouter un utilisateur</button><button class=\"btn ghost\" onclick=\"admCharger()\">Actualiser</button></div>"
      : '<div class="btns"><button class="btn" onclick="admNouveau()"' + (ecrire ? "" : " disabled") + ">Ajouter une ligne</button><button class=\"btn ghost\" onclick=\"admCharger()\">Actualiser</button></div>") +
    "</div>" + admFormulaire() + admUFormulaire() + '<div class="card" style="margin-top:16px">' + admListe() + "</div>";
}
