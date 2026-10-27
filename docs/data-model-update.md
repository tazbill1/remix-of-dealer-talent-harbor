# Data model update: candidates, regions, retention, consent

**Status:** proposed. Nothing in this file has been applied to the database yet.

The database lives in Lovable Cloud, so these changes should be made **through Lovable**
(it writes the migration and regenerates `src/integrations/supabase/types.ts`). The SQL
below is the reference version for review by the tech partner. Every change is additive:
no existing column is removed or renamed, so the current app keeps working.

## Why

| Client requirement | What's missing today |
| --- | --- |
| One candidate, many applications; shared communication history; enterprise reporting; merging duplicates from 38 AutomotoHR instances | Name, email and phone live on each `applications` row, so a person who applies twice exists twice |
| 4 geographic regions; transfers and talent pool searches stay in-region; regional leaders | Stores only have `city` / `state` |
| Role-based access for corporate recruiters, regional leaders, GMs, hiring managers | No regional role; per-store access isn't enforced yet |
| 30/60/90-day retention by location and enterprise | No hire, start or departure dates |
| Communication preferences and opt-outs (TCPA, CAN-SPAM) | No consent fields |
| Manager response time | `application_events` doesn't record who acted |

## Prompt to paste into Lovable

> Please make these database changes. Keep everything additive: don't remove or rename
> existing columns, and keep the current RLS pattern (`is_org_member`, `has_org_role`,
> `is_platform_admin`, every tenant table has `org_id`).
>
> 1. **Regions.** Add a `regions` table (`id`, `org_id`, `name`, `created_at`) and a nullable
>    `region_id` on `dealerships`. Group members can read regions; group admins and
>    recruiters can create, edit and delete them. On the Stores page, let HR create regions
>    and assign each store to one.
> 2. **Regional leader role.** Add `regional_leader` to the `org_role` enum. Add an
>    `org_member_scopes` table (`id`, `org_id`, `member_id` referencing `org_members`,
>    `region_id` nullable, `dealership_id` nullable) that records which regions or stores a
>    regional leader, GM or hiring manager covers. Don't change the existing RLS policies
>    for access yet; we'll enforce store and region scoping in a separate, reviewed step.
> 3. **Candidates.** Add a `candidates` table (`id`, `org_id`, `full_name`, `email`, `phone`,
>    `city`, `created_at`, `updated_at`) with indexes on `(org_id, lower(email))` and
>    `(org_id, phone)` for finding duplicates. Add a nullable `candidate_id` to
>    `applications`. Backfill: create one candidate per distinct email per group and link
>    every existing application to it. Update the public apply server function so a new
>    application finds an existing candidate by email or phone in the same group, or
>    creates one.
> 4. **Consent.** On `candidates`, add `sms_opt_in` (boolean, default false),
>    `sms_opt_in_at`, `sms_opted_out_at`, `email_opted_out_at` (timestamps) and
>    `consent_source` (text). The apply form should capture SMS consent with a clear
>    checkbox and record when and where it was given.
> 5. **Retention.** On `applications`, add `hired_at` (timestamp), `start_date` (date),
>    `departed_at` (date) and `departure_reason` (text). Set `hired_at` when an application
>    moves to Hired. Add a `retention_checkins` table (`id`, `org_id`, `application_id`,
>    `day_mark` 30/60/90, `due_on`, `sent_at`, `still_employed` boolean, `response`,
>    `responded_at`). Recruiters can mark a hire as departed from the applicant profile.
> 6. **Who acted.** Add a nullable `actor_id uuid default auth.uid()` to
>    `application_events`.

## Reference SQL

Run as separate migrations. `ALTER TYPE ... ADD VALUE` can't be used in the same
transaction that uses the new value.

```sql
-- 1. Regions
create table public.regions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
alter table public.regions enable row level security;
create policy "members read regions" on public.regions for select
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "hr manages regions" on public.regions for all
  using (public.can_post_jobs(org_id, auth.uid()))
  with check (public.can_post_jobs(org_id, auth.uid()));
alter table public.dealerships add column region_id uuid references public.regions(id) on delete set null;
create index on public.dealerships (region_id);

-- 2a. Regional leader role (own migration)
alter type public.org_role add value if not exists 'regional_leader';

-- 2b. Scopes: which regions or stores a member covers
create table public.org_member_scopes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.org_members(id) on delete cascade,
  region_id uuid references public.regions(id) on delete cascade,
  dealership_id uuid references public.dealerships(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (region_id is not null or dealership_id is not null)
);
alter table public.org_member_scopes enable row level security;
create policy "members read scopes" on public.org_member_scopes for select
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "admins manage scopes" on public.org_member_scopes for all
  using (public.has_org_role(org_id, 'group_admin', auth.uid()) or public.is_platform_admin(auth.uid()))
  with check (public.has_org_role(org_id, 'group_admin', auth.uid()) or public.is_platform_admin(auth.uid()));

-- 3 + 4. Candidates with consent
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  city text,
  sms_opt_in boolean not null default false,
  sms_opt_in_at timestamptz,
  sms_opted_out_at timestamptz,
  email_opted_out_at timestamptz,
  consent_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.candidates (org_id, lower(email));
create index on public.candidates (org_id, phone);
alter table public.candidates enable row level security;
create policy "members read candidates" on public.candidates for select
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "members update candidates" on public.candidates for update
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "members insert candidates" on public.candidates for insert
  with check (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));
-- Public applicants are written by the server function with the admin client, as today.

alter table public.applications add column candidate_id uuid references public.candidates(id) on delete set null;
create index on public.applications (candidate_id);

-- Backfill step 1: one candidate per distinct email per group (earliest application wins)
insert into public.candidates (org_id, full_name, email, phone, consent_source, created_at)
select distinct on (org_id, lower(email)) org_id, full_name, email, phone, 'backfill', created_at
from public.applications
where coalesce(trim(email), '') <> ''
order by org_id, lower(email), created_at;

update public.applications a set candidate_id = c.id
from public.candidates c
where c.org_id = a.org_id and lower(c.email) = lower(a.email) and a.candidate_id is null;

-- Backfill step 2: any application without an email gets its own candidate
do $$
declare r record; cid uuid;
begin
  for r in select id, org_id, full_name, phone, created_at from public.applications where candidate_id is null loop
    insert into public.candidates (org_id, full_name, phone, consent_source, created_at)
    values (r.org_id, r.full_name, r.phone, 'backfill', r.created_at) returning id into cid;
    update public.applications set candidate_id = cid where id = r.id;
  end loop;
end $$;

-- 5. Retention
alter table public.applications
  add column hired_at timestamptz,
  add column start_date date,
  add column departed_at date,
  add column departure_reason text;

create table public.retention_checkins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  day_mark int not null check (day_mark in (30, 60, 90)),
  due_on date not null,
  sent_at timestamptz,
  still_employed boolean,
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (application_id, day_mark)
);
alter table public.retention_checkins enable row level security;
create policy "members use checkins" on public.retention_checkins for all
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()))
  with check (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- 6. Who acted
alter table public.application_events add column actor_id uuid default auth.uid();
```

## Code follow-ups after the migration

- Analytics: switch retention from the placeholder to `hired_at`, `start_date`, `departed_at`
  and check-ins (30/60/90 by location and enterprise), and add a region filter.
- Applicants: show all of a candidate's applications and one shared message history; region
  filter; keep transfers in-region by default.
- Apply flow: SMS consent checkbox; candidate find-or-create.
- Access: enforce store and region scoping in RLS for hiring managers, GMs and regional
  leaders. Review this step with the tech partner before real candidate data goes in.
