# Background-check tracking: database update

Apply this **before** merging the background-check pull request.

Adds three columns to `applications` so HR can track a background check on the candidate
profile (no vendor yet). Existing access rules on `applications` already cover these columns:
people only see and change applications for the stores they can access.

## Prompt to paste into Lovable

> Please add three columns to the `applications` table. Don't change any app code or screens.
> 1. `background_check_status`: text, optional (empty means no check started). Only allow the
>    values `requested`, `in_progress`, `clear` or `flagged` (a check constraint named
>    `applications_background_check_status_check`).
> 2. `background_check_updated_at`: timestamptz, optional.
> 3. `background_check_note`: text, optional.
> No new tables or policies are needed. Show me the three columns when done.

## Same thing as SQL (if Lovable asks for it)

```sql
alter table public.applications
  add column if not exists background_check_status text,
  add column if not exists background_check_updated_at timestamptz,
  add column if not exists background_check_note text;

alter table public.applications
  drop constraint if exists applications_background_check_status_check;
alter table public.applications
  add constraint applications_background_check_status_check
  check (background_check_status is null
    or background_check_status in ('requested', 'in_progress', 'clear', 'flagged'));
```

## What to check
- `applications` has the three new columns, and the status column only accepts the four values.
