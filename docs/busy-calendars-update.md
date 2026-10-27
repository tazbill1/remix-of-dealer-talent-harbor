# Managers' calendars (busy times): database update

Apply this **before** merging the managers' calendars pull request.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the columns of the new
> `store_calendars` table and confirm that only service_role can read it. Don't change any app code.

```sql
-- Managers' private calendar links, used only on the server to hide busy times from booking.
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

-- The links are secrets: nobody but the server can read them (no policies on purpose).
alter table public.store_calendars enable row level security;
revoke all on public.store_calendars from anon, authenticated;
grant all on public.store_calendars to service_role;
```
