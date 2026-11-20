// ---------------------------------------------------------------------------
// État et rendu
// ---------------------------------------------------------------------------


const state = {
  tab: "observer",
  idx: 0, playing: false, liveSent: false, fresh: null,
  feed: [],
  status: {},
  contre: {},
  selOrient: "doc",
  selSpec: null, generating: false, genStep: 0, specReady: false,
  agentRunning: false, agentStep: -1,
  serviceFilter: "Tous",
  persona: "futur",
};
IRRITANTS.forEach(function (i) { state.status[i.id] = "À valider"; });
state.avisMgr = {};

let playTimer = null;
const timers = [];

function listeFlechee(l) { return l.map(function (x) { return "<li><span>" + esc(x[0]) + "</span><span>" + esc(x[1]) + "</span></li>"; }).join(""); }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function badge(cls, text) { return '<span class="badge ' + cls + '">' + esc(text) + "</span>"; }
function irrById(id) { return IRRITANTS.find(function (i) { return i.id === id; }); }
function repById(id) { return REPONSES.find(function (r) { return r.id === id; }); }
function setTab(t) { state.tab = t; render(); window.scrollTo(0, 0); if (t === "detection" && DB.enabled && !DB.demo) { if (!state.det.loaded) chargerDetections(); if (!state.det.ia.loaded) chargerIa(); } }


function occurrences(list) {
  const occ = {};
  (list || state.feed).slice().reverse().forEach(function (ev) {
    ev.irr.forEach(function (id) { (occ[id] = occ[id] || []).push(ev.ref); });
  });
  return occ;
}

function ring(note) {
  const color = note >= 10 ? "#e11d48" : note >= 8 ? "#f59e0b" : "#64748b";
  const dash = (note / 12) * 97.4;
  return '<div class="ring" title="Note de priorisation /12 (livrable 01, proposition à valider)"><svg viewBox="0 0 36 36">' +
    '<circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" stroke-width="4"/>' +
    '<circle cx="18" cy="18" r="15.5" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + dash + ' 97.4"/>' +
    '</svg><span style="color:' + color + '">' + note + "</span></div>";
}

// ------------------------------- OBSERVER ----------------------------------

function step() {
  if (state.idx >= EVENTS.length) { pause(); return; }
  const ev = EVENTS[state.idx];
  state.idx += 1;
  state.feed.unshift(ev);
  state.fresh = ev.irr; state.justAdded = true;
  if (state.idx >= EVENTS.length) pause();
  if (state.tab === "registre") render();
}
function play() { if (state.idx >= EVENTS.length) return; state.playing = true; clearInterval(playTimer); playTimer = setInterval(step, 2200); step(); }
function pause() { state.playing = false; clearInterval(playTimer); if (state.tab === "registre") render(); }
function toutAfficher() { pause(); while (state.idx < EVENTS.length) { state.feed.unshift(EVENTS[state.idx]); state.idx += 1; } state.fresh = null; render(); }
function rejouer() { pause(); state.idx = 0; state.feed = []; state.liveSent = false; state.fresh = null; render(); }
function envoyerLive() {
  if (state.liveSent) return;
  toutAfficher();
  state.liveSent = true;
  state.feed.unshift(LIVE_EVENT);
  state.fresh = LIVE_EVENT.irr; state.justAdded = true;
  render();
}

function viewObserver() {
  const done = state.idx >= EVENTS.length;
  const pct = Math.round((state.idx / EVENTS.length) * 100);
  const controls = '<div class="controls">' +
    (state.playing
      ? '<button class="ctl" onclick="pause()">Pause</button>'
      : '<button class="ctl" onclick="play()"' + (done ? " disabled" : "") + ">" + (state.idx ? "Reprendre" : "Lancer l'observation") + "</button>") +
    '<button class="ctl" onclick="pause();step()"' + (done ? " disabled" : "") + ">Événement suivant</button>" +
    '<button class="ctl" onclick="toutAfficher()"' + (done ? " disabled" : "") + ">Tout afficher</button>" +
    '<button class="ctl" onclick="rejouer()">Rejouer</button>' +
    '<div class="progress" title="' + state.idx + " / " + EVENTS.length + ' événements"><i style="width:' + pct + '%"></i></div>' +
    '<button class="ctl hot" onclick="envoyerLive()"' + (state.liveSent ? " disabled" : "") + ">Simuler l'arrivée du mail 21</button>" +
    "</div>";

  const feed = state.feed.length ? state.feed.map(function (ev, n) {
    const first = ev.irr.length ? irrById(ev.irr[0]) : null;
    const color = first ? first.color : ev.conf ? "#1a1030" : "#cbd5e1";
    const tags = ev.irr.map(function (id) {
      const i = irrById(id);
      return '<span class="badge" style="background:' + i.color + ';color:#fff;border-color:transparent">' + esc(i.signal) + "</span>";
    }).join("");
    const sub = ev.irr.length
      ? "Rattaché à : " + ev.irr.map(function (id) { return esc(irrById(id).court); }).join(" · ")
      : esc(ev.aparte || "Aucun signal retenu.");
    return '<div class="event card' + (ev.live ? " live" : "") + (ev.conf ? " conf" : "") + (n === 0 && state.justAdded ? " new" : "") + '">' +
      '<span class="evdot" style="background:' + color + '"></span>' +
      '<div class="evbody">' +
        '<div class="evmeta"><span class="evtime">' + ev.jour + "</span>" + badge(SOURCES[ev.src].cls, SOURCES[ev.src].label) +
          badge("b-slate", ev.ref) + tags + (ev.conf ? badge("b-dark", "Écarté · confidentiel") : "") + (ev.live ? badge("b-rose", "Reçu en direct") : "") + "</div>" +
        '<div class="evtitle">' + esc(ev.titre) + (ev.de ? ' <span style="font-weight:400;color:#64748b">· ' + esc(ev.de) + "</span>" : "") + "</div>" +
        '<div class="evtext"' + (ev.conf ? ' style="font-style:italic;color:#8f87a3"' : "") + ">" + esc(ev.texte) + "</div>" +
        '<div class="evsub">' + sub + "</div>" +
      "</div></div>";
  }).join("") : '<div class="empty"><div class="big">📨</div><p>Le fil rejoue, dans l\'ordre des jours, les 20 mails déjà reçus par la boîte RH et les 4 comptes rendus. Trois arrivées en quatre semaines. Le mail 21 est gardé pour l\'envoi en direct.</p></div>';

  const occ = occurrences();
  const seen = IRRITANTS.filter(function (i) { return occ[i.id]; });
  const ecartes = state.feed.filter(function (e) { return e.conf; }).length;
  const bruit = state.feed.filter(function (e) { return !e.irr.length && !e.conf; }).length;
  const registre = seen.length ? seen.map(function (i) {
    const srcs = occ[i.id];
    const confirmed = srcs.length >= 2;
    const fresh = state.fresh && state.fresh.indexOf(i.id) >= 0;
    return '<div class="card irr-card' + (fresh ? " fresh" : "") + '"><div class="irr">' + ring(i.note) +
      '<div style="flex:1;min-width:0"><div class="irrtitle">' + esc(i.titre) + "</div>" +
      '<div class="irrtags">' +
        (confirmed ? badge("b-amber", "Irritant · " + srcs.length + " sources") : badge("b-slate", "Signal isolé · 1 source")) +
        badge("b-slate", repById(i.reponse).label) + badge("b-slate", state.status[i.id]) + avisBadge(i.id) +
      "</div></div></div>" +
      '<div class="irrdetail">Sources : ' + esc(srcs.join(", ")) + "</div>" +
      (state.role === "collab" && state.status[i.id] !== "Contesté" ? '<div class="btns"><button class="btn ghost" onclick="setStatus(\'' + i.id + '\',\'Contesté\')">Contester</button></div>' : "") + "</div>";
  }).join("") : '<div class="card"><div class="irrdetail" style="margin:0">Aucun signal pour l\'instant.</div></div>';
  const filtre = (ecartes || bruit) ? '<p class="note">' + (ecartes ? ecartes + " mail écarté (confidentiel, non analysé). " : "") + (bruit ? bruit + " mails de bruit ignorés." : "") + "</p>" : "";

  const trust = '<div class="card trust" style="margin-top:16px"><h3>Règles de confiance</h3><ul class="arrows">' +
    listeFlechee(CONFIANCE) + "</ul></div>";

  return "<h2>" + (state.role === "collab" ? "Ce que l'assistant repère dans votre activité" : "Fil d'observation : boîte RH et comptes rendus") + "</h2>" + controls +
    '<div class="row c-3-2"><div><div class="feed">' + feed + "</div></div>" +
    "<div><h2>Registre des irritants (" + seen.length + " / " + IRRITANTS.length + ")</h2>" + registre + filtre +
    '<p class="note">Note /12 : grille de priorisation du livrable 01 (fréquence, temps, charge cognitive, risque), proposée par l\'équipe et à valider. Un irritant devient « confirmé » à partir de 2 sources.</p>' +
    trust + "</div></div>";
}

