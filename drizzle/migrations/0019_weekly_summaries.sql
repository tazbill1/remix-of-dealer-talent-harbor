create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.org_members(id) on delete cascade,
  week_of date not null,
  to_email text,
  subject text,
  body text,
  status text not null default 'queued',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.weekly_summaries
  add constraint weekly_summaries_member_week_key unique (member_id, week_of);

create index if not exists weekly_summaries_org_week_idx on public.weekly_summaries (org_id, week_of);

alter table public.weekly_summaries enable row level security;

grant select on public.weekly_summaries to authenticated;
grant all on public.weekly_summaries to service_role;
revoke insert, update, delete on public.weekly_summaries from anon, authenticated;
revoke all on public.weekly_summaries from anon;

create policy "read weekly summaries"
  on public.weekly_summaries
  for select
  to authenticated
  using (
    public.has_org_role(org_id, auth.uid(), 'group_admin')
    or public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.org_members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );