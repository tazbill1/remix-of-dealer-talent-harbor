# Texting engine

All texting logic lives in hireme. The SMS provider (Twilio, through the aKillion
account later) only carries messages.

## How a text flows

1. Something decides to text (the AI assistant's reply or one of the workflows below).
   It calls `queueText`.
2. `queueText` checks, in order: a valid mobile number; the number hasn't replied STOP
   (opt-outs are per dealer group); a candidate agreed to texts on the apply form; the
   texting window (default 8am–6pm, Monday–Saturday, in the store's time zone). Texts
   outside the window are held until it opens. Blocked texts are saved with the reason.
3. `deliverDue` sends what's due. **Practice mode** marks texts "Practice · not sent"
   and never contacts a provider. **Live mode** sends through Twilio and records the
   message id; delivery receipts update it to Delivered or Failed.
4. Replies come in at `/api/sms/inbound`. STOP / START / HELP are handled before the AI
   sees anything. Other replies go to the same assistant logic as practice chat.

Every text, in and out, shows on the candidate's profile with its status.

## Workflows (src/lib/workflows)

| When | Who | What |
| --- | --- | --- |
| Someone applies on the careers page | Candidate | Welcome text and the first screening question (only if they ticked the texting box) |
| Candidate reaches Screening | Hiring manager | Short summary and fit rating: "Reply 1 to interview, 2 to pass" |
| No reply after 4 texting hours (setting) | Hiring manager | One reminder |
| No reply after 24 texting hours (setting) | Escalation contact | "Dana hasn't answered about Marcus…" with the same 1/2 options |
| Manager replies 1 | Candidate + manager | Candidate moves to Interview and is asked for times; manager gets a confirmation |
| Manager replies 2 | Candidate + manager | Candidate moves to Not selected and gets a polite note; manager gets a confirmation |
| Day before an interview | Candidate | Reminder with the store address |
| 2 hours before | Candidate + manager | Reminder |
| 30, 60 and 90 days after the start date | Hiring manager | "Is Marcus still on your team? Reply Y or N." A N records the departure for retention reports |

"Texting hours" means only time inside the texting window counts, so a summary sent at
5pm doesn't trigger a nudge at 9pm. The nudge and escalation stop as soon as the manager
replies or the candidate is moved in the app. 1/2 and Y/N are handled by fixed rules; any
other reply goes to the AI. Check-ins more than a week overdue are skipped, so turning
this on doesn't text managers about old hires. Each step runs once; the job is safe to
run as often as you like.

## Who gets manager texts

The job's hiring manager phone if set, otherwise the store's hiring contact. Escalations
go to the job's escalation contact, otherwise the store's.

## Switching AI to Claude later

Add an `ANTHROPIC_API_KEY` secret in Lovable, then set the group's AI provider to
Anthropic on the Team page. Without the key it keeps using Lovable AI. Optional
`ANTHROPIC_MODEL` secret overrides the model.

## Prompt to paste into Lovable (schedule the jobs)

> Please schedule two recurring jobs on this app, each every 5 minutes, every day:
> `POST /api/public/cron/workflows` and `POST /api/public/cron/messages`. Use the app's cron secret in
> the `Authorization: Bearer` header (both routes already check it with
> `authenticateCronRequest`). Don't change the routes' code.

## Going live (later, once the aKillion Twilio account is ready)

1. Finish carrier registration (A2P 10DLC) for the brand and a "hiring updates" campaign.
2. Add Lovable secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `PUBLIC_APP_URL`
   (the app's public address, e.g. `https://hireme.werkandme.com`, so webhook
   signatures check out).
3. For each store's Twilio number, set "A message comes in" to
   `POST https://<app>/api/sms/inbound`.
4. Enter each store's texting number on the Stores page.
5. Flip the group to **Live** on the Team page. Test with your own phone first.