// ------------------------------ ORIENTER -----------------------------------

function selOrient(id) { state.selOrient = id; render(); }
function setStatus(id, s) { state.status[id] = s; if (DB.enabled) dbSetStatus(id, s); render(); }
function lancerContre(id) { state.contre[id] = true; render(); }

function viewOrienter() {
  const picks = IRRITANTS.map(function (i) {
    const r = repById(i.reponse);
    return '<button class="pick' + (state.selOrient === i.id ? " selected" : "") + '" onclick="selOrient(\'' + i.id + '\')">' +
      '<div style="font-weight:700;font-size:14px">' + esc(i.court) + "</div>" +
      '<div class="psub"><span style="color:' + r.color + ';font-weight:700">●</span> ' + esc(r.label) + " · " + esc(state.status[i.id]) + (state.avisMgr[i.id] ? " · manager : " + state.avisMgr[i.id].toLowerCase() : "") + "</div></button>";
  }).join("");

  const i = irrById(state.selOrient);
  const r = repById(i.reponse);
  const rIdx = REPONSES.indexOf(r);
  const ladder = '<div class="ladder">' + REPONSES.map(function (x, k) {
    const on = k === rIdx;
    return '<div class="rung' + (on ? " on" : k > rIdx ? " skip" : "") + '"' + (on ? ' style="background:' + x.color + '"' : "") + ">" + esc(x.label) + "</div>";
  }).join("") + "</div>";

  let contre;
  if (!state.contre[i.id]) {
    contre = '<button class="btn ghost" style="width:auto;padding:8px 14px;font-size:13px;margin-top:10px" onclick="lancerContre(\'' + i.id + '\')">Lancer l\'agent contradicteur</button>';
  } else if (CONTRE[i.id]) {
    const c = CONTRE[i.id];
    contre = '<div class="obj"><b>Objection la plus forte :</b> ' + esc(c.objection) + "</div>" +
      '<div class="obj todo"><b>Vérification dans les sources :</b> ' + esc(c.verif) + "</div>" +
      '<div class="obj ok"><b>Conclusion :</b> ' + esc(c.conclusion) + "</div>";
  } else {
    contre = '<div class="obj todo"><b>Questions posées :</b><ul class="arrows">' +
      QUESTIONS_CONTRE.map(function (q) { return "<li><span>?</span><span>" + esc(q) + "</span></li>"; }).join("") + "</ul></div>" +
      '<div class="obj todo"><b>Conclusion :</b> à remplir avec la sortie réelle du prompt contradicteur, lors de la répétition.</div>';
  }

  const st = state.status[i.id];
  const stCls = st === "Validé" ? "b-emerald" : st === "Ignoré" ? "b-slate" : "b-amber";

  const right = '<div class="card">' +
    '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">' +
      "<div><div class='spechead'>Réponse la plus simple qui suffit</div><div class='spech3'>" + esc(i.titre) + "</div></div>" +
      "<div>" + badge(stCls, st) + " " + avisBadge(i.id) + "</div></div>" + ladder +
    '<p style="margin-top:12px;font-size:14px"><b>Proposition :</b> ' + esc(i.proposition) + "</p>" +
    '<p style="margin-top:6px;font-size:13px;color:#4a4360"><b>Pourquoi ce niveau :</b> ' + esc(i.pourquoi) + "</p>" +
    '<p class="note" style="margin-top:6px">Traitement selon la grille du livrable 01 : ' + esc(i.traitement) + ".</p></div>" +
    '<div class="card" style="margin-top:16px"><div class="spechead">Contre-analyse</div>' + contre + "</div>" +
    '<div class="card" style="margin-top:16px;border-color:#fde68a;background:#fffbeb"><div class="spechead" style="color:#b45309">Validation humaine</div>' +
      '<p style="font-size:13px;color:#2f2745;margin-top:6px">Le collaborateur et le manager concernés voient l\'irritant en premier et peuvent le contester. Le HRBP, propriétaire du processus, valide et choisit la réponse. Sans validation, aucune spec n\'est générée et aucun agent n\'est lancé.</p>' +
      '<div class="btns"><button class="btn ok" onclick="setStatus(\'' + i.id + '\',\'Validé\')">Valider</button>' +
      '<button class="btn ghost" onclick="setStatus(\'' + i.id + '\',\'Ignoré\')">Ignorer</button>' +
      '<button class="btn ghost" onclick="setStatus(\'' + i.id + '\',\'À valider\')">Remettre à valider</button></div></div>';

  const counts = {}; IRRITANTS.forEach(function (x) { counts[x.reponse] = (counts[x.reponse] || 0) + 1; });
  const resume = REPONSES.map(function (x) { return badge("b-slate", x.label + " : " + (counts[x.id] || 0)); }).join(" ");

  return "<h2>Orienter : pas un agent pour chaque irritant</h2>" +
    '<div class="chips" style="margin-bottom:14px">' + resume + "</div>" +
    '<div class="row c-1-2"><div>' + picks + "</div><div>" + right + "</div></div>" +
    '<p class="note">Règle du prompt de détection : proposer un réglage, un document ou un workflow sans IA avant un agent ; un agent seulement si la tâche demande du jugement ou de la rédaction. Sur 6 irritants RH, un seul agent. Aucun agent n\'existe aujourd\'hui chez Scalian.</p>';
}

// --------------------------- SPÉCIFICATION ---------------------------------

function pickSpec(id) { state.selSpec = id; state.specReady = false; state.genStep = 0; state.generating = false; render(); }

function genererSpec() {
  if (!state.selSpec || state.status[state.selSpec] !== "Validé") return;
  state.generating = true; state.specReady = false; state.genStep = 0; render();
  GEN_STEPS.forEach(function (_, k) { timers.push(setTimeout(function () { state.genStep = k + 1; render(); }, 650 * (k + 1))); });
  timers.push(setTimeout(function () { state.generating = false; state.specReady = true; render(); }, 650 * GEN_STEPS.length + 300));
}

