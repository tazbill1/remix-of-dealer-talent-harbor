-- Questions on each job (with their private "meets the requirement" rules).

alter table public.jobs
  add column if not exists questions jsonb not null default '[]'::jsonb;

-- The applicant's answers, and whether any requirement wasn't met.

alter table public.applications
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists knockout_failed boolean not null default false;

-- Public job pages only need these columns. This keeps hiring-manager and
-- escalation phone numbers (and the private question rules) off the public internet.

revoke select on public.jobs from anon;

grant select (id, org_id, dealership_id, title, department, description, division,
              employment_type, pay_min, pay_max, pay_period, status, created_at)
  on public.jobs to anon;