# Interview recording, transcripts and AI summaries: database update

Apply this **before** merging the interview recording pull request.

Adds one table, `interview_recordings`, and one private storage bucket, `interview-recordings`.
Recording stays **off** until a group admin turns it on (the on/off switch and retention days live
in the existing `messaging_settings.automations`, so they need no database change).

Who can do what:
- Anyone who can see the applicant can read that applicant's recordings (status, transcript, AI
  summary). Listening to the audio goes through a short-lived signed link from the server.
- Nobody writes to the table or the bucket from the browser. Every write goes through server
  functions that check recording is on, the person can see the applicant, and consent was logged.

## Prompt to paste into Lovable

```
Please make these database changes exactly as described. Don't change any app code or screens.

1. New table interview_recordings (one row per interview recording):
   - id (uuid, primary key, auto)
   - org_id (uuid, required, links to organizations, delete with org)
   - interview_id (uuid, required, links to interviews, delete with interview)
   - application_id (uuid, required, links to applications, delete with application)
   - recorded_by (uuid, optional), recorded_by_name (text, optional)
   - consent_at (timestamptz, required), consent_people (text, required: names of everyone present who agreed)
   - storage_path (text, optional), mime_type (text, optional), duration_sec (integer, optional)
   - status (text, required, default 'uploading'; only allow 'uploading', 'transcribing', 'summarizing', 'ready', 'failed')
   - provider_job_id (text, optional), error (text, optional)
   - transcript (jsonb, optional), summary (jsonb, optional)
   - delete_audio_after (timestamptz, optional), audio_deleted_at (timestamptz, optional)
   - created_at and updated_at (timestamptz, default now)
   - Index on application_id, and on status.
   - Turn on row-level security. Revoke all access from anon.
   - Grant select only to authenticated (no insert, update or delete from the browser); grant all to service_role.
   - One read policy: platform admins, or group members who pass can_access_application for that application.

2. New private storage bucket named interview-recordings (not public). Add no storage policies for it:
   only the server (service role) reads and writes files there.

When done, show me the new table, its policy, and the bucket.
```

## Same thing as SQL (if Lovable asks for it)

```sql
create table if not exists public.interview_recordings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  recorded_by uuid,
  recorded_by_name text,
  consent_at timestamptz not null,
  consent_people text not null,
  storage_path text,
  mime_type text,
  duration_sec integer,
  status text not null default 'uploading',
  provider_job_id text,
  error text,
  transcript jsonb,
  summary jsonb,
  delete_audio_after timestamptz,
  audio_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interview_recordings drop constraint if exists interview_recordings_status_check;
alter table public.interview_recordings add constraint interview_recordings_status_check
  check (status in ('uploading', 'transcribing', 'summarizing', 'ready', 'failed'));

create index if not exists interview_recordings_application_idx on public.interview_recordings (application_id);
create index if not exists interview_recordings_status_idx on public.interview_recordings (status);

alter table public.interview_recordings enable row level security;
revoke all on public.interview_recordings from anon;
revoke insert, update, delete on public.interview_recordings from authenticated;
grant select on public.interview_recordings to authenticated;
grant all on public.interview_recordings to service_role;

drop policy if exists "scoped read recordings" on public.interview_recordings;
create policy "scoped read recordings" on public.interview_recordings for select to authenticated
  using (public.is_platform_admin(auth.uid())
    or (public.is_org_member(org_id, auth.uid()) and public.can_access_application(application_id, auth.uid())));

insert into storage.buckets (id, name, public)
values ('interview-recordings', 'interview-recordings', false)
on conflict (id) do nothing;
```

## What to check
- `interview_recordings` exists with row-level security on and one read policy.
- Bucket `interview-recordings` exists and is **not** public.
