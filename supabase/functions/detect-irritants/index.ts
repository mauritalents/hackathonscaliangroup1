// Edge Function Supabase : agent de détection des irritants, multi fournisseurs d'IA.
// Fournisseurs : Anthropic (API Messages) et tout fournisseur compatible OpenAI (OpenAI, Gemini, Mistral, Groq,
// DeepSeek, xAI, OpenRouter, Together, ou une adresse personnalisée).
// Ordre de recherche de la clé : 1. clé saisie pour cet appel, 2. clé personnelle mémorisée (chiffrée),
// 3. clé par défaut du projet en base (chiffrée), 4. secret Supabase <FOURNISSEUR>_API_KEY.
// Secret nécessaire pour mémoriser des clés : KEY_ENCRYPTION_SECRET (une longue phrase aléatoire).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_EVENTS = 200;       // nombre maximum de sources envoyées à l'IA par analyse
const MAX_CHARS = 1500;       // longueur maximale du texte d'une source
const MAX_RUNS_PER_HOUR = 10; // garde-fou de coût
const REPONSES = ["reglage", "document", "automatisation", "workflow", "agent"];
const CONFIANCES = ["faible", "moyenne", "haute"];

const SYSTEM = `Tu es analyste métier RH chez un cabinet de conseil. Tu reçois des mails d'une boîte RH et des comptes rendus de réunion. Tu repères les irritants récurrents du processus d'intégration des nouveaux collaborateurs.

Règles impératives :
1. Un irritant décrit une étape du processus, jamais une personne. Ne nomme aucun collaborateur dans les titres ni dans les propositions.
2. Un irritant doit s'appuyer sur au moins 1 source citée par sa référence exacte (par exemple "Mail 7" ou "CR-2"). Il est "confirmé" à partir de 2 sources : indique-le dans la confiance (faible = 1 source, moyenne = 2 ou 3, haute = 4 ou plus et cohérentes).
3. N'invente rien : aucune référence, aucun chiffre, aucun fait absent des sources. Si une information manque, écris-le.
4. Pour chaque irritant, propose la réponse la plus simple qui suffit, dans cet ordre : reglage (réglage d'un outil existant), document (document ou modèle unique), automatisation (automatisation simple), workflow (workflow sans IA), agent (nouvel agent IA). Choisis "agent" seulement si la tâche demande de la compréhension de texte libre ou de la rédaction.
5. Les propositions préparent une validation humaine : rien n'est envoyé ni décidé automatiquement.
6. Ignore le bruit (newsletters, invitations sans lien avec l'intégration).
7. Si un irritant correspond à un irritant déjà connu de la liste fournie, renseigne son identifiant dans existant_id, sinon laisse existant_id vide.
8. Rédige en français, de façon concise.
Réponds uniquement en appelant l'outil enregistrer_irritants.`;

const TOOL = {
  name: "enregistrer_irritants",
  description: "Enregistre la liste des irritants détectés dans les sources.",
  input_schema: {
    type: "object",
    properties: {
      resume: { type: "string", description: "Synthèse en 2 phrases maximum de ce que révèlent les sources." },
      irritants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titre: { type: "string", description: "Description de l'irritant au niveau du processus." },
            court: { type: "string", description: "Titre court, 5 mots maximum." },
            signal: { type: "string", description: "Libellé court du signal repéré dans les sources." },
            sources: { type: "array", items: { type: "string" }, description: "Références exactes des sources, par exemple Mail 7, CR-2." },
            reponse: { type: "string", enum: REPONSES },
            proposition: { type: "string", description: "La réponse proposée, concrète." },
            pourquoi: { type: "string", description: "Pourquoi ce niveau de réponse et pas plus lourd." },
            confiance: { type: "string", enum: CONFIANCES },
            existant_id: { type: "string", description: "Identifiant d'un irritant déjà connu, ou chaîne vide." },
          },
          required: ["titre", "court", "signal", "sources", "reponse", "proposition", "pourquoi", "confiance", "existant_id"],
        },
      },
    },
    required: ["resume", "irritants"],
  },
};


