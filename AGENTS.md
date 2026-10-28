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
- Integrations use shared IntegrationCard and IntegrationBadge presentation; canEditIntegrationSettings gates HR/admin controls while existing RLS and server checks remain authoritative. Why: consistent demo presentation never replaces access enforcement.
- Texting workflows (welcome, manager summary/nudge/escalation, reminders, check-ins) live in src/lib/workflows: rules in rules.ts (pure, tested), the scheduled runner in run.server.ts, fixed-meaning manager replies in replies.server.ts.
- Emails go through queueEmail (src/lib/email/outbox.server.ts) and are delivered by the same deliverDue job as texts (channel 'email'), over Lovable's managed delivery (sendLovable in src/lib/email/provider.server.ts) rather than a third-party provider, because it needs no extra account and works with the group's own domain; the sending address lives in messaging_settings.email_from_address. Never send email directly; every email needs the footer and signed unsubscribe link queueEmail adds.
- Scheduled jobs live under /api/public/cron/* (Lovable's scheduler only calls /api/public/ paths) and must call authenticateCronRequest first.
- Automatic applicant emails (confirmation, interview invite, status updates) go through emailApplicant in src/lib/email/applicant.server.ts, wording in applicant-copy.ts; one purpose per event dedupes. Why: one path that never repeats an email or breaks the triggering action.
- The public careers site lives under /careers (layout careers.tsx loads one group via CAREERS_ORG_SLUG in src/lib/site.ts); its contact form (submitContact) adds a New applicant with source own_site. Why: keeps the product homepage at / while one group gets a branded hiring site.
- Signature documents are BoldSign templates built in BoldSign and listed live (src/lib/documents.functions.ts); each send is a row in `offers` (is_offer_letter marks the group's offer template), and BoldSign calls go through the linked connector gateway in src/lib/esign/boldsign.server.ts. Why: documents change often and must not need app changes.

- BoldSign connection, offer-template selection and signing-update setup share `src/components/boldsign-setup.tsx` on Integrations and reuse existing server functions. Why: one setup surface avoids duplicate or conflicting connection states.
- The weekly HR summary email lives in src/lib/weekly-summary.ts (pure numbers/wording, tested) and weekly-summary.server.ts (sending, run from /api/public/cron/workflows); each send is a weekly_summaries row unique per member and week, settings in messaging_settings.automations.weeklySummary. Why: staff emails aren't tied to an application, so they can't use queueEmail, but follow its practice/opt-out/footer rules.
- HR-defined status rules ("no reply in 5 days → Not selected") live in src/lib/status-rules.ts (pure, tested) and status-rules.server.ts (run from /api/public/cron/workflows), saved in messaging_settings.automations.statusRules and edited only on the Status rules page (saveStatusRules; can_post_jobs). A rule's clock starts when it's turned on unless "include applicants already waiting" is ticked, and it emails the applicant only when that box is ticked. Why: HR owns stage rules, and turning one on must never move a backlog or message people by surprise.
