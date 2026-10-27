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
grant select on public.offers to authenticated;
grant all on public.offers to service_role;
create index if not exists offers_application_id_idx on public.offers (application_id);

-- People can see offers for applicants they can see. Changes go through the server only.
alter table public.offers enable row level security;
create policy "scoped read offers" on public.offers for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) and public.can_access_application(application_id, auth.uid()));

-- Which BoldSign template is the group's offer letter.
alter table public.messaging_settings add column if not exists offer_template_id text;