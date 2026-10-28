# Calendar link on invites: database update

Apply this **before** merging the invite calendar pull request.

## Prompt to paste into Lovable

> Please run this migration exactly as written, then confirm `org_invites` has a `calendar_url`
> column. Don't change any app code.

```sql
-- Optional calendar link HR adds when inviting someone; moved to their profile when they
-- accept, then cleared. Only group admins can read invites (existing policy).
alter table public.org_invites add column if not exists calendar_url text;
```
