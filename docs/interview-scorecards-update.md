# Interview question kits and scorecards: database update

Apply this **before** merging the interview scorecards pull request.

Adds question kits (a set of interview questions HR writes once per role and attaches to jobs)
and scorecards (one per interviewer per interview: a 1 to 5 score and a note for each question,
plus an overall hire / maybe / no). Nothing is recorded; this is step 1 of interview intelligence.

Who can do what:
- Kits: everyone in the group can read them; only Recruiting/HR (`can_post_jobs`) can add, change
  or delete them.
- Scorecards: anyone who can see the application can read its scorecards and add their own.
  Only the person who wrote a scorecard can change it; they or a group admin can delete it.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the new `interview_kits` and
> `interview_scorecards` tables and the new `interview_kit_id` column on `jobs`.
> Don't change any app code or screens.
>
> (paste the SQL below)

## SQL

```sql
-- 1. Question kits
create table if not exists public.interview_kits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  questions jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interview_kits_org_idx on public.interview_kits (org_id);

alter table public.interview_kits enable row level security;
revoke all on public.interview_kits from anon;
grant select, insert, update, delete on public.interview_kits to authenticated;
grant all on public.interview_kits to service_role;

drop policy if exists "members read kits" on public.interview_kits;
create policy "members read kits" on public.interview_kits for select to authenticated
  using (public.is_platform_admin(auth.uid()) or public.is_org_member(org_id, auth.uid()));

drop policy if exists "hr manage kits" on public.interview_kits;
create policy "hr manage kits" on public.interview_kits for all to authenticated
  using (public.is_platform_admin(auth.uid()) or public.can_post_jobs(org_id, auth.uid()))
  with check (public.is_platform_admin(auth.uid()) or public.can_post_jobs(org_id, auth.uid()));

-- 2. Which kit a job uses (empty = no kit)
alter table public.jobs
  add column if not exists interview_kit_id uuid
  references public.interview_kits(id) on delete set null;

-- 3. Scorecards
create table if not exists public.interview_scorecards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  kit_id uuid references public.interview_kits(id) on delete set null,
  author_id uuid not null default auth.uid(),
  author_name text,
  answers jsonb not null default '[]'::jsonb,
  recommendation text,
  notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interview_scorecards
  drop constraint if exists interview_scorecards_recommendation_check;
alter table public.interview_scorecards
  add constraint interview_scorecards_recommendation_check
  check (recommendation is null or recommendation in ('hire', 'maybe', 'no'));

create unique index if not exists interview_scorecards_interview_author_key
  on public.interview_scorecards (interview_id, author_id);
create index if not exists interview_scorecards_application_idx
  on public.interview_scorecards (application_id);

alter table public.interview_scorecards enable row level security;
revoke all on public.interview_scorecards from anon;
grant select, insert, update, delete on public.interview_scorecards to authenticated;
grant all on public.interview_scorecards to service_role;

drop policy if exists "scoped read scorecards" on public.interview_scorecards;
create policy "scoped read scorecards" on public.interview_scorecards for select to authenticated
  using (public.is_platform_admin(auth.uid())
    or (public.is_org_member(org_id, auth.uid()) and public.can_access_application(application_id, auth.uid())));

drop policy if exists "scoped add own scorecard" on public.interview_scorecards;
create policy "scoped add own scorecard" on public.interview_scorecards for insert to authenticated
  with check (author_id = auth.uid()
    and public.is_org_member(org_id, auth.uid())
    and public.can_access_application(application_id, auth.uid()));

drop policy if exists "authors update scorecard" on public.interview_scorecards;
create policy "authors update scorecard" on public.interview_scorecards for update to authenticated
  using (author_id = auth.uid() and public.can_access_application(application_id, auth.uid()))
  with check (author_id = auth.uid() and public.can_access_application(application_id, auth.uid()));

drop policy if exists "authors or admins delete scorecard" on public.interview_scorecards;
create policy "authors or admins delete scorecard" on public.interview_scorecards for delete to authenticated
  using (author_id = auth.uid()
    or public.has_org_role(org_id, auth.uid(), 'group_admin')
    or public.is_platform_admin(auth.uid()));
```

## What to check
- `interview_kits` and `interview_scorecards` exist with row-level security on.
- `jobs` has an empty `interview_kit_id` column.
- A scorecard's `recommendation` only accepts `hire`, `maybe` or `no`.
