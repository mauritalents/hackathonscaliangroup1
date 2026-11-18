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
  if (!DB.enabled || DB.demo) return;
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
async function dbSignOut() { if (DB.enabled) await DB.client.auth.signOut(); DB.user = null; DB.profile = null; }

async function dbLoadProfile() {
  const r = await DB.client.from("profiles").select("id,email,full_name,role").eq("id", DB.user.id).single();
  if (r.error) throw r.error;
  DB.profile = r.data;
  return r.data;
}

function replaceContent(target, rows) { target.splice(0, target.length); rows.forEach(function (x) { target.push(x); }); }

// Charge les données de référence. En cas de table vide ou d'erreur, on garde le jeu embarqué (data.js).
async function dbLoadReference() {
  const role = DB.profile.role;
  const irr = await DB.client.from("irritants").select("*").order("position");
  if (!irr.error && irr.data && irr.data.length) {
    replaceContent(IRRITANTS, irr.data.map(function (x) {
      return { id: x.id, titre: x.titre, court: x.court, signal: x.signal, color: x.color, note: x.note,
        traitement: x.traitement, reponse: x.reponse, demo: x.demo, proposition: x.proposition, pourquoi: x.pourquoi };
    }));
  }
  const full = (role === "collab" || role === "hrbp");
  // Les managers et la direction ne reçoivent que les références (pas le contenu des mails) : vue event_refs.
  const ev = full
    ? await DB.client.from("events").select("*").order("position")
    : await DB.client.from("event_refs").select("*").order("position");
  if (!ev.error && ev.data && ev.data.length) {
    const map = function (x) {
      return { jour: x.jour, src: x.src, ref: x.ref, de: x.de_nom || undefined, titre: x.titre || "", texte: x.texte || "",
        irr: x.irr || [], conf: x.conf || undefined, aparte: x.aparte || "", live: x.live || undefined };
    };
    replaceContent(EVENTS, ev.data.filter(function (x) { return !x.live; }).map(map));
    const live = ev.data.filter(function (x) { return x.live; });
    if (live.length) Object.assign(LIVE_EVENT, map(live[0]));
  }
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
      const br = await DB.client.from("brouillons").select("id,statut");
      if (!br.error) {
        state.lucas.envoyes = {};
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
