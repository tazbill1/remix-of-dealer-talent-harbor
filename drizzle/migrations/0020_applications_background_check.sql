-- Background check tracking on each applicant.
alter table public.applications
  add column if not exists background_check_status text,
  add column if not exists background_check_updated_at timestamptz,
  add column if not exists background_check_note text;

alter table public.applications drop constraint if exists applications_background_check_status_check;

alter table public.applications add constraint applications_background_check_status_check
  check (background_check_status is null or background_check_status in ('requested', 'in_progress', 'clear', 'flagged'));