const cut = (s: unknown, n: number) => String(s ?? "").slice(0, n);

const FN_VERSION = 4; // incrémenté à chaque évolution ; le site compare avec la version qu'il attend

class ApiError extends Error {
  status: number; code: string;
  constructor(message: string, status = 500, code = "ERREUR") { super(message); this.status = status; this.code = code; }
}

// ---- Chiffrement des clés mémorisées (AES-GCM, clé dérivée de KEY_ENCRYPTION_SECRET) -------------
async function aesKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("KEY_ENCRYPTION_SECRET");
  if (!secret) throw new ApiError("KEY_ENCRYPTION_SECRET n'est pas défini dans les secrets Supabase : impossible de mémoriser une clé.", 500, "NO_SECRET");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function encrypt(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(text)));
  return { ciphertext: b64(ct), iv: b64(iv) };
}
async function decrypt(ciphertext: string, iv: string): Promise<string | null> {
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(ciphertext));
    return new TextDecoder().decode(pt);
  } catch { return null; } // secret changé ou donnée illisible : on ignore cette clé
}

// Adresse personnalisée : https uniquement, pas de localhost ni d'adresse IP (protection contre les appels internes).
function safeBaseUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ApiError("Adresse de l'API invalide.", 400, "BAD_URL"); }
  const h = u.hostname.toLowerCase();
  const isIp = /^[0-9.]+$/.test(h) || h.includes(":");
  if (u.protocol !== "https:" || isIp || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) {
    throw new ApiError("Adresse refusée : https et nom de domaine public obligatoires (pas d'IP, pas de localhost).", 400, "BAD_URL");
  }
  return u.toString().replace(/\/+$/, "");
}

type Provider = { id: string; label: string; kind: "anthropic" | "openai"; base_url: string | null; default_model: string | null };

// ---- Appels aux fournisseurs ------------------------------------------------------------------------
async function readJson(res: Response) { return await res.json().catch(() => ({})); }
function errMsg(out: any): string {
  return out?.error?.message ?? out?.[0]?.error?.message ?? out?.message ?? "erreur inconnue";
}

