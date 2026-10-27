create table if not exists public.store_calendars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  dealership_id uuid not null references public.dealerships(id) on delete cascade,
  label text not null,
  ics_url text not null,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists store_calendars_dealership_idx on public.store_calendars (dealership_id);

alter table public.store_calendars enable row level security;

revoke all on public.store_calendars from anon, authenticated;

grant all on public.store_calendars to service_role;