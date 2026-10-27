alter table public.messages
  add column if not exists subject text,
  add column if not exists to_email text,
  add column if not exists from_email text,
  add column if not exists campaign_id uuid;

alter table public.messaging_settings
  add column if not exists email_mode text not null default 'practice' check (email_mode in ('practice','live')),
  add column if not exists email_from_name text,
  add column if not exists email_reply_to text;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('sms','email')),
  subject text,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.message_templates to authenticated;
grant all on public.message_templates to service_role;
create index if not exists message_templates_org_idx on public.message_templates (org_id);
alter table public.message_templates enable row level security;
create policy "members read templates" on public.message_templates for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "hr manages templates" on public.message_templates for all to authenticated
  using (public.can_post_jobs(org_id, auth.uid())) with check (public.can_post_jobs(org_id, auth.uid()));

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid,
  template_id uuid references public.message_templates(id) on delete set null,
  subject text not null,
  body text not null,
  recipient_count int not null default 0,
  queued_count int not null default 0,
  skipped_count int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.email_campaigns to authenticated;
grant all on public.email_campaigns to service_role;
create index if not exists email_campaigns_org_idx on public.email_campaigns (org_id, created_at desc);
alter table public.email_campaigns enable row level security;
create policy "members read campaigns" on public.email_campaigns for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));

create table if not exists public.email_opt_outs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  source text,
  opted_out_at timestamptz not null default now(),
  unique (org_id, email)
);
grant select on public.email_opt_outs to authenticated;
grant all on public.email_opt_outs to service_role;
alter table public.email_opt_outs enable row level security;
create policy "members read email opt-outs" on public.email_opt_outs for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));