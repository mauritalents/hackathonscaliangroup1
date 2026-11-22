// Edge Function Supabase : gestion des utilisateurs par le HRBP (créer, modifier, supprimer, mot de passe).
// Ces opérations exigent la clé service_role, qui ne doit jamais être dans le site : elle reste ici, côté serveur
// (SUPABASE_SERVICE_ROLE_KEY est fournie automatiquement par Supabase aux fonctions).
// Réservé à un HRBP connecté avec un vrai compte. Les mots de passe ne sont ni journalisés ni stockés par ACIA.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FN_VERSION = 1;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class ApiError extends Error {
  status: number; code: string;
  constructor(message: string, status = 400, code = "ERREUR") { super(message); this.status = status; this.code = code; }
}

const ROLES = ["collab", "manager", "hrbp", "dir"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkPassword(p: unknown): string {
  const s = String(p ?? "");
  if (s.length < 8) throw new ApiError("Le mot de passe doit contenir au moins 8 caractères.", 400, "PASSWORD");
  if (s.length > 72) throw new ApiError("Le mot de passe ne doit pas dépasser 72 caractères.", 400, "PASSWORD");
  return s;
}
function checkRole(r: unknown): string {
  if (!ROLES.includes(String(r))) throw new ApiError("Profil inconnu : collab, manager, hrbp ou dir.", 400, "ROLE_INVALIDE");
  return String(r);
}
function checkEmail(e: unknown): string {
  const s = String(e ?? "").trim().toLowerCase();
  if (!EMAIL.test(s)) throw new ApiError("Adresse e-mail invalide.", 400, "EMAIL");
  return s;
}
function checkId(i: unknown): string {
  const s = String(i ?? "");
  if (!UUID.test(s)) throw new ApiError("Identifiant utilisateur invalide.", 400, "ID");
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "Non authentifié : reconnectez-vous.", code: "AUTH" }, 401);
    const { data: prof } = await userClient.from("profiles").select("role").eq("id", u.user.id).single();
    if (action === "ping") return json({ ok: true, version: FN_VERSION, role: prof?.role ?? null, anonymous: !!u.user.is_anonymous });
    if (u.user.is_anonymous) return json({ error: "Réservé aux comptes réels (pas à la démonstration).", code: "ANON" }, 403);
    if (prof?.role !== "hrbp") return json({ error: "Réservé au HRBP.", code: "ROLE" }, 403);
    const me = u.user.id;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === "create") {
      const email = checkEmail(body.email), password = checkPassword(body.password), role = checkRole(body.role);
      const full_name = String(body.full_name ?? "").trim().slice(0, 120);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
      if (error || !data?.user) throw new ApiError(error?.message ?? "Création impossible.", 400, "CREATE");
      const { error: pe } = await admin.from("profiles").upsert({ id: data.user.id, email, full_name, role });
      if (pe) throw new ApiError("Compte créé mais profil non enregistré : " + pe.message, 500, "PROFIL");
      return json({ ok: true, id: data.user.id });
    }

    if (action === "update") {
      const id = checkId(body.id);
      const patchAuth: Record<string, unknown> = {};
      const patchProf: Record<string, unknown> = {};
      if (body.email !== undefined && body.email !== "") { const e = checkEmail(body.email); patchAuth.email = e; patchAuth.email_confirm = true; patchProf.email = e; }
      if (body.password !== undefined && body.password !== "") patchAuth.password = checkPassword(body.password);
      if (body.full_name !== undefined) { const n = String(body.full_name).trim().slice(0, 120); patchProf.full_name = n; patchAuth.user_metadata = { full_name: n }; }
      if (body.role !== undefined && body.role !== "") {
        const r = checkRole(body.role);
        if (id === me && r !== "hrbp") throw new ApiError("Vous ne pouvez pas retirer votre propre profil HRBP.", 400, "SELF");
        patchProf.role = r;
      }
      if (Object.keys(patchAuth).length) {
        const { error } = await admin.auth.admin.updateUserById(id, patchAuth);
        if (error) throw new ApiError(error.message, 400, "UPDATE");
      }
      if (Object.keys(patchProf).length) {
        const { error } = await admin.from("profiles").update(patchProf).eq("id", id);
        if (error) throw new ApiError(error.message, 500, "PROFIL");
      }
      return json({ ok: true });
    }

    if (action === "delete") {
      const id = checkId(body.id);
      if (id === me) throw new ApiError("Vous ne pouvez pas supprimer votre propre compte.", 400, "SELF");
      const { data: target } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
      if (target?.role === "hrbp") {
        const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "hrbp").not("email", "is", null);
        if ((count ?? 0) <= 1) throw new ApiError("Impossible de supprimer le dernier HRBP.", 400, "DERNIER");
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new ApiError(error.message, 400, "DELETE");
      return json({ ok: true });
    }

    return json({ error: "Action inconnue.", code: "ACTION" }, 400);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message, code: e.code }, e.status);
    console.error("admin-users", (e as Error).message);
    return json({ error: "Erreur interne.", code: "INTERNE" }, 500);
  }
});
