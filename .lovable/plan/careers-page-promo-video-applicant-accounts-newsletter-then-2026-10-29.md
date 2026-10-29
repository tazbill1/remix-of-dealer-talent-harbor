# Careers page: promo video, applicant accounts, newsletter — then publish

## 1. Dealer promo video
- Settings → Career site gets a "Careers video" section (HR/Recruiters, group admins).
- Two ways to add it: paste a YouTube/Vimeo link (like the example) or upload a video file (MP4/MOV, up to 200 MB).
- Shown on the careers home page in a "Why work with us" block, below the hero. Hidden when none is set.
- Remove / replace buttons. No video is added for ABC until the dealer adds one (I can paste your example link for the demo if you want).

## 2. Applicant accounts on the careers page
- "Sign in" / "Create account" in the careers header. Sign up with email + password or Google.
- Applicants are a separate kind of account: they never see the staff app, and staff menus never appear for them.
- "My applications" page:
  - Current applications with a simple progress line (Applied → Reviewing → Interview → Offer → Hired). Declined-type stages show as "Not moving forward" — internal stage names, notes, scores and Do Not Hire are never shown.
  - Past applications (history).
  - Suggested jobs: open jobs at this group in the same role/department as past applications, excluding ones already applied to.
- Applications are matched to the account by the verified email address, so past applications show up automatically.
- Applying while signed in pre-fills name/email/phone.

## 3. Newsletter signup
- Footer box on every careers page plus a checkbox in "My account": email + "Send me job openings and news from ABC Dealer Group."
- Saved as a signup list per group with consent time and unsubscribe; HR can see/export the list in Settings → Career site.
- No newsletter emails are sent now (no sending feature in this step).

## 4. Publish
- After the build passes and the flows are checked, publish the site.

## Technical details
- Storage: private-by-default `careers-videos` bucket under `<org_id>/...`, public read for the careers page via signed URL from a server function; columns `careers_video_url`, `careers_video_path` on the org careers settings.
- New tables (org_id, RLS, grants): `applicant_accounts` (user_id, org_id), `newsletter_subscribers` (org_id, email, consented_at, unsubscribed_at, source). Anon inserts go through a server function in `public.functions.ts`; HR reads via `can_post_jobs`.
- Applicant data read via an authenticated server function that matches `applications.email` to the caller's verified email within the careers org and returns a sanitized projection (job, store, applied date, public stage bucket). No RLS widening on `applications`.
- Staff gate: `useOrg()` / `_authenticated` already require org membership; applicant users have none, so `/dashboard` redirect logic for signed-in users on `/` must skip non-members.
- Routes: `careers.account.tsx`, `careers.login.tsx`; public stage mapping in pure tested `src/lib/applicant-portal.ts`.
- Tests: stage mapping (declined → hidden wording), suggestion rule, newsletter email validation.
