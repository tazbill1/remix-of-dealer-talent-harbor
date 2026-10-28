# hireme by WerkandMe — handoff notes for Claude Code

Read this first, every session. Architecture rules are in @AGENTS.md (keep it, Lovable adds to it).
The current build status is in @roadmap.md.

## Who you're working with
- **Tom Azbill**, COO of WerkandMe (Go Blue Technology LLC). Not an engineer: a "vibe coder" who
  merges pull requests on GitHub and pastes database changes into Lovable.
- Talk in plain language. Give exact text to paste and exact buttons to click, numbered and short.
  No jargon dumps; say what changed for the user, not which files.
- He decides quickly. When a choice is genuinely his (scope, wording, vendor), ask one question;
  otherwise pick the sensible default and say what you picked.

## What hireme is
Mobile-first, text-message-driven hiring (ATS) for car-dealer groups: careers site + Indeed/Google
feed, 60-second apply, knockout questions, AI texting assistant per store, manager "reply 1/2"
decisions, self-scheduled interviews, offer letters and new-hire paperwork (BoldSign), analytics,
30/60/90 retention. Pilot client: a dealer group with 4 regions and one recruiter. Live at
**https://workwithwerk.com** (Lovable project `9eab5cb5-c3d5-4c9d-8495-a22c19607d90`, repo
`tazbill1/remix-of-dealer-talent-harbor`, branch `main` syncs to Lovable both ways).

## How work gets done (follow this exactly)
1. Pull `main`, make a branch (`feature/...` or `fix/...`).
2. Build. Install deps with `npm install --package-lock=false --legacy-peer-deps`.
3. Before every PR, all three must pass:
   - `npx tsc --noEmit -p .`
   - `npm test` (vitest; add tests for new rules/helpers; pure logic goes in `src/lib/*.ts`)
   - `npm run build` (also regenerates `src/routeTree.gen.ts` for new routes)
4. Open a PR with `gh`, written in plain language (what the user gets, then "Before merging:" steps).
   Tom merges. Don't push straight to `main` and never force-push or rewrite pushed history.
5. After he merges, `git pull` and check what Lovable changed (it commits as gpt-engineer-app[bot]).

### Database changes: migration FIRST, code SECOND (learned the hard way)
- Lovable Cloud owns the database. You can't run SQL; Tom pastes it into Lovable.
- Write the SQL in `docs/<feature>-update.md` and give Tom this, *before* building on it:
  > Please run this migration exactly as written, then confirm <what to check>. Don't change any app code.
  > ```sql ... ```
- Use `if not exists` / `drop ... if exists` so it's safe to run twice.
- Wait for "done". Then `git pull`: Lovable adds `drizzle/migrations/00NN_*.sql` and regenerates
  `src/integrations/supabase/types.ts`. **Build on Lovable's types. Don't hand-add new columns to
  types.ts** — when both sides add them you get duplicate identifiers (it happened 3 times).
- If Lovable syncs types before the migration runs, it *removes* columns your code needs. Check
  `git log -- src/integrations/supabase/types.ts` after any Lovable commit.
- Secrets (server-only tables like `store_calendars`): enable RLS with no policies and
  `revoke all ... from anon, authenticated`.

### Lovable's own edits
Lovable sometimes builds its own version of a feature (it re-did BoldSign; it over-built email).
Review its diffs before relying on them; keep what's better, fix bugs, don't fight it.

## Safety rules
- Never type passwords, API keys or tokens anywhere. Tom adds secrets himself in Lovable.
- Twilio is the **WerkandMe** account, never aKillion.
- **Email is LIVE.** Applicants get real emails. Test with Tom's own addresses.
- Texting is in **practice** mode until Twilio approves the campaign (then Tom adds
  `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`, sets the store number +1 479-802-0607, switches Live).
- All texts go through `queueText`, all emails through `queueEmail` (consent, STOP, hours, unsubscribe).
  Manager texts must carry "hireme by WerkandMe"; first candidate text must have "Reply STOP".
- Confirm with Tom before purchases, sending messages to real people, or anything irreversible.

## Where things live
| Area | Files |
| --- | --- |
| Automatic texts (wording, on/off, timing) + assistant settings | `src/lib/automations.ts`, `src/routes/_authenticated/automations.tsx`, `src/components/assistant-settings.tsx` (stored in `messaging_settings.automations`) |
| AI texting assistant | `src/lib/assistant.server.ts` (open slots, hand-off, pause via `applications.ai_paused_at` / `needs_attention`), take-over actions `src/lib/takeover.functions.ts` |
| Scheduled workflows | `src/lib/workflows/{rules.ts,run.server.ts,replies.server.ts}`, cron at `/api/public/cron/*` |
| Texting / email outbox | `src/lib/messaging/outbox.server.ts`, `src/lib/email/*` |
| Self-scheduling | `src/lib/booking.ts` (time-zone math, slots), `src/lib/booking.functions.ts`, page `src/routes/book.$token.tsx`; store hours on `dealerships.interview_hours/minutes` |
| Calendars | subscribe feed `src/lib/calendar-feed*.ts` + `/api/public/calendar/$token`; busy times from people's iCal links `src/lib/busy-calendar*.ts`, `src/lib/member-calendars.functions.ts` (table `store_calendars`, server-only) |
| Offers & documents (BoldSign) | `src/lib/esign/boldsign.server.ts`, `src/lib/offers*.ts`, `src/lib/documents.functions.ts`, signing links `/api/public/offer/$token`, `/api/public/docs/$token`, webhook `/api/public/boldsign/webhook` |
| Team, invites, access | `src/lib/invites.ts`, `src/lib/team.functions.ts`, `src/routes/_authenticated/team.tsx` |
| Knockout questions | `src/lib/questions.ts`, `src/components/job-questions.tsx` |
| Job share links / QR | `src/lib/share.ts`, `src/components/job-share.tsx` |
| Public site / apply | `src/routes/c.$orgSlug.*`, `src/routes/careers*`, `src/lib/public.functions.ts` |
| Status rules (HR's "when X, move to Y") | `src/lib/status-rules.ts` (matching), `status-rules.server.ts` (cron), `status-rules.functions.ts`, page `src/routes/_authenticated/status-rules.tsx` (stored in `messaging_settings.automations.statusRules`) |
| Background checks (manual tracking) | `src/lib/background-check.ts`, `src/components/background-check-panel.tsx` (columns `applications.background_check_*`) |
| Signed links (offers, docs, booking) | `src/lib/offers-token.server.ts` (`kind|id`-scoped HMAC tokens) |

## Open items (see roadmap.md)
- Live texting (waiting on Twilio). Background checks (partner TBD; client asked for it).
- Interview intelligence (recording/transcripts/AI scorecards), video library.
- One-click Microsoft/Google calendar sign-in (link-based busy times work today).
- Separate Twilio brand per client before their go-live. Bulk email via Resend/SES later.
