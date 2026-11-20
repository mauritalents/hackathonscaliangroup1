-- À exécuter UNE FOIS (SQL Editor) après migration-detection.sql : multi fournisseurs d'IA. Ne supprime aucune donnée.

-- Fournisseurs d'IA, réglages par défaut et clés chiffrées.
create table if not exists public.ai_providers (
  id text primary key, label text not null,
  kind text not null check (kind in ('anthropic','openai')),
  base_url text, default_model text, key_hint text,
  position int not null default 0, enabled boolean not null default true
);
create table if not exists public.ai_settings (
  id int primary key default 1 check (id = 1),
  default_provider text references public.ai_providers(id),
  updated_at timestamptz not null default now()
);
-- Clés : chiffrées (AES-GCM) par la fonction detect-irritants. Aucune règle d'accès : seul le serveur y touche.
create table if not exists public.ai_user_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null references public.ai_providers(id) on delete cascade,
  ciphertext text not null, iv text not null, updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
create table if not exists public.ai_default_keys (
  provider text primary key references public.ai_providers(id) on delete cascade,
  ciphertext text not null, iv text not null,
  updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now()
);
alter table public.detection_runs add column if not exists provider text;

alter table public.ai_providers enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_user_keys enable row level security;
alter table public.ai_default_keys enable row level security;
revoke all on public.ai_user_keys, public.ai_default_keys from anon, authenticated;
drop policy if exists ai_providers_read on public.ai_providers;
create policy ai_providers_read on public.ai_providers for select to authenticated using (public.current_app_role() = 'hrbp');
drop policy if exists ai_settings_read on public.ai_settings;
create policy ai_settings_read on public.ai_settings for select to authenticated using (public.current_app_role() = 'hrbp');

-- Catalogue. Les adresses sont celles des API publiques ; les modèles se choisissent dans le site (bouton « Charger les modèles »).
insert into public.ai_providers (id,label,kind,base_url,default_model,key_hint,position) values
 ('anthropic','Anthropic (Claude)','anthropic','https://api.anthropic.com','claude-sonnet-5-5','sk-ant-...',0),
 ('openai','OpenAI','openai','https://api.openai.com/v1',null,'sk-...',1),
 ('gemini','Google Gemini','openai','https://generativelanguage.googleapis.com/v1beta/openai',null,'AIza...',2),
 ('mistral','Mistral AI','openai','https://api.mistral.ai/v1',null,null,3),
 ('groq','Groq','openai','https://api.groq.com/openai/v1',null,'gsk_...',4),
 ('deepseek','DeepSeek','openai','https://api.deepseek.com',null,'sk-...',5),
 ('xai','xAI (Grok)','openai','https://api.x.ai/v1',null,'xai-...',6),
 ('openrouter','OpenRouter (multi modèles)','openai','https://openrouter.ai/api/v1',null,'sk-or-...',7),
 ('together','Together AI','openai','https://api.together.xyz/v1',null,null,8),
 ('custom','Autre API compatible OpenAI (adresse à saisir)','openai',null,null,null,9)
on conflict (id) do nothing;
insert into public.ai_settings (id, default_provider) values (1, 'anthropic') on conflict (id) do nothing;
