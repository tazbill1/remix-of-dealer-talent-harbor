<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Subdirectories have their own AGENTS.md (e.g. src/lib/AGENTS.md); read it before changing files there.
- Adverse-action tracking uses authenticated HR-authorized RLS actions, database business-day calculation and optimistic saves; no messaging or applicant stage changes. Why: human notice records stay separate from hiring decisions.
- HR consent review uses authenticated RLS reads and can_post_jobs authorization; withdrawals update only revoked_at/revoked_source and verify the returned row. Why: preserve immutable evidence and prevent silent losses.
- Notes explicitly save per applicant and verify a returned row. Why: prevent silent losses.
- Onboarding: checklist auto-created on Hired (trigger), can_access_onboarding RLS, new hires only via token RPCs (no file reads). Why: sensitive docs.
- Calendar links open the applicant Interview tab; summaries use per-interview RLS reads. Why: reuse rules.
- Reports use separate authenticated RLS reads, RPC-verified roles and explicit manager assignments; math is in reports.ts and PDF capture uses semantic blocks. Why: preserve Analytics, deny unassigned managers, avoid chart splits.
- Multi-tenant: every tenant table has `org_id`; RLS uses `is_org_member` / `has_org_role` / `is_platform_admin`. Why: tenant isolation.
- Roles live in `org_members` and `platform_admins`, never on profiles. Why: blocks escalation.
- New groups are created only through the `create_organization` RPC. Why: atomically makes the creator group admin.
- Public applicant writes (apply, status lookup) go through server functions in `src/lib/public.functions.ts` using the admin client after validation. Why: applicants have no login and tables have no anon write policies.
- Resumes live in the private `resumes` bucket at `<org_id>/<application_id>/...`, uploaded via signed upload URLs. Why: storage RLS keys off the first folder.
- Signed-in app pages live under `src/routes/_authenticated/`; the active group comes from `useOrg()`. Why: one gate and one source of tenant context.
- Brand colors are tokens in `src/styles.css` (navy, sapphire, ultramarine, lime, chartreuse); the gradient is only via `text-brand-gradient`. Why: brand rules restrict gradient to text accents.
- Job posting is gated by `can_post_jobs` (group admins, recruiters, platform admin); other members may only insert/edit jobs with status `requested`. Why: client requires Recruiting/HR to own job reqs.
- AI assistant logic lives in src/lib/assistant.server.ts (runAssistant), called by the assistantMessage server function (practice chat) and /api/sms/inbound (real texts). Why: one code path for keywords, AI replies and profile updates.
- All outgoing texts go through queueText in src/lib/messaging/outbox.server.ts (consent, STOP opt-outs, texting window); never insert outbound messages directly. deliverDue sends them (practice = simulated, live = Twilio). Why: compliance rules can't be skipped by any feature.
- Store/region scoping: RLS uses can_access_store / can_access_application (also on stores, regions, jobs and resumes); GMs and hiring managers see only assigned stores (none if unassigned), regional leaders without assignments see the group. Why: store-level staff must never see other stores.
- Group texting configuration uses messaging_settings with RLS-backed browser editing; TextingSettings is embedded only in Integrations, and store contacts remain on Stores, while sms_opt_outs writes are service-role-only. Why: one config place.
- Integrations share IntegrationCard/Badge; canEditIntegrationSettings gates UI only, never replaces RLS. Why: consistency.
- Email uses queueEmail and deliverDue (channel email), via managed sendLovable; sender is messaging_settings.email_from_address. Why: no extra provider; footer and signed unsubscribe are mandatory.
- Scheduled jobs live under /api/public/cron/* (Lovable's scheduler only calls /api/public/ paths) and must call authenticateCronRequest first.
- Automatic applicant emails (confirmation, interview invite, status updates) go through emailApplicant in src/lib/email/applicant.server.ts, wording in applicant-copy.ts; one purpose per event dedupes. Why: one path that never repeats an email or breaks the triggering action.
- The public careers site lives under /careers (layout careers.tsx loads one group via CAREERS_ORG_SLUG in src/lib/site.ts); its contact form (submitContact) adds a New applicant with source own_site. Why: keeps the product homepage at / while one group gets a branded hiring site.
- Signature documents are BoldSign templates built in BoldSign and listed live (src/lib/documents.functions.ts); each send is a row in `offers` (is_offer_letter marks the group's offer template), and BoldSign calls go through the linked connector gateway in src/lib/esign/boldsign.server.ts. Why: documents change often and must not need app changes.

- BoldSign connection, offer-template selection and signing-update setup share `src/components/boldsign-setup.tsx` on Integrations and reuse existing server functions. Why: one setup surface avoids duplicate or conflicting connection states.
- Staff interview emails use emailInterviewStaff in manual/self/assistant bookings, one scoped interviewer, fixed React template, signed expiring ICS download, managed idempotency and audit-only messages. Why: no broadcasts, OAuth, attachments or new queue; ambiguous recipients flag attention.
- Interview kits use can_post_jobs; scorecards are author-owned per interview, with pure rules in interview-kits.ts. Why: scores inform humans, never stages.
- Interview recording is hidden (code/table/bucket kept, setting off). Why: paused, data preserved.
- AI-use disclosure wording, the first-message line and HUMAN detection live in src/lib/ai-notice.ts (pure, tested); apply saves an ai_notice consent row, and HUMAN pauses the assistant and sets needs_attention "Wants a person", which stops automated candidate texts/emails. Why: one source for disclosure wording and opt-to-human handling.
- In-app alerts live in the notifications table (recipient-only reads/mark-read, platform admins read all, service-role inserts); recipient choice and wording are in src/lib/notifications.ts (pure, tested), created by notifications.server.ts; the optional manager email is automations.humanAlert.email (off by default). Why: alerts reach only the right store staff without new messaging paths.
- Manager "Your to-do" on the dashboard uses tested managerTodo in src/lib/manager-todo.ts over authenticated RLS reads (no new table); "Decide" is Screening, the same group the summary/nudge texts cover. Why: app and texts agree, and store access rules scope the list.
- Employee referrals: can_manage_referrals RLS (store staff/regional leaders read assigned stores); public ?ref= via referrer_by_code; one bonus per hire from the create_referral_bonuses trigger (tier locked from jobs.referral_tier_id or suggest_referral_tier, eligibility from referral_settings, ineligible = status not_eligible); due alerts and quarterly drawing entries by referrals.server.ts in workflows cron; winners only via pick_referral_drawing_winner; rules mirrored in src/lib/referrals.ts. Why: every hire path is judged once in the database; no texts or emails.
- Applicant stages keep their original database keys (new, screening, interview, hired, rejected) with client labels/colors/order in src/lib/jobs.ts; added unqualified, other_location, hiring_event, do_not_hire; offer is shown after Interviewing and set when an offer letter is sent. Rejection-type stages need a person's confirm in the UI. Why: every trigger, text rule and report keyed on the old keys keeps working.
- Store videos: store_videos (one Welcome/Thank-you per store or group, store_id null = group), private store-videos bucket <org>/<store|group>/, can_manage_store_videos RLS; fallback rule in src/lib/store-videos.ts (pure, tested). Why: managers own their store's videos, group fills gaps, all off by default.
- Status reminders/talent pool are pure SQL: daily run_status_reminders() notifies or pools (regions reused); pool reads via can_see_pool_region, moves only via claim_pool_candidate/return_to_talent_pool. Why: no messaging path.
