# Knockout questions: database update

Apply this **before** merging the knockout-questions pull request.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the new columns on `jobs` and
> `applications`, and which `jobs` columns the `anon` role can select. Don't change any app code.

```sql
-- Questions on each job (with their private "meets the requirement" rules).
alter table public.jobs
  add column if not exists questions jsonb not null default '[]'::jsonb;

-- The applicant's answers, and whether any requirement wasn't met (for filtering).
alter table public.applications
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists knockout_failed boolean not null default false;

-- Public job pages only need these columns. This also stops hiring-manager and
-- escalation phone numbers (and the private question rules) from being readable
-- by anyone on the internet.
revoke select on public.jobs from anon;
grant select (id, org_id, dealership_id, title, department, description, division,
              employment_type, pay_min, pay_max, pay_period, status, created_at)
  on public.jobs to anon;
```
