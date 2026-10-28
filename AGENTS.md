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
- Notes explicitly save per applicant and verify a returned row. Why: prevent silent losses.
- Calendar links open the existing applicant Interview tab; summaries use per-interview RLS reads. Why: reuse the panel and access rules.
- Reports use separate authenticated RLS reads, RPC-verified roles and explicit manager assignments; math is in reports.ts and PDF capture uses semantic blocks. Why: preserve Analytics, deny unassigned managers, avoid chart splits.
- Multi-tenant: every tenant table has `org_id`; RLS uses `is_org_member` / `has_org_role` / `is_platform_admin`. Why: dealer groups' data must never mix.
- Roles live in `org_members` and `platform_admins`, never on profiles. Why: prevents privilege escalation.
- New groups are created only through the `create_organization` RPC. Why: atomically makes the creator group admin.
- Public applicant writes (apply, status lookup) go through server functions in `src/lib/public.functions.ts` using the admin client after validation. Why: applicants have no login and tables have no anon write policies.
- Resumes live in the private `resumes` bucket at `<org_id>/<application_id>/...`, uploaded via signed upload URLs. Why: storage RLS keys off the first folder.
- Signed-in app pages live under `src/routes/_authenticated/`; the active group comes from `useOrg()`. Why: one gate and one source of tenant context.
- Brand colors are tokens in `src/styles.css` (navy, sapphire, ultramarine, lime, chartreuse); the gradient is only via `text-brand-gradient`. Why: brand rules restrict gradient to text accents.
- Job posting is gated by `can_post_jobs` (group admins, recruiters, platform admin); other members may only insert/edit jobs with status `requested`. Why: client requires Recruiting/HR to own job reqs.
- AI assistant logic lives in src/lib/assistant.server.ts (runAssistant), called by the assistantMessage server function (practice chat) and /api/sms/inbound (real texts). Why: one code path for keywords, AI replies and profile updates.
- All outgoing texts go through queueText in src/lib/messaging/outbox.server.ts (consent, STOP opt-outs, texting window); never insert outbound messages directly. deliverDue sends them (practice = simulated, live = Twilio). Why: compliance rules can't be skipped by any feature.
- Store/region scoping: RLS uses can_access_store / can_access_application; a member with no org_member_scopes rows sees the whole group. Why: scoped managers only see their stores without breaking unscoped users.
- Group texting configuration uses messaging_settings with RLS-backed browser editing; TextingSettings is embedded only in Integrations, and store contacts remain on Stores, while sms_opt_outs writes are service-role-only. Why: centralizes sending configuration without changing delivery or security.
- Integrations share IntegrationCard/Badge; canEditIntegrationSettings gates controls, never replaces RLS/server checks. Why: consistent presentation and access.
- Texting workflows (welcome, manager summary/nudge/escalation, reminders, check-ins) live in src/lib/workflows: rules in rules.ts (pure, tested), the scheduled runner in run.server.ts, fixed-meaning manager replies in replies.server.ts.
- Email uses queueEmail and deliverDue (channel email), via managed sendLovable; sender is messaging_settings.email_from_address. Why: no extra provider; footer and signed unsubscribe are mandatory.
- Scheduled jobs live under /api/public/cron/* (Lovable's scheduler only calls /api/public/ paths) and must call authenticateCronRequest first.
- Automatic applicant emails (confirmation, interview invite, status updates) go through emailApplicant in src/lib/email/applicant.server.ts, wording in applicant-copy.ts; one purpose per event dedupes. Why: one path that never repeats an email or breaks the triggering action.
- The public careers site lives under /careers (layout careers.tsx loads one group via CAREERS_ORG_SLUG in src/lib/site.ts); its contact form (submitContact) adds a New applicant with source own_site. Why: keeps the product homepage at / while one group gets a branded hiring site.
- Signature documents are BoldSign templates built in BoldSign and listed live (src/lib/documents.functions.ts); each send is a row in `offers` (is_offer_letter marks the group's offer template), and BoldSign calls go through the linked connector gateway in src/lib/esign/boldsign.server.ts. Why: documents change often and must not need app changes.

- BoldSign connection, offer-template selection and signing-update setup share `src/components/boldsign-setup.tsx` on Integrations and reuse existing server functions. Why: one setup surface avoids duplicate or conflicting connection states.
- Weekly summaries use tested weekly-summary.ts and weekly-summary.server.ts via workflows cron, unique weekly_summaries member/week; automations.weeklySummary settings. Why: staff emails follow practice/opt-out/footer rules without applicant queues.
- Staff interview emails use emailInterviewStaff in manual/self/assistant bookings, one scoped interviewer, fixed React template, signed expiring ICS download, managed idempotency and audit-only messages. Why: no broadcasts, OAuth, attachments or new queue; ambiguous recipients flag attention.
- Status rules use tested status-rules.ts and status-rules.server.ts via workflows cron; settings are automations.statusRules, edited only through saveStatusRules/can_post_jobs. Clocks start on activation unless include-waiting is checked; applicant email is opt-in. Why: no surprise backlog moves or messages.
- Display wording helpers live in src/lib/display.ts (plural, sourceLabel, isTestName; pure, tested). Why: counts, source names and test-applicant hiding must read the same on every page without changing stored values.
- Interview question kits (interview_kits, attached via jobs.interview_kit_id) are edited only by can_post_jobs on the Interview kits page; each interviewer has one interview_scorecards row per interview (author_id = auth.uid(), editable only by its author), and rules live in src/lib/interview-kits.ts. Why: shared questions; scores never move stages.