function viewSpec() {
  const picks = IRRITANTS.map(function (i) {
    return '<button class="pick' + (state.selSpec === i.id ? " selected" : "") + '" onclick="pickSpec(\'' + i.id + '\')">' +
      '<div style="font-weight:700;font-size:14px">' + esc(i.court) + "</div>" +
      '<div class="psub">' + esc(repById(i.reponse).label) + " · " + esc(state.status[i.id]) + "</div></button>";
  }).join("");

  const sel = state.selSpec ? irrById(state.selSpec) : null;
  const validated = sel && state.status[sel.id] === "Validé";
  let warn = "";
  if (sel && !validated) {
    warn = '<div class="obj" style="margin-top:12px">Irritant au statut « ' + esc(state.status[sel.id]) + ' ». La spec n\'est générée qu\'après validation par le HRBP. <a href="#" onclick="selOrient(\'' + sel.id + '\');setTab(\'orienter\');return false">Aller à Orienter</a></div>';
  }

  let right;
  if (state.specReady && sel) {
    if (sel.id === "arrivee") {
      right = '<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">' +
        "<div><div class='spechead'>Spécification générée par l'IA · relue par l'équipe</div><div class='spech3'>Agent d'intégration</div></div>" +
        badge("b-violet", "Autonomie : préparer") + "</div></div>" +
        '<div class="tw" style="margin-top:12px"><table class="spectable"><tbody>' +
        SPEC_INTEGRATION.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>"; }).join("") +
        "</tbody></table></div>" +
        '<p class="note">La spec ne se met pas à jour seule. Si les signaux évoluent, l\'assistant propose une nouvelle version, qui repasse par la validation du HRBP.</p>';
    } else if (sel.id === "doc") {
      right = '<div class="card"><div class="spechead">Pas de spec d\'agent</div><div class="spech3">Page de référence unique</div>' +
        '<p style="margin-top:8px;font-size:14px;color:#2f2745">L\'assistant ne propose pas d\'agent : le problème n\'est pas de chercher, c\'est qu\'il existe plusieurs versions.</p>' +
        '<ol class="wf"><li><span class="wnum">1</span><span>Une seule page « Accueil » liste les documents en vigueur : livret, accord télétravail 2025, mutuelle, notes de frais, programme du premier jour.</span></li>' +
        '<li><span class="wnum">2</span><span>Une seule version par document ; les anciennes passent dans un dossier Archives.</span></li>' +
        '<li><span class="wnum">3</span><span>La page est lisible avant l\'arrivée, sans compte interne (le lien « accès refusé » du mail 5 disparaît).</span></li>' +
        '<li><span class="wnum">4</span><span>Un responsable unique, nommé par le HRBP, tient la page à jour.</span></li></ol></div>' +
        '<p class="note">Sources : mails 2, 3, 5, 9, 13, 14 ; CR-1, CR-4. L\'IA peut aider une fois, à repérer les doublons dans le dossier partagé si Scalian autorise cette source.</p>';
    } else {
      right = '<div class="card"><div class="spechead">Spec à générer en répétition</div><div class="spech3">' + esc(sel.court) + "</div>" +
        '<p style="margin-top:8px;font-size:14px;color:#2f2745">Cette spec n\'est pas encore rédigée. Elle sera produite avec le prompt ci-dessous, puis relue par l\'équipe. La maquette n\'affiche pas de contenu inventé.</p>' +
        "<pre>" + esc(PROMPT_GEN) + "</pre></div>";
    }
  } else {
    right = '<div class="empty"><div class="big">📋</div><p>Choisissez un irritant validé, puis lancez la génération. La spec suit le modèle en 11 rubriques du livrable 03 : de l\'irritant détecté jusqu\'au gain attendu et à son indicateur.</p></div>';
  }

  const gen = (state.generating || state.specReady) ? '<div class="gensteps">' + GEN_STEPS.map(function (s, k) {
    return '<div class="gstep' + (state.genStep > k ? " on" : "") + '"><span class="gdot"></span><span>' + esc(s) + "</span></div>";
  }).join("") + "</div>" : "";

  return '<div class="row c-1-2"><div><h2>Choisir un irritant</h2>' + picks +
    '<button class="btn" onclick="genererSpec()"' + ((!validated || state.generating) ? " disabled" : "") + ">" +
      (state.generating ? "Génération en cours…" : "Générer la spécification") + "</button>" + warn + gen +
    "</div><div>" + right + "</div></div>";
}

// ----------------------------- AGENT & OUTILS ------------------------------

function lancerAgent() {
  timers.forEach(clearTimeout);
  state.agentRunning = true; state.agentStep = 0; render();
  AGENT_STEPS.forEach(function (_, k) {
    timers.push(setTimeout(function () { state.agentStep = k + 1; render(); }, 1300 * (k + 1)));
  });
  timers.push(setTimeout(function () { state.agentRunning = false; render(); }, 1300 * AGENT_STEPS.length + 300));
}

// ------------------------------- PERSONAS -----------------------------------


function kpiTiles() {
  const all = EVENTS.concat([LIVE_EVENT]);
  const occ = occurrences(all);
  const nIrr = IRRITANTS.filter(function (i) { return occ[i.id]; }).length;
  const nVal = IRRITANTS.filter(function (i) { return state.status[i.id] === "Validé"; }).length;
  const nAgent = IRRITANTS.filter(function (i) { return i.reponse === "agent"; }).length;
  const tiles = [
    ["Arrivants prêts le premier jour", "0 / 3", "Jeu fictif : poste ou accès manquant pour les 3 arrivées"],
    ["Irritants détectés", String(nIrr), "Jeu fictif, au niveau du processus"],
    ["Irritants validés par le HRBP", nVal + " / " + IRRITANTS.length, "Selon les validations du HRBP dans l'outil"],
    ["Réponses proposées", nAgent + " agent · " + (IRRITANTS.length - nAgent) + " sans IA", "La réponse la plus simple qui suffit"],
    ["Mails échangés par arrivée", "à mesurer", "Avant / après, sur de vraies arrivées"],
    ["Temps gagné", "à mesurer", "Aucune estimation affichée"],
  ];
  return '<div class="kpis">' + tiles.map(function (t) {
    return '<div class="kpi"><div class="spechead">' + esc(t[0]) + '</div><div class="kv' + (t[1] === "à mesurer" ? " tbd" : "") + '">' + esc(t[1]) + '</div><div class="irrdetail" style="margin-top:4px">' + esc(t[2]) + "</div></div>";
  }).join("") + "</div>";
}

// -------------------------------- SUIVRE -----------------------------------

