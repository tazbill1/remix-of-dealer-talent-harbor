alter table public.messaging_settings
  add column if not exists automations jsonb not null default '{}'::jsonb;