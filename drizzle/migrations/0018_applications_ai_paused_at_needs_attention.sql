alter table public.applications
  add column if not exists ai_paused_at timestamptz,
  add column if not exists needs_attention text;