function viewSuivre() {
  const all = EVENTS.concat([LIVE_EVENT]);
  const occ = occurrences(all);
  const max = Math.max.apply(null, IRRITANTS.map(function (i) { return (occ[i.id] || []).length; }));
  const bars = IRRITANTS.map(function (i) {
    const v = (occ[i.id] || []).length;
    return '<div class="bar"><span class="lbl">' + esc(i.court) + '</span><span class="track"><span class="fill" style="display:block;width:' + Math.round(v / max * 100) + '%"></span></span><span class="val">' + v + "</span></div>";
  }).join("");

  const c = { "À valider": 0, "Contesté": 0, "Validé": 0, "Ignoré": 0 };
  IRRITANTS.forEach(function (i) { c[state.status[i.id]] += 1; });
  const statuts = Object.keys(c).map(function (k) { return badge(k === "Validé" ? "b-emerald" : k === "Ignoré" ? "b-slate" : "b-amber", k + " : " + c[k]); }).join(" ");

  const cards = IRRITANTS.map(function (i) {
    const r = repById(i.reponse);
    return '<div class="card" style="margin:0"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
      '<div class="irrtitle">' + esc(i.proposition.split(/[:.]/)[0]) + "</div>" +
      '<span class="badge" style="background:' + r.color + ';color:#fff;border-color:transparent">' + esc(r.label) + "</span></div>" +
      '<div class="irrdetail">Irritant d\'origine : ' + esc(i.court) + "</div>" +
      '<table style="margin-top:8px;font-size:12px"><tbody>' +
      "<tr><td style='padding:3px 8px 3px 0;color:#64748b'>Indicateur</td><td style='padding:3px 0'>" + esc(INDICATEURS[i.id] || "") + "</td></tr>" +
      "<tr><td style='padding:3px 8px 3px 0;color:#64748b'>L'irritant a-t-il disparu ?</td><td style='padding:3px 0' class='tbd'>à mesurer</td></tr>" +
      "<tr><td style='padding:3px 8px 3px 0;color:#64748b'>Données</td><td style='padding:3px 0'>Pas encore en service</td></tr>" +
      "</tbody></table></div>";
  }).join("");

  return "<h2>Suivre : l'amélioration dans la durée</h2>" +
    '<div class="duo"><div class="card" style="margin:0"><div class="spechead">Vue 1 · Sources par irritant</div>' + bars +
      '<p class="note">Calculé sur le jeu de données (21 mails, 4 comptes rendus). Agrégé par irritant, jamais par personne.</p></div>' +
    '<div class="card" style="margin:0"><div class="spechead">Vue 2 · Taux de validation</div><div class="chips" style="margin-top:10px">' + statuts + "</div>" +
      '<p class="note">Reflète les validations faites dans l\'onglet Orienter. En démo, il mesure la précision de l\'assistant, corrigée par l\'humain.</p>' +
      '<div class="spechead" style="margin-top:14px">Vue 3 · Délai de traitement</div><p style="font-size:13px;margin-top:6px">Entre « Détecté le » et « Traité le » : <span class="tbd">à mesurer</span>.</p></div></div>' +
    '<h3 style="margin-top:22px">Vue 4 · Suivi des réponses mises en place</h3>' +
    '<div class="duo">' + cards + "</div>" +
    '<div class="card" style="margin-top:16px;border-color:#fde68a;background:#fffbeb"><div class="spechead" style="color:#b45309">Alertes (principe)</div><ul class="arrows">' +
      "<li><span>↺</span><span>Un irritant traité qui réapparaît dans les sources repasse au statut « À valider ».</span></li>" +
      "<li><span>↺</span><span>Une page ou une FAQ qui ne fait pas baisser les questions est signalée « à revoir », sur décision du HRBP.</span></li>" +
      "<li><span>↺</span><span>Si les brouillons de l\'agent sont souvent réécrits à la main, l\'agent est proposé « à adapter » plutôt que remplacé.</span></li></ul>" +
      '<p class="note">Avant le 28/11, aucune semaine d\'usage réel n\'existe : toutes les valeurs d\'usage restent « à mesurer ».</p></div>';
}

// ---------------------------------------------------------------------------
// v6 : l'outil vu par chaque persona (les livrables sont dans un document à part)
// ---------------------------------------------------------------------------


state.det = { running: false, loaded: false, rows: [], err: "", last: null,
  ia: { loaded: false, providers: [], provider: "", model: "", baseUrl: "", models: [], status: null, busy: "", msg: "", key: "" } };
state.role = "collab";
state.tab = "arrivees";
state.lucas = { recu: false, envoyes: {}, infos: { lieu: "", materiel: "", acces: "" }, complete: false };