async function listModels(p: Provider, base: string, key: string): Promise<string[]> {
  const res = p.kind === "anthropic"
    ? await fetch(`${base}/v1/models?limit=100`, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } })
    : await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
  const out = await readJson(res);
  if (!res.ok) throw new ApiError(`${p.label} (${res.status}) : ${errMsg(out)}`, 502, "PROVIDER");
  const list = (out.data ?? out.models ?? []) as { id?: string; name?: string }[];
  return list.map((m) => String(m.id ?? m.name ?? "").replace(/^models\//, "")).filter(Boolean).sort();
}

function extractJson(text: string) {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
}

async function callModel(p: Provider, base: string, key: string, model: string, userMsg: string) {
  if (p.kind === "anthropic") {
    // 1er essai : outil forcé. Certains modèles (réflexion étendue, versions récentes) refusent tool_choice : 2e essai en automatique.
    const msg = userMsg + "\n\nAppelle l'outil fourni. Si tu ne peux pas, réponds uniquement par un objet JSON {\"resume\": ..., \"irritants\": [...]} avec les mêmes champs.";
    let res: Response, out: any;
    for (const choice of [{ type: "tool", name: TOOL.name }, undefined]) {
      res = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: 4000, system: SYSTEM,
          tools: [TOOL], ...(choice ? { tool_choice: choice } : {}),
          messages: [{ role: "user", content: msg }],
        }),
      });
      out = await readJson(res);
      if (res.ok || !choice || res.status !== 400 || !/tool_choice|tool choice/i.test(errMsg(out))) break;
    }
    if (!res!.ok) throw new ApiError(`${p.label} (${res!.status}) : ${errMsg(out)}`, 502, "PROVIDER");
    const blocks = (out.content ?? []) as { type: string; input?: unknown; text?: string }[];
    const block = blocks.find((x) => x.type === "tool_use");
    if (block?.input) return block.input;
    const txt = blocks.filter((x) => x.type === "text").map((x) => x.text ?? "").join("\n");
    return extractJson(txt);
  }
  // Fournisseurs compatibles OpenAI (chat/completions + appel d'outil)
  const tool = { type: "function", function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.input_schema } };
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userMsg + "\n\nSi tu ne peux pas appeler l'outil, réponds uniquement par un objet JSON {\"resume\": ..., \"irritants\": [...]} avec les mêmes champs." },
  ];
  const forced = p.id === "mistral" ? "any" : "required"; // Mistral n'accepte pas "required"
  let res: Response, out: any;
  for (const choice of [forced, undefined]) { // 2e essai sans forcer l'outil si le fournisseur refuse
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, tools: [tool], ...(choice ? { tool_choice: choice } : {}) }),
    });
    out = await readJson(res);
    if (res.ok || (res.status !== 400 && res.status !== 422) || !choice) break;
  }
  if (!res!.ok) throw new ApiError(`${p.label} (${res!.status}) : ${errMsg(out)}`, 502, "PROVIDER");
  const msg = out?.choices?.[0]?.message;
  const args = msg?.tool_calls?.[0]?.function?.arguments;
  if (args) { try { return typeof args === "string" ? JSON.parse(args) : args; } catch { /* repli sur le contenu texte */ } }
  return typeof msg?.content === "string" ? extractJson(msg.content) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "detect");

    // 1. Qui appelle ? Un compte réel avec le profil HRBP, jamais une session de démonstration anonyme.
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "Non authentifié : reconnectez-vous.", code: "AUTH" }, 401);
    const { data: prof } = await userClient.from("profiles").select("role").eq("id", u.user.id).single();
    const admin = createClient(url, service);

    // Action de diagnostic : répond à tout compte connecté, avant les contrôles de rôle.
    if (action === "ping") {
      const tables = ["profiles", "irritants", "events", "detection_runs", "detections", "ai_providers", "ai_settings", "ai_user_keys", "ai_default_keys"];
      const missing: string[] = [];
      for (const t of tables) {
        const { error } = await admin.from(t).select("*", { count: "exact", head: true });
        if (error) missing.push(t);
      }
      const { data: provs } = await admin.from("ai_providers").select("id");
      const envKeys = (provs ?? []).map((x: { id: string }) => x.id).filter((id: string) => !!Deno.env.get(id.toUpperCase() + "_API_KEY"));
      return json({ ok: true, version: FN_VERSION, role: prof?.role ?? null, anonymous: !!u.user.is_anonymous,
        has_encryption_secret: !!Deno.env.get("KEY_ENCRYPTION_SECRET"), env_keys: envKeys, missing_tables: missing });
    }

    if (u.user.is_anonymous) return json({ error: "La détection IA est réservée aux comptes réels (pas à la démonstration).", code: "ANON" }, 403);
    if (prof?.role !== "hrbp") return json({ error: "La détection IA est réservée au HRBP.", code: "ROLE" }, 403);
    const uid = u.user.id;

    // Vue d'ensemble des clés de tous les fournisseurs (jamais les clés elles-mêmes).
    if (action === "keys_overview") {
      const { data: provs, error: pe0 } = await admin.from("ai_providers").select("id,label,enabled,position").order("position");
      if (pe0) return json({ error: "Tables IA absentes ou illisibles (" + pe0.message + ") : exécutez supabase/migration-ia.sql.", code: "TABLES" }, 500);
      const { data: uks } = await admin.from("ai_user_keys").select("provider,updated_at").eq("user_id", uid);
      const { data: dks } = await admin.from("ai_default_keys").select("provider,updated_at,updated_by");
      const { data: st } = await admin.from("ai_settings").select("default_provider").eq("id", 1).maybeSingle();
      const byIds = [...new Set((dks ?? []).map((d: { updated_by: string | null }) => d.updated_by).filter(Boolean))] as string[];
      const { data: who } = byIds.length ? await admin.from("profiles").select("id,email").in("id", byIds) : { data: [] };
      const mail = new Map((who ?? []).map((w: { id: string; email: string | null }) => [w.id, w.email]));
      const rows = (provs ?? []).map((pr: { id: string; label: string; enabled: boolean }) => {
        const uk = (uks ?? []).find((x: { provider: string }) => x.provider === pr.id);
        const dk = (dks ?? []).find((x: { provider: string }) => x.provider === pr.id);
        return { id: pr.id, label: pr.label, enabled: pr.enabled,
          user_key: uk ? { updated_at: uk.updated_at } : null,
          default_key: dk ? { updated_at: dk.updated_at, updated_by: mail.get(dk.updated_by) ?? null } : null,
          env_key: !!Deno.env.get(pr.id.toUpperCase() + "_API_KEY") };
      });
      return json({ providers: rows, default_provider: st?.default_provider ?? null, can_store: !!Deno.env.get("KEY_ENCRYPTION_SECRET") });
    }

    // 2. Fournisseur choisi
    const providerId = String(body.provider ?? "");
    const { data: prow, error: pe } = await admin.from("ai_providers").select("id,label,kind,base_url,default_model").eq("id", providerId).eq("enabled", true).maybeSingle();
    if (pe) return json({ error: "Tables IA absentes ou illisibles (" + pe.message + ") : exécutez supabase/migration-ia.sql.", code: "TABLES" }, 500);
    if (!prow) return json({ error: "Fournisseur d'IA inconnu ou désactivé.", code: "PROVIDER_INCONNU" }, 400);
    const provider = prow as Provider;
    let base = provider.base_url ? provider.base_url.replace(/\/+$/, "") : "";
    if (providerId === "custom") {
      const raw = String(body.base_url ?? "").trim() || base;
      if (!raw) return json({ error: "Renseignez l'adresse de l'API (https://...).", code: "BAD_URL" }, 400);
      base = safeBaseUrl(raw);
    }
    if (!base) return json({ error: "Adresse de l'API manquante pour ce fournisseur.", code: "BAD_URL" }, 500);

    // 3. Recherche de la clé : saisie > personnelle > défaut projet (base) > secret Supabase
    const resolveKey = async (typed: string): Promise<{ key: string; source: string } | null> => {
      if (typed.trim()) return { key: typed.trim(), source: "saisie" };
      const { data: uk } = await admin.from("ai_user_keys").select("ciphertext,iv").eq("user_id", uid).eq("provider", providerId).maybeSingle();
      if (uk) { const k = await decrypt(uk.ciphertext, uk.iv); if (k) return { key: k, source: "personnelle" }; }
      const { data: dk } = await admin.from("ai_default_keys").select("ciphertext,iv").eq("provider", providerId).maybeSingle();
      if (dk) { const k = await decrypt(dk.ciphertext, dk.iv); if (k) return { key: k, source: "défaut projet (base)" }; }
      const env = Deno.env.get(providerId.toUpperCase() + "_API_KEY");
      if (env) return { key: env, source: "défaut projet (secret)" };
      return null;
    };

    // ---- Actions annexes -------------------------------------------------------------------------
    if (action === "status") {
      const [uk, dk] = await Promise.all([
        admin.from("ai_user_keys").select("provider").eq("user_id", uid).eq("provider", providerId).maybeSingle(),
        admin.from("ai_default_keys").select("provider").eq("provider", providerId).maybeSingle(),
      ]);
      return json({ user_key: !!uk.data, default_key: !!dk.data, env_key: !!Deno.env.get(providerId.toUpperCase() + "_API_KEY"),
        can_store: !!Deno.env.get("KEY_ENCRYPTION_SECRET") });
    }
    if (action === "save_key") {
      const key = String(body.api_key ?? "").trim();
      if (key.length < 8) return json({ error: "Clé trop courte." }, 400);
      const enc = await encrypt(key);
      const { error } = await admin.from("ai_user_keys").upsert({ user_id: uid, provider: providerId, ...enc, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (action === "delete_key") {
      await admin.from("ai_user_keys").delete().eq("user_id", uid).eq("provider", providerId);
      return json({ ok: true });
    }
    if (action === "set_default") {
      const model = cut(body.model, 120).trim();
      const key = String(body.api_key ?? "").trim();
      if (key) {
        if (key.length < 8) return json({ error: "Clé trop courte." }, 400);
        const enc = await encrypt(key);
        const { error } = await admin.from("ai_default_keys").upsert({ provider: providerId, ...enc, updated_by: uid, updated_at: new Date().toISOString() });
        if (error) return json({ error: error.message }, 500);
      }
      const patch: Record<string, unknown> = {};
      if (model) patch.default_model = model;
      if (providerId === "custom") patch.base_url = base;
      if (Object.keys(patch).length) await admin.from("ai_providers").update(patch).eq("id", providerId);
      await admin.from("ai_settings").upsert({ id: 1, default_provider: providerId, updated_at: new Date().toISOString() });
      return json({ ok: true });
    }
    if (action === "delete_default") {
      await admin.from("ai_default_keys").delete().eq("provider", providerId);
      return json({ ok: true });
    }
    // Teste une clé précise en listant les modèles du fournisseur. Répond toujours 200 avec le résultat.
    if (action === "test_key") {
      const src = String(body.source ?? "");
      let key: string | null = null;
      if (src === "user") {
        const { data: uk } = await admin.from("ai_user_keys").select("ciphertext,iv").eq("user_id", uid).eq("provider", providerId).maybeSingle();
        key = uk ? await decrypt(uk.ciphertext, uk.iv) : null;
      } else if (src === "default") {
        const { data: dk } = await admin.from("ai_default_keys").select("ciphertext,iv").eq("provider", providerId).maybeSingle();
        key = dk ? await decrypt(dk.ciphertext, dk.iv) : null;
      } else if (src === "env") {
        key = Deno.env.get(providerId.toUpperCase() + "_API_KEY") ?? null;
      } else return json({ error: "Source de clé inconnue.", code: "ACTION" }, 400);
      if (!key) return json({ ok: false, message: "Clé introuvable ou illisible (secret de chiffrement modifié ?)." });
      try {
        const list = await listModels(provider, base, key);
        return json({ ok: true, message: "Clé valide : " + list.length + " modèle(s) accessible(s)." });
      } catch (e) {
        return json({ ok: false, message: e instanceof ApiError ? e.message : "Échec du test." });
      }
    }
    if (action === "models") {
      const k = await resolveKey(String(body.api_key ?? ""));
      if (!k) return json({ error: "Aucune clé disponible pour ce fournisseur : saisissez-en une.", code: "NO_KEY" }, 400);
      return json({ models: await listModels(provider, base, k.key), key_source: k.source });
    }
    if (action !== "detect") return json({ error: "Action inconnue." }, 400);

    // ---- Détection ---------------------------------------------------------------------------------
    const model = cut(body.model, 120).trim() || provider.default_model || "";
    if (!model) return json({ error: "Choisissez un modèle (bouton « Charger les modèles »).", code: "NO_MODEL" }, 400);
    const k = await resolveKey(String(body.api_key ?? ""));
    if (!k) return json({ error: `Aucune clé d'API pour ${provider.label} : saisissez-en une, ou demandez à un HRBP de définir la clé par défaut.`, code: "NO_KEY" }, 400);

    // Garde-fou de coût
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from("detection_runs").select("id", { count: "exact", head: true })
      .eq("created_by", uid).gte("created_at", since);
    if ((count ?? 0) >= MAX_RUNS_PER_HOUR) return json({ error: `Limite atteinte : ${MAX_RUNS_PER_HOUR} analyses par heure.`, code: "RATE" }, 429);

    // Sources lues avec les droits de l'utilisateur. Les mails confidentiels ne sont jamais envoyés.
    const { data: evs, error: ee } = await userClient.from("events")
      .select("position,ref,jour,src,de_nom,titre,texte,conf").order("position");
    if (ee) return json({ error: "Lecture des sources impossible : " + ee.message, code: "TABLES" }, 500);
    const all = evs ?? [];
    const usable = all.filter((e) => !e.conf).slice(-MAX_EVENTS);
    const excluded = all.length - all.filter((e) => !e.conf).length;
    if (!usable.length) return json({ error: "Aucune source à analyser.", code: "NO_SOURCES" }, 400);
    const { data: known } = await userClient.from("irritants").select("id,court");

    // Seul le rôle de l'expéditeur est transmis, pas son nom.
    const role = (de: string | null) => (de ? de.split(",").slice(1).join(",").trim() || "expéditeur" : "");
    const corpus = usable.map((e) =>
      `[${e.ref}] ${e.src === "cr" ? "Compte rendu" : "Mail"} · ${e.jour}${e.de_nom ? " · de : " + role(e.de_nom) : ""}\nObjet : ${cut(e.titre, 200)}\n${cut(e.texte, MAX_CHARS)}`
    ).join("\n\n---\n\n");
    const knownTxt = (known ?? []).map((x) => `${x.id} : ${x.court}`).join("\n") || "(aucun)";
    const userMsg = `Irritants déjà connus (pour renseigner existant_id) :\n${knownTxt}\n\nSources à analyser :\n\n${corpus}`;

    const parsed = await callModel(provider, base, k.key, model, userMsg) as { resume?: string; irritants?: Record<string, unknown>[] } | null;
    if (!parsed || !Array.isArray(parsed.irritants)) return json({ error: "Réponse de l'IA inexploitable (essayez un autre modèle).", code: "BAD_RESPONSE" }, 502);

    // Contrôle : on écarte tout irritant dont les sources citées n'existent pas (anti invention).
    const refs = new Set(usable.map((e) => e.ref));
    const knownIds = new Set((known ?? []).map((x) => x.id));
    let rejected = 0;
    const rows = [];
    for (const i of parsed.irritants) {
      const sources = (Array.isArray(i.sources) ? i.sources : []).map(String).filter((s) => refs.has(s));
      if (!sources.length || !i.titre) { rejected++; continue; }
      rows.push({
        titre: cut(i.titre, 400), court: cut(i.court, 80), signal: cut(i.signal, 80), sources: [...new Set(sources)],
        reponse: REPONSES.includes(String(i.reponse)) ? String(i.reponse) : "document",
        proposition: cut(i.proposition, 1200), pourquoi: cut(i.pourquoi, 1200),
        confiance: CONFIANCES.includes(String(i.confiance)) ? String(i.confiance) : "faible",
        existant_id: knownIds.has(String(i.existant_id)) ? String(i.existant_id) : null,
      });
    }

    const { data: run, error: re } = await admin.from("detection_runs")
      .insert({ created_by: uid, model, provider: providerId, nb_events: usable.length, resume: cut(parsed.resume, 800) })
      .select("id").single();
    if (re) return json({ error: "Enregistrement impossible : " + re.message, code: "TABLES" }, 500);
    if (rows.length) {
      const { error: de } = await admin.from("detections").insert(rows.map((r) => ({ ...r, run_id: run.id })));
      if (de) return json({ error: "Enregistrement impossible : " + de.message, code: "TABLES" }, 500);
    }
    return json({ run_id: run.id, nb_sources: usable.length, nb_exclus: excluded, nb_irritants: rows.length, nb_rejetes: rejected,
      provider: provider.label, model, key_source: k.source });
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: "Erreur interne : " + (e instanceof Error ? e.message : String(e)), code: "INTERNE" }, 500);
  }
});
