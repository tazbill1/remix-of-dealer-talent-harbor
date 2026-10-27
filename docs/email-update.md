# Email, templates and integrations: database update

Apply this **before** merging the email pull request (the new code reads these columns).

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the policies on
> `message_templates`, `email_campaigns` and `email_opt_outs`, and the new columns on
> `messages` and `messaging_settings`. Don't change any app code.

```sql
-- 1. Emails live in the same messages table as texts (channel = 'email').
alter table public.messages
  add column if not exists subject text,
  add column if not exists to_email text,
  add column if not exists from_email text,
  add column if not exists campaign_id uuid;

-- 2. Email settings per dealer group (practice until a provider is connected).
alter table public.messaging_settings
  add column if not exists email_mode text not null default 'practice'
    check (email_mode in ('practice', 'live')),
  add column if not exists email_from_name text,
  add column if not exists email_reply_to text;

-- 3. Enterprise templates (texts and emails), managed by Recruiting/HR.
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('sms', 'email')),
  subject text,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_templates_org_idx on public.message_templates (org_id);
alter table public.message_templates enable row level security;
create policy "members read templates" on public.message_templates
  for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "hr manages templates" on public.message_templates
  for all to authenticated
  using (public.can_post_jobs(org_id, auth.uid()))
  with check (public.can_post_jobs(org_id, auth.uid()));

-- 4. One row per bulk send. Written by the server only.
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
create index if not exists email_campaigns_org_idx on public.email_campaigns (org_id, created_at desc);
alter table public.email_campaigns enable row level security;
create policy "members read campaigns" on public.email_campaigns
  for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- 5. Unsubscribes, per dealer group. Written by the server only (unsubscribe link).
create table if not exists public.email_opt_outs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  source text,
  opted_out_at timestamptz not null default now(),
  unique (org_id, email)
);
alter table public.email_opt_outs enable row level security;
create policy "members read email opt-outs" on public.email_opt_outs
  for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));
```

No insert/update/delete policies on `email_campaigns` and `email_opt_outs` is deliberate:
only the server (service role) writes them.

## Secrets (later, when going live)

- `RESEND_API_KEY`: from resend.com after verifying the sending domain
- `EMAIL_FROM`: the address emails come from, e.g. `hiring@mail.werkandme.com`
- `PUBLIC_APP_URL`: the app's public address (already used for texting)

Until then every email runs in practice mode: logged on the profile as
"Practice · not sent", nothing leaves the app.
