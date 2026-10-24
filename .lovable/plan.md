# Open and edit posted jobs

## What you'll get
- Click any job in the Jobs list to open it.
- The job opens showing exactly how applicants see it: title, store, pay, type and the full description.
- An **Edit** button switches to the same form used for posting (title, department, type, pay, description). You can also re-record by voice to rewrite the description.
- **Save changes** updates the job right away on your careers site and job-site feed.
- A **View live page** link opens the public job page in a new tab.
- Close/Reopen stays available inside the job view as well as in the list.

## Technical details
- Pull the posting form and preview out of `src/routes/_authenticated/jobs.tsx` into a shared `JobForm` + `JobPreview` component so both "Post a job" and "Edit job" reuse them.
- New job detail dialog: opened by clicking a row; view mode renders `JobPreview`, edit mode renders `JobForm` (store picker hidden, since an existing job belongs to one store) with `VoiceJobWriter` on top.
- Save does `supabase.from("jobs").update({...}).eq("id", id)` (existing RLS covers group members), then invalidates the jobs query.
- Live link: `/c/{orgSlug}/jobs/{jobId}`.