function role() { return ROLES.find(function (r) { return r.id === state.role; }); }
function renderWho() {
  let w = IDENT[state.role] || ["", ""];
  if (DB.enabled && DB.profile) w = [DB.profile.full_name || DB.profile.email, role().persona];
  document.getElementById("who-nom").textContent = w[0];
  document.getElementById("who-fn").textContent = w[1];
  document.getElementById("um-nom").textContent = w[0];
  document.getElementById("um-fn").textContent = w[1];
}
function toggleBento(e) {
  e.stopPropagation(); closeUser();
  const m = document.getElementById("bento"), b = document.getElementById("bento-btn");
  const open = m.hidden; m.hidden = !open; b.setAttribute("aria-expanded", open ? "true" : "false");
}
function toggleUser(e) {
  e.stopPropagation(); closeBento();
  const m = document.getElementById("usermenu"), b = document.getElementById("user-btn");
  const open = m.hidden; m.hidden = !open; b.setAttribute("aria-expanded", open ? "true" : "false");
}
function closeUser() { const m = document.getElementById("usermenu"); if (m && !m.hidden) { m.hidden = true; document.getElementById("user-btn").setAttribute("aria-expanded", "false"); } }
document.addEventListener("click", function (e) { if (!e.target.closest(".usermenu")) closeUser(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeUser(); });
function closeBento() { const m = document.getElementById("bento"); if (m && !m.hidden) { m.hidden = true; document.getElementById("bento-btn").setAttribute("aria-expanded", "false"); } }
document.addEventListener("click", function (e) { if (!e.target.closest(".bento")) closeBento(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeBento(); });
function setRole(id) { state.role = id; state.tab = role().tabs[0][0]; render(); window.scrollTo(0, 0); }

function renderTabs() {
  const tabs = role().tabs.map(function (t) {
    return '<button class="tab' + (state.tab === t[0] ? " active" : "") + '" onclick="setTab(\'' + t[0] + '\')">' + esc(t[1]) + "</button>";
  }).join("");
  document.getElementById("tabs").innerHTML = '<div class="tabrow">' + tabs + "</div>";
}

// ----------------------------- ARRIVÉES (Camille) ---------------------------

function recevoirMail21() {
  if (state.lucas.recu) return;
  envoyerLive();            // le mail rejoint aussi le fil d'observation
  state.lucas.recu = true;
  if (DB.enabled) dbSaveArrivee({ recu: true });
  state.tab = "arrivees";
  lancerAgent();
}
function envoyerBrouillon(id) { state.lucas.envoyes[id] = "Envoyé par Camille"; if (DB.enabled) dbSetBrouillon(id, "Envoyé par Camille"); render(); }
function ignorerBrouillon(id) { state.lucas.envoyes[id] = "Ignoré"; if (DB.enabled) dbSetBrouillon(id, "Ignoré"); render(); }

function ficheRows() {
  const L = state.lucas, I = L.infos;
  return [
    ["Annonce de l'arrivée", "Manager", "Dès la signature", L.complete ? ["ok", "Complète"] : ["warn", "3 informations manquantes : lieu, matériel, accès"]],
    ["Poste de travail et comptes", "Informatique", "10 jours ouvrés", ["bad", "Délai dépassé · PC de secours à demander"]],
    ["Habilitation spécifique", "Informatique", "15 jours ouvrés", L.complete ? (I.acces && I.acces !== "Aucun" ? ["bad", "Requise : " + I.acces + " · délai dépassé"] : ["ok", "Non requise"]) : ["warn", "À confirmer avec la manager"]],
    ["Badge et place", "Services généraux", "3 jours ouvrés", L.envoyes.sg === "Envoyé par Camille" ? ["ok", "Demandé"] : ["warn", "À demander aujourd'hui"]],
    ["Programme du premier jour", "Manager et RH", "5 jours", L.complete ? ["ok", "Lieu : " + I.lieu] : ["warn", "Lieu inconnu"]],
    ["Dossier administratif", "RH", "15 jours", ["warn", "Liste à envoyer · accusé de réception automatique"]],
    ["Documents d'accueil", "RH", "Avec le mail de bienvenue", ["warn", "Lien vers la page de référence (à créer)"]],
  ];
}
function ficheTable() {
  const cls = { ok: "b-emerald", warn: "b-amber", bad: "b-rose" };
  return '<div class="tw"><table><thead><tr><th>Étape</th><th>Qui</th><th>Délai de référence</th><th>Statut</th></tr></thead><tbody>' +
    ficheRows().map(function (r) { return "<tr><td><b>" + esc(r[0]) + "</b></td><td>" + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td><td>" + badge(cls[r[3][0]], r[3][1]) + "</td></tr>"; }).join("") +
    "</tbody></table></div>";
}

function viewArrivees() {
  const L = state.lucas;
  const done = state.agentStep >= AGENT_STEPS.length;
  const lucasCard = L.recu
    ? '<div class="card" style="border-color:#4b2882"><div class="irrtitle">Lucas Fabre</div><div class="irrdetail" style="margin-top:2px">Consultant data · BU Data · lundi prochain</div><div class="irrtags">' +
      (done ? badge(L.complete ? "b-emerald" : "b-amber", L.complete ? "Annonce complète" : "3 informations manquantes") + badge("b-rose", "Délai poste dépassé") : badge("b-slate", "Préparation en cours…")) + "</div></div>"
    : '<div class="card"><div class="irrdetail" style="margin:0">Aucune nouvelle annonce.</div><button class="btn" onclick="recevoirMail21()">Mail 21 reçu : préparer l\'arrivée</button><p class="note">En démo, le mail part en direct d\'un téléphone ; ce bouton le simule.</p></div>';
  const passees = ARRIVEES_PASSEES.map(function (a) {
    return '<div class="card"><div class="irrtitle">' + esc(a.nom) + '</div><div class="irrdetail" style="margin-top:2px">' + esc(a.poste) + " · arrivé(e) " + a.date + "</div>" +
      '<div class="irrdetail">' + esc(a.etat) + "</div></div>";
  }).join("");
  const left = "<h2>Arrivées</h2>" + lucasCard + '<h3 style="margin-top:18px">Arrivées passées</h3>' + passees;

  let right;
  if (!L.recu) {
    right = '<div class="empty"><div class="big">🗂️</div><p>Quand une annonce d\'arrivée arrive dans la boîte RH, ACIA la compare à la checklist, calcule les échéances et prépare les messages. Vous relisez et vous envoyez.</p></div>';
  } else {
    const steps = AGENT_STEPS.map(function (s, k) {
      let c = state.agentStep > k ? " done" : state.agentStep === k ? " active" : "";
      if (s.human && state.agentStep >= AGENT_STEPS.length && !Object.keys(L.envoyes).length) c = " active";
      return '<div class="step' + c + (s.human ? " human" : "") + '"><span class="snum">' + (c === " done" ? "✓" : k + 1) + '</span><div style="flex:1;min-width:0"><div class="steptitle">' + esc(s.label) + '</div><div class="stepsub">' + esc(s.detail) + "</div></div></div>";
    }).join("");
    right = "<h2>Journal de l'assistant</h2>" + steps;
    if (done) {
      const drafts = BROUILLONS.map(function (b) {
        const st = L.envoyes[b.id];
        return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><div class="spechead">Brouillon · à ' + esc(b.a) + '</div><div class="irrtitle">' + esc(b.objet) + "</div></div>" +
          (st ? badge(st === "Ignoré" ? "b-slate" : "b-emerald", st) : badge("b-amber", "À relire")) + "</div>" +
          '<p style="font-size:13px;color:#2f2745;margin-top:8px">' + esc(b.corps) + "</p>" +
          (st ? "" : '<div class="btns"><button class="btn ok" onclick="envoyerBrouillon(\'' + b.id + '\')">Envoyer</button><button class="btn ghost" onclick="ignorerBrouillon(\'' + b.id + '\')">Ignorer</button></div>') + "</div>";
      }).join("");
      right += '<h2 style="margin-top:20px">Fiche d\'arrivée · Lucas Fabre</h2>' + ficheTable() +
        '<h2 style="margin-top:20px">Brouillons préparés (rien n\'est parti)</h2>' + drafts +
        '<p class="note">Maquette : le bouton « Envoyer » ne fait que changer le statut. En démo, l\'envoi se fait depuis Thunderbird.</p>';
    }
  }
  return '<div class="row c-1-2"><div>' + left + "</div><div>" + right + "</div></div>";
}

// ----------------------------- MES ARRIVÉES (Isabelle) ----------------------

function completerAnnonce() {
  const g = function (id) { return document.getElementById(id).value.trim(); };
  state.lucas.infos = { lieu: g("f-lieu"), materiel: g("f-mat") || "PC portable standard", acces: g("f-acces") || "Aucun" };
  state.lucas.complete = true;
  if (DB.enabled) dbSaveArrivee({ complete: true, lieu: state.lucas.infos.lieu, materiel: state.lucas.infos.materiel, acces: state.lucas.infos.acces });
  render();
}

// ----------------------- IRRITANTS DE L'ÉQUIPE (manager) -------------------
function avisBadge(id) {
  const a = state.avisMgr && state.avisMgr[id];
  return a ? badge(a === "Confirmé" ? "b-emerald" : "b-rose", "Manager : " + a.toLowerCase()) : "";
}
function setAvis(id, a) { state.avisMgr[id] = a; if (DB.enabled) dbSetAvis(id, a); render(); }
function viewEquipe() {
  const occ = occurrences(EVENTS);
  const cards = IRR_MANAGER.map(function (m) {
    const i = irrById(m[0]); const a = state.avisMgr[i.id];
    return '<div class="card irr-card"><div class="irr">' + ring(i.note) +
      '<div style="flex:1;min-width:0"><div class="irrtitle">' + esc(i.titre) + "</div>" +
      '<div class="irrtags">' + badge("b-slate", repById(i.reponse).label) + badge("b-slate", "HRBP : " + state.status[i.id].toLowerCase()) + avisBadge(i.id) + "</div></div></div>" +
      '<p style="font-size:14px;margin-top:8px"><b>En quoi votre équipe est concernée :</b> ' + esc(m[1]) + "</p>" +
      '<p style="font-size:13px;color:#4a4360;margin-top:4px"><b>Réponse proposée :</b> ' + esc(i.proposition) + "</p>" +
      '<div class="irrdetail">Sources : ' + esc((occ[i.id] || []).join(", ")) + "</div>" +
      '<div class="btns">' +
        (a !== "Confirmé" ? '<button class="btn ok" onclick="setAvis(\'' + i.id + '\',\'Confirmé\')">Confirmer</button>' : "") +
        (a !== "Contesté" ? '<button class="btn ghost" onclick="setAvis(\'' + i.id + '\',\'Contesté\')">Contester</button>' : "") +
      "</div></div>";
  }).join("");
  return "<h2>Irritants qui touchent mon équipe</h2>" +
    '<div class="row c-3-2"><div>' + cards + "</div>" +
    '<div><div class="card trust"><h3>Ce que vous voyez, et ce que vous ne voyez pas</h3><ul class="arrows">' +
      listeFlechee(CONFIANCE_MANAGER) + "</ul></div></div></div>";
}

function viewMesArrivees() {
  const L = state.lucas;
  if (!L.recu || state.agentStep < AGENT_STEPS.length) {
    return "<h2>Mes arrivées</h2>" + '<div class="empty"><div class="big">👋</div><p>Aucune arrivée en préparation. Annoncez une arrivée par mail à la boîte RH, comme d\'habitude, ou complétez ici une annonce déjà reçue. (En démo : passer d\'abord par l\'écran de Camille, mail 21.)</p></div>';
  }
  const form = L.complete
    ? '<div class="result"><b>Annonce complète</b><p>Lieu : ' + esc(L.infos.lieu) + " · matériel : " + esc(L.infos.materiel) + " · accès particuliers : " + esc(L.infos.acces) + ". La RH et l\'informatique voient la mise à jour.</p></div>"
    : '<div class="card"><div class="spechead">Compléter l\'annonce · 3 informations manquantes</div>' +
      '<label class="fl">Lieu du premier jour<select id="f-lieu"><option>Agence</option><option>Chez le client</option></select></label>' +
      '<label class="fl">Matériel<input id="f-mat" placeholder="ex. PC portable standard" /></label>' +
      '<label class="fl">Accès particuliers<input id="f-acces" placeholder="ex. Aucun, ou habilitation client" /></label>' +
      '<button class="btn" onclick="completerAnnonce()">Envoyer à la RH</button>' +
      '<p class="note">Ce formulaire évite l\'aller-retour par mail. L\'annonce par mail reste possible : ACIA la lit de la même façon.</p></div>';
  return '<div class="row c-1-2"><div><h2>Mes arrivées</h2><div class="card" style="border-color:#4b2882"><div class="irrtitle">Lucas Fabre</div><div class="irrdetail" style="margin-top:2px">Consultant data · lundi prochain</div>' +
    '<div class="irrtags">' + badge("b-rose", "Délai poste dépassé : PC de secours demandé") + "</div></div>" + form + "</div>" +
    "<div><h2>État de préparation</h2>" + ficheTable() + '<p class="note">Vous voyez les arrivées de votre équipe. Aucun indicateur sur vous ni sur vos collaborateurs.</p></div></div>';
}

// ----------------------------- TABLEAU DE BORD (direction) ------------------

function viewTableau() {
  const all = EVENTS.concat([LIVE_EVENT]);
  const occ = occurrences(all);
  const max = Math.max.apply(null, IRRITANTS.map(function (i) { return (occ[i.id] || []).length; }));
  const bars = IRRITANTS.map(function (i) {
    const v = (occ[i.id] || []).length;
    return '<div class="bar"><span class="lbl">' + esc(i.court) + '</span><span class="track"><span class="fill" style="display:block;width:' + Math.round(v / max * 100) + '%"></span></span><span class="val">' + v + "</span></div>";
  }).join("");
  return "<h2>Tableau de bord · intégration des nouveaux collaborateurs</h2>" + kpiTiles() +
    '<div class="card" style="margin-top:16px"><div class="spechead">Sources par irritant</div>' + bars + "</div>" +
    '<p class="note">Indicateurs de processus agrégés : aucun nom, aucun classement d\'équipe ou de manager, aucun indicateur sur un groupe de moins de 5 personnes (seuil proposé). Les valeurs viennent du jeu de données fictif ; le reste est « à mesurer ».</p>';
}

// ----------------------------- DÉTECTION IA (HRBP) --------------------------

async function chargerDetections() {
  try { state.det.rows = await dbLoadDetections(); state.det.loaded = true; state.det.err = ""; }
  catch (e) { state.det.err = e.message; }
  render();
}
function lireConfigIa() {
  const g = function (id) { const e = document.getElementById(id); return e ? e.value : ""; };
  const ia = state.det.ia;
  ia.provider = g("ia-provider") || ia.provider;
  ia.model = g("ia-model").trim();
  ia.baseUrl = g("ia-base").trim() || ia.baseUrl;
  const typed = document.getElementById("ia-key");
  if (typed) ia.key = typed.value.trim(); // gardée en mémoire de la page seulement, jamais dans le stockage du navigateur
  return { provider: ia.provider, model: ia.model, base_url: ia.baseUrl, api_key: ia.key };
}
function memoriserPrefsIa() {
  try { localStorage.setItem("acia-ia", JSON.stringify({ provider: state.det.ia.provider, model: state.det.ia.model })); } catch (e) { /* facultatif */ }
}
async function chargerIa() {
  const ia = state.det.ia;
  try {
    const c = await dbLoadAiConfig();
    ia.providers = c.providers;
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem("acia-ia") || "{}"); } catch (e) { prefs = {}; }
    const ids = c.providers.map(function (p) { return p.id; });
    ia.provider = ids.indexOf(prefs.provider) >= 0 ? prefs.provider : (c.defaultProvider || ids[0] || "");
    const p = c.providers.find(function (x) { return x.id === ia.provider; });
    ia.model = (prefs.provider === ia.provider && prefs.model) ? prefs.model : (p && p.default_model) || "";
    ia.baseUrl = (p && p.base_url) || "";
    ia.loaded = true;
    await majStatutCle(true);
  } catch (e) { state.det.err = e.message; }
  render();
}
async function majStatutCle(noRender) {
  const ia = state.det.ia;
  ia.status = null;
  try { ia.status = await dbAi("status", { provider: ia.provider }); } catch (e) { ia.status = null; }
  if (!noRender) render();
}
async function changerFournisseur() {
  const ia = state.det.ia;
  ia.provider = document.getElementById("ia-provider").value;
  const p = ia.providers.find(function (x) { return x.id === ia.provider; });
  ia.model = (p && p.default_model) || ""; ia.baseUrl = (p && p.base_url) || ""; ia.models = []; ia.msg = ""; ia.key = "";
  await majStatutCle();
}
async function actionIa(nom) {
  const ia = state.det.ia, cfg = lireConfigIa();
  if (ia.busy) return;
  ia.busy = nom; ia.msg = ""; state.det.err = ""; render();
  try {
    if (nom === "models") {
      const r = await dbAi("models", cfg); ia.models = r.models;
      ia.msg = r.models.length + " modèles chargés (clé : " + r.key_source + "). Choisissez-en un dans la liste du champ Modèle.";
    } else if (nom === "save_key") {
      await dbAi("save_key", cfg); ia.key = ""; ia.msg = "Clé mémorisée (chiffrée) pour votre compte."; await majStatutCle(true);
    } else if (nom === "delete_key") {
      await dbAi("delete_key", cfg); ia.msg = "Votre clé mémorisée est supprimée."; await majStatutCle(true);
    } else if (nom === "set_default") {
      if (!confirm("Définir ce fournisseur, ce modèle et cette clé comme réglage par défaut du projet pour tous les HRBP ?")) { ia.busy = ""; render(); return; }
      await dbAi("set_default", cfg); ia.key = ""; ia.msg = "Réglage par défaut du projet enregistré."; await majStatutCle(true);
    }
    memoriserPrefsIa();
  } catch (e) { state.det.err = e.message; }
  ia.busy = ""; render();
}
async function lancerDetection() {
  if (state.det.running) return;
  const cfg = lireConfigIa();
  memoriserPrefsIa();
  state.det.running = true; state.det.err = ""; state.det.ia.msg = ""; render();
  try {
    state.det.last = await dbRunDetection(cfg);
    state.det.rows = await dbLoadDetections(); state.det.loaded = true;
  } catch (e) { state.det.err = e.message; }
  state.det.running = false; render();
}
function setDetStatut(id, s) {
  const d = state.det.rows.find(function (x) { return x.id === id; });
  if (d) d.statut = s;
  dbSetDetStatut(id, s); render();
}
async function ajouterSource() {
  const g = function (id) { return document.getElementById(id); };
  const conf = g("s-conf").checked, titre = g("s-titre").value.trim(), texte = g("s-texte").value.trim();
  if (!conf && (!titre || !texte)) { toast("Renseignez l'objet et le texte.", true); return; }
  try {
    // Un mail confidentiel n'est jamais enregistré : ni objet, ni contenu, ni expéditeur.
    const ev = await dbAddEvent(conf
      ? { src: "mail", de: "Expéditeur masqué", titre: "Mail confidentiel", texte: "Contenu non affiché.", conf: true }
      : { src: g("s-src").value, de: g("s-de").value.trim(), titre: titre, texte: texte, conf: false });
    EVENTS.push(ev);
    toast("Source ajoutée : " + ev.ref + ".");
    g("s-titre").value = ""; g("s-texte").value = ""; g("s-de").value = ""; g("s-conf").checked = false;
  } catch (e) { toast("Ajout impossible : " + e.message, true); }
}

function viewDetection() {
  const D = state.det;
  const bloque = DB.demo || !DB.enabled;
  const labels = { faible: "Confiance faible", moyenne: "Confiance moyenne", haute: "Confiance haute" };
  const cls = { faible: "b-slate", moyenne: "b-amber", haute: "b-emerald" };
  const runs = {};
  D.rows.forEach(function (d) { (runs[d.run_id] = runs[d.run_id] || []).push(d); });
  const ids = Object.keys(runs);
  const cards = ids.map(function (rid, n) {
    const list = runs[rid], meta = list[0].detection_runs || {};
    const date = meta.created_at ? new Date(meta.created_at).toLocaleString("fr-FR") : "";
    return '<h3 style="margin:' + (n ? "22px" : "4px") + ' 0 8px">Analyse du ' + esc(date) + '</h3>' +
      (meta.resume ? '<p class="note" style="margin:0 0 10px">' + esc(meta.resume) + " (" + (meta.nb_events || "?") + " sources lues, modèle " + esc(meta.model || "?") + ")</p>" : "") +
      list.map(function (d) {
        const r = d.reponse ? repById(d.reponse) : null;
        const ex = d.existant_id ? irrById(d.existant_id) : null;
        const stCls = d.statut === "Validé" ? "b-emerald" : d.statut === "Ignoré" ? "b-slate" : "b-amber";
        return '<div class="card irr-card"><div class="irrtitle">' + esc(d.titre) + "</div>" +
          '<div class="irrtags">' + badge(cls[d.confiance] || "b-slate", labels[d.confiance] || "Confiance ?") +
            badge(d.sources.length >= 2 ? "b-amber" : "b-slate", d.sources.length >= 2 ? "Irritant · " + d.sources.length + " sources" : "Signal isolé · 1 source") +
            (r ? badge("b-slate", r.label) : "") + (ex ? badge("b-violet", "Déjà au registre : " + ex.court) : badge("b-sky", "Nouveau")) + badge(stCls, d.statut) + "</div>" +
          '<div class="irrdetail">Sources : ' + esc(d.sources.join(", ")) + "</div>" +
          '<p style="font-size:14px;margin-top:8px"><b>Proposition :</b> ' + esc(d.proposition || "") + "</p>" +
          '<p style="font-size:13px;color:#4a4360;margin-top:4px"><b>Pourquoi ce niveau :</b> ' + esc(d.pourquoi || "") + "</p>" +
          '<div class="btns"><button class="btn ok" onclick="setDetStatut(\'' + d.id + '\',\'Validé\')">Valider</button>' +
          '<button class="btn ghost" onclick="setDetStatut(\'' + d.id + '\',\'Ignoré\')">Ignorer</button>' +
          '<button class="btn ghost" onclick="setDetStatut(\'' + d.id + '\',\'À valider\')">Remettre à valider</button></div></div>';
      }).join("");
  }).join("");

  const last = D.last ? '<div class="result"><b>Analyse terminée</b><p>' + D.last.nb_irritants + " irritant(s) proposé(s) à partir de " + D.last.nb_sources + " sources" +
    (D.last.nb_exclus ? " (" + D.last.nb_exclus + " mail confidentiel écarté, jamais envoyé à l'IA)" : "") +
    (D.last.provider ? " ; fournisseur " + esc(D.last.provider) + ", modèle " + esc(D.last.model) + ", clé : " + esc(D.last.key_source) : "") +
    (D.last.nb_rejetes ? " ; " + D.last.nb_rejetes + " rejeté(s) faute de source valide" : "") + ".</p></div>" : "";
  const err = D.err ? '<div class="obj" style="margin-top:12px"><b>Erreur :</b> ' + esc(D.err) + "</div>" : "";
  const aide = bloque ? '<div class="obj todo" style="margin-bottom:12px">La détection IA appelle une API payante : elle est réservée aux comptes réels avec le profil HRBP, pas à la démonstration.</div>' : "";

  const empty = !ids.length ? '<div class="empty"><div class="big">🔎</div><p>Aucune analyse pour l\'instant. L\'agent lit les mails et comptes rendus de la base, repère les irritants du processus et propose la réponse la plus simple. Vous validez.</p></div>' : "";

  const form = '<div class="card"><div class="spechead">Ajouter une source à analyser</div>' +
    '<label class="fl">Type<select id="s-src"><option value="mail">Mail de la boîte RH</option><option value="cr">Compte rendu de réunion</option></select></label>' +
    '<label class="fl">Expéditeur, fonction (facultatif)<input id="s-de" placeholder="ex. Marie Durand, manager" /></label>' +
    '<label class="fl">Objet ou titre<input id="s-titre" /></label>' +
    '<label class="fl">Texte<textarea id="s-texte" rows="6"></textarea></label>' +
    '<label class="fl" style="display:flex;gap:8px;align-items:center;font-weight:600"><input id="s-conf" type="checkbox" style="width:auto;margin:0" /> Confidentiel (rien n\'est enregistré ni analysé)</label>' +
    '<button class="btn" onclick="ajouterSource()">Ajouter à la base</button>' +
    '<p class="note">Seul le rôle de l\'expéditeur est transmis à l\'IA, pas son nom. Les noms cités dans le texte restent dans le texte : ne collez que des contenus que Scalian autorise à traiter.</p></div>';

  const ia = D.ia;
  const prov = ia.providers.find(function (x) { return x.id === ia.provider; }) || {};
  const stt = ia.status;
  const cles = !stt ? badge("b-slate", "Statut des clés : inconnu") :
    badge(stt.user_key ? "b-emerald" : "b-slate", "Ma clé : " + (stt.user_key ? "oui" : "non")) + " " +
    badge((stt.default_key || stt.env_key) ? "b-emerald" : "b-slate", "Clé par défaut du projet : " + (stt.default_key ? "oui (base)" : stt.env_key ? "oui (secret)" : "non"));
  const busy = !!ia.busy || D.running;
  const iaCard = '<div class="card" style="margin-bottom:16px"><div class="spechead">Fournisseur d\'IA</div>' +
    (ia.loaded
      ? '<label class="fl">Fournisseur<select id="ia-provider" onchange="changerFournisseur()">' +
          ia.providers.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === ia.provider ? " selected" : "") + ">" + esc(p.label) + "</option>"; }).join("") + "</select></label>" +
        (ia.provider === "custom" ? '<label class="fl">Adresse de l\'API (https)<input id="ia-base" value="' + esc(ia.baseUrl) + '" placeholder="https://api.exemple.com/v1" /></label>' : "") +
        '<label class="fl">Modèle<input id="ia-model" list="ia-models" value="' + esc(ia.model) + '" placeholder="ex. nom du modèle" autocomplete="off" /></label>' +
        '<datalist id="ia-models">' + ia.models.map(function (m) { return '<option value="' + esc(m) + '"></option>'; }).join("") + "</datalist>" +
        '<label class="fl">Clé d\'API (facultatif)<input id="ia-key" type="password" autocomplete="off" value="' + esc(ia.key) + '" placeholder="' + esc(prov.key_hint || "Laisser vide pour utiliser la clé mémorisée ou par défaut") + '" /></label>' +
        '<div class="irrtags" style="margin-top:8px">' + cles + "</div>" +
        '<div class="btns">' +
          '<button class="ctl" onclick="actionIa(\'models\')"' + (busy ? " disabled" : "") + ">Charger les modèles</button>" +
          '<button class="ctl" onclick="actionIa(\'save_key\')"' + (busy ? " disabled" : "") + ">Mémoriser ma clé</button>" +
          '<button class="ctl" onclick="actionIa(\'delete_key\')"' + (busy || !(stt && stt.user_key) ? " disabled" : "") + ">Supprimer ma clé</button>" +
          '<button class="ctl" onclick="actionIa(\'set_default\')"' + (busy ? " disabled" : "") + ">Définir comme défaut du projet</button></div>" +
        (ia.msg ? '<p class="note" style="color:#047857">' + esc(ia.msg) + "</p>" : "") +
        '<p class="note">Ordre d\'utilisation de la clé : saisie ici, puis clé mémorisée pour votre compte, puis clé par défaut du projet. Les clés mémorisées sont chiffrées côté serveur et ne sont jamais relues par le site.' +
        (stt && !stt.can_store ? " <b>Pour mémoriser une clé, ajoutez le secret KEY_ENCRYPTION_SECRET dans Supabase.</b>" : "") + "</p>"
      : '<p class="note" style="margin:8px 0 0">Chargement des fournisseurs…</p>') + "</div>";

  return "<h2>Détection IA des irritants</h2>" + aide +
    '<div class="controls"><button class="btn slim" onclick="lancerDetection()"' + ((D.running || bloque) ? " disabled" : "") + ">" +
      (D.running ? "Analyse en cours…" : "Lancer la détection") + "</button>" +
      '<button class="ctl" onclick="chargerDetections()"' + (bloque ? " disabled" : "") + ">Actualiser</button></div>" +
    last + err +
    '<div class="row c-3-2"><div style="margin-top:8px">' + (bloque ? "" : iaCard) + (cards || empty) + "</div><div>" + form +
    '<div class="card trust" style="margin-top:16px"><h3>Garde-fous</h3><ul class="arrows">' +
      "<li><span>✓</span><span>Les clés ne sont jamais dans le site ni dans GitHub : saisie unique, base chiffrée ou secret Supabase.</span></li>" +
      "<li><span>✓</span><span>Chaque irritant cite des sources réelles : sans source valide, il est rejeté.</span></li>" +
      "<li><span>✓</span><span>Rien n'est envoyé ni décidé : le HRBP valide.</span></li>" +
      "<li><span>✕</span><span>Les mails confidentiels ne sont jamais transmis à l'IA.</span></li></ul></div></div></div>";
}

