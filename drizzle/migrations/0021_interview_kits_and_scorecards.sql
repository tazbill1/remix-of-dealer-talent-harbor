create table public.interview_kits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  questions jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.interview_kits to authenticated;
grant all on public.interview_kits to service_role;

alter table public.interview_kits enable row level security;

create policy "members read interview kits"
  on public.interview_kits for select to authenticated
  using (public.is_org_member(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));

create policy "hr manages interview kits"
  on public.interview_kits for all to authenticated
  using (public.can_post_jobs(org_id, auth.uid()) or public.is_platform_admin(auth.uid()))
  with check (public.can_post_jobs(org_id, auth.uid()) or public.is_platform_admin(auth.uid()));

alter table public.jobs
  add column if not exists interview_kit_id uuid references public.interview_kits(id) on delete set null;

create table public.interview_scorecards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  kit_id uuid references public.interview_kits(id) on delete set null,
  author_id uuid not null default auth.uid(),
  author_name text,
  answers jsonb not null default '[]'::jsonb,
  notes text,
  recommendation text check (recommendation in ('hire', 'maybe', 'no')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (interview_id, author_id)
);

create index interview_scorecards_application_id_idx on public.interview_scorecards (application_id);

grant select, insert, update, delete on public.interview_scorecards to authenticated;
grant all on public.interview_scorecards to service_role;

alter table public.interview_scorecards enable row level security;

create policy "read scorecards"
  on public.interview_scorecards for select to authenticated
  using (public.is_platform_admin(auth.uid()) or public.can_access_application(application_id, auth.uid()));

create policy "add own scorecard"
  on public.interview_scorecards for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_application(application_id, auth.uid()));

create policy "change own scorecard"
  on public.interview_scorecards for update to authenticated
  using (author_id = auth.uid() and public.can_access_application(application_id, auth.uid()))
  with check (author_id = auth.uid() and public.can_access_application(application_id, auth.uid()));

create policy "delete scorecards"
  on public.interview_scorecards for delete to authenticated
  using (author_id = auth.uid() or public.has_org_role(org_id, auth.uid(), 'group_admin') or public.is_platform_admin(auth.uid()));