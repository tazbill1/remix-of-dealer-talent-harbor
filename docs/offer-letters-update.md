# Offer letters and new-hire paperwork (BoldSign): database update

Apply this **before** merging the offer letters pull request.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the columns of the new `offers`
> table and confirm `messaging_settings` has `offer_template_id` and `onboarding_templates`. Don't change any app code.

```sql
-- One row per offer letter sent through BoldSign.
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  status text not null default 'sent'
    check (status in ('sent','viewed','signed','declined','revoked','expired','failed')),
  provider text not null default 'boldsign',
  provider_document_id text unique,
  job_title text not null,
  pay text,
  start_date date,
  note text,
  error text,
  sent_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists offers_application_id_idx on public.offers (application_id);

-- People can see offers for applicants they can see. Changes go through the server only.
alter table public.offers enable row level security;
drop policy if exists "scoped read offers" on public.offers;
create policy "scoped read offers" on public.offers for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) and public.can_access_application(application_id, auth.uid()));

-- Offer letters and new-hire paperwork share this table.
alter table public.offers add column if not exists kind text not null default 'offer';
alter table public.offers drop constraint if exists offers_kind_check;
alter table public.offers add constraint offers_kind_check check (kind in ('offer','onboarding'));
alter table public.offers add column if not exists documents text[];

-- Which BoldSign templates are the group's offer letter and new-hire forms.
alter table public.messaging_settings add column if not exists offer_template_id text;
alter table public.messaging_settings add column if not exists onboarding_templates jsonb not null default '[]'::jsonb;
```

## Secrets (you add these in Lovable yourself)

- `BOLDSIGN_API_KEY`: BoldSign > Settings > API > API Key.
- `BOLDSIGN_WEBHOOK_SECRET`: BoldSign > API > Webhooks, after adding
  `https://workwithwerk.com/api/public/boldsign/webhook`, reveal the signing secret.
