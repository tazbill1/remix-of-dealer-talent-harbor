# Texting engine

All texting logic lives in hireme. The SMS provider (Twilio, through the aKillion
account later) only carries messages.

## How a text flows

1. Something decides to text (the AI assistant's reply, and next: welcome, manager
   summary, nudges, reminders, check-ins). It calls `queueText`.
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

## Who gets manager texts

The job's hiring manager phone if set, otherwise the store's hiring contact. Escalations
go to the job's escalation contact, otherwise the store's.

## Switching AI to Claude later

Add an `ANTHROPIC_API_KEY` secret in Lovable, then set the group's AI provider to
Anthropic on the Team page. Without the key it keeps using Lovable AI. Optional
`ANTHROPIC_MODEL` secret overrides the model.

## Prompt to paste into Lovable (schedule the delivery job)

> Please schedule a recurring job that calls `POST /api/cron/messages` on this app every
> 5 minutes, every day, using the app's cron secret in the `Authorization: Bearer`
> header (the route already checks it with `authenticateCronRequest`). Don't change the
> route's code.

## Going live (later, once the aKillion Twilio account is ready)

1. Finish carrier registration (A2P 10DLC) for the brand and a "hiring updates" campaign.
2. Add Lovable secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `PUBLIC_APP_URL`
   (the app's public address, e.g. `https://hireme.werkandme.com`, so webhook
   signatures check out).
3. For each store's Twilio number, set "A message comes in" to
   `POST https://<app>/api/sms/inbound`.
4. Enter each store's texting number on the Stores page.
5. Flip the group to **Live** on the Team page. Test with your own phone first.
