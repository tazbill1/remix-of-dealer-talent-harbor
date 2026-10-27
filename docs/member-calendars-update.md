# Calendars per person: database update

Apply this **before** merging the calendars-per-person pull request.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the columns of `store_calendars`
> and its constraints. Don't change any app code.

```sql
-- Calendar links now belong to a team member (a store-wide link still works).
alter table public.store_calendars
  add column if not exists member_id uuid references public.org_members(id) on delete cascade;
alter table public.store_calendars alter column dealership_id drop not null;
alter table public.store_calendars drop constraint if exists store_calendars_owner_check;
alter table public.store_calendars add constraint store_calendars_owner_check
  check (member_id is not null or dealership_id is not null);
create unique index if not exists store_calendars_member_uidx
  on public.store_calendars (member_id) where member_id is not null;
```
