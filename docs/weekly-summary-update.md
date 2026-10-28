# Weekly HR summary: database update

Apply this **before** merging the weekly-summary pull request.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the columns and policies on
> `weekly_summaries`. Don't change any app code.

```sql
-- One row per person per week: the summary email we sent (or tried to send).
-- The unique key stops anyone getting the same week's summary twice.
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
  created_at timestamptz not null default now(),
  unique (member_id, week_of)
);
create index if not exists weekly_summaries_org_idx on public.weekly_summaries (org_id, week_of);

alter table public.weekly_summaries enable row level security;
-- Group admins see their group's summaries; everyone sees their own.
-- Sending happens on the server only (no insert/update/delete policies on purpose).
drop policy if exists "read weekly summaries" on public.weekly_summaries;
create policy "read weekly summaries" on public.weekly_summaries
  for select to authenticated
  using (
    public.has_org_role(org_id, auth.uid(), 'group_admin')
    or public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.org_members m
      where m.id = weekly_summaries.member_id and m.user_id = auth.uid()
    )
  );
revoke insert, update, delete on public.weekly_summaries from anon, authenticated;
revoke all on public.weekly_summaries from anon;
```

## What to check
- `weekly_summaries` exists with the columns above.
- It has exactly one policy, "read weekly summaries", for select.

The on/off switch, send day and time are saved in the existing Automatic texts settings,
so no other database change is needed.