// ----------------------------- FUTUR EMPLOYÉ --------------------------------

function viewFutur() {
  return "<h2>Le futur employé n'utilise pas ACIA</h2>" +
    '<div class="row c-1-2"><div><div class="card"><p style="font-size:14px">Lucas n\'a pas de compte et n\'est pas observé. Ses pièces administratives ne sont jamais lues par l\'IA.</p><p style="font-size:14px;margin-top:8px">Il reçoit seulement les mails préparés par la RH et envoyés par Camille.</p></div></div>' +
    '<div><div class="card preview"><div class="spechead">Le mail de bienvenue qu\'il reçoit</div>' +
    FUTUR_MAIL.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div></div></div>";
}

// ------------------------------- RENDU --------------------------------------

function render() {
  renderTabs();
  renderWho();
  const views = { arrivees: viewArrivees, registre: viewObserver, orienter: viewOrienter, spec: viewSpec, suivre: viewSuivre, mesarrivees: viewMesArrivees, detection: viewDetection, equipe: viewEquipe, tableau: viewTableau, futur: viewFutur };
  document.getElementById("main").innerHTML = views[state.tab]();
  state.justAdded = false; state.fresh = null;
}



// ---------------------------------------------------------------------------
// Authentification : Supabase (comptes réels) ou mode démonstration (local)
// ---------------------------------------------------------------------------
let authIsSignUp = false;

function authMsg(text, kind) {
  const m = document.getElementById("lg-msg");
  m.className = "lg-msg" + (kind ? " " + kind : "");
  m.textContent = text || "";
}
function authMode(m) {
  authIsSignUp = m === "up";
  document.getElementById("tab-in").classList.toggle("active", !authIsSignUp);
  document.getElementById("tab-up").classList.toggle("active", authIsSignUp);
  document.getElementById("lg-name-wrap").hidden = !authIsSignUp;
  document.getElementById("lg-submit").textContent = authIsSignUp ? "Créer mon compte" : "Se connecter";
  document.getElementById("lg-pass").autocomplete = authIsSignUp ? "new-password" : "current-password";
  authMsg("");
}

function afficherApp() {
  document.getElementById("login").classList.add("hidden");
  document.body.style.overflow = "";
}

// Remet dans l'interface ce qui a déjà été fait (arrivée de Lucas reçue : fil et journal de l'agent complets).
function restaurerEtat() {
  if (state.lucas.recu) {
    state.idx = EVENTS.length;
    state.feed = EVENTS.slice().reverse();
    state.feed.unshift(LIVE_EVENT);
    state.liveSent = true;
    state.agentStep = AGENT_STEPS.length;
  }
}

async function ouvrirSession() {
  const p = await dbLoadProfile();
  await dbLoadReference();
  IRRITANTS.forEach(function (i) { if (!state.status[i.id]) state.status[i.id] = "À valider"; });
  await dbLoadState();
  restaurerEtat();
  DB.demo = !!(DB.user && DB.user.is_anonymous);
  document.getElementById("mode-flag").textContent = DB.demo ? "Démonstration · enregistré en base" : "Connecté · données partagées";
  document.getElementById("um-reset").hidden = p.role !== "hrbp";
  afficherApp();
  setRole(ROLES.some(function (r) { return r.id === p.role; }) ? p.role : "collab");
}

