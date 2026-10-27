# Interview self-scheduling: database update

Apply this **before** merging the self-scheduling pull request.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then show me the new columns on `dealerships`.
> Don't change any app code.

```sql
-- When each store takes interviews (days 0=Sun..6=Sat, local store time) and how long they are.
alter table public.dealerships
  add column if not exists interview_hours jsonb not null
    default '{"days":[1,2,3,4,5,6],"start":"09:00","end":"17:00"}'::jsonb,
  add column if not exists interview_minutes integer not null default 30;
alter table public.dealerships drop constraint if exists dealerships_interview_minutes_check;
alter table public.dealerships add constraint dealerships_interview_minutes_check
  check (interview_minutes between 10 and 120);
```
