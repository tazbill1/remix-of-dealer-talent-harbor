# Team invites: database update

Apply this **before** merging the team-invites pull request.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the columns and policies on
> `org_invites`. Don't change any app code.

```sql
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null,
  -- Stores and regions the person will cover: [{"dealership_id": "..."} | {"region_id": "..."}]
  scopes jsonb not null default '[]'::jsonb,
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz
);
create index if not exists org_invites_org_idx on public.org_invites (org_id);
-- One open invite per person per group.
create unique index if not exists org_invites_open_email_idx
  on public.org_invites (org_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.org_invites enable row level security;
-- Group admins can see their group's invites. Creating, accepting and cancelling
-- happen on the server only (no insert/update/delete policies on purpose).
create policy "group admins read invites" on public.org_invites
  for select to authenticated
  using (public.has_org_role(org_id, auth.uid(), 'group_admin') or public.is_platform_admin(auth.uid()));
```