async function authSubmit() {
  if (!DB.enabled) { authMsg("Supabase n'est pas configuré (voir js/config.js). Utilisez le mode démonstration.", "err"); return; }
  const email = document.getElementById("lg-email").value.trim();
  const pass = document.getElementById("lg-pass").value;
  if (!email || !pass) { authMsg("Renseignez l'e-mail et le mot de passe.", "err"); return; }
  const btn = document.getElementById("lg-submit");
  btn.disabled = true; authMsg("");
  try {
    if (authIsSignUp) {
      if (pass.length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères.");
      const d = await dbSignUp(email, pass, document.getElementById("lg-name").value.trim());
      if (d.session) { DB.user = d.user; await ouvrirSession(); }
      else { authMsg("Compte créé. Confirmez votre adresse via le mail reçu, puis connectez-vous.", "ok"); authMode("in"); }
    } else {
      await dbSignIn(email, pass);
      await ouvrirSession();
    }
  } catch (e) {
    authMsg(e.message === "Invalid login credentials" ? "E-mail ou mot de passe incorrect." : e.message, e.message ? "err" : "");
  } finally { btn.disabled = false; }
}

// Mode démonstration : aucun compte, rien n'est écrit en base.
async function seConnecter() {
  const r = document.getElementById("lg-role").value;
  if (!r) return;
  if (DB.enabled) {
    // Démonstration enregistrée en base : session anonyme Supabase + profil choisi.
    const btn = document.getElementById("lg-go"); btn.disabled = true;
    try { await dbDemoSignIn(r); await ouvrirSession(); }
    catch (e) { toast("Démonstration impossible : " + e.message, true); btn.disabled = false; }
    return;
  }
}

async function seDeconnecter() {
  closeBento(); closeUser();
  if (DB.enabled) await dbSignOut();
  // On repart d'un état propre : le plus simple est de recharger la page.
  window.location.reload();
}

async function reinitialiserDemo() {
  closeUser();
  if (!confirm("Remettre la démo à zéro (validations, avis, arrivée de Lucas) ?")) return;
  if (DB.enabled) {
    try { await dbResetDemo(); } catch (e) { toast("Réinitialisation impossible : " + e.message, true); return; }
  }
  window.location.reload();
}

document.body.style.overflow = "hidden";
dbInit();
// Session déjà ouverte (rechargement de la page) : on reconnecte automatiquement.
if (DB.enabled) {
  DB.client.auth.getSession().then(function (r) {
    if (r.data && r.data.session) { DB.user = r.data.session.user; ouvrirSession().catch(function (e) { console.error(e); }); }
  });
} else {
  document.getElementById("lg-auth").hidden = true;
  document.querySelector(".lg-demo").hidden = true;
  document.getElementById("lg-sub").textContent = "Supabase n'est pas configuré : renseignez js/config.js (voir GUIDE-DEPLOIEMENT.md). Toutes les données du site sont stockées en base.";
}
