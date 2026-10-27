# 3-business-day escalation

**Status:** code ready. The schedule still has to be set up in Lovable.

A candidate in **New** or **Screening** that nobody has touched for 3 business days
(Mon–Fri, US Central time) is released to the group's open pool: `open_to_other_stores`
is turned on and a note goes on their timeline. "Touched" means any timeline event or
text after they applied. Each candidate escalates once.

- The job lives at `POST /api/cron/escalate` and checks the Lovable cron secret.
- The dashboard lists stalled candidates before the job runs, with a "Release to open
  pool" button for Recruiting/HR.

## Prompt to paste into Lovable

> Please schedule a recurring job that calls `POST /api/cron/escalate` on this app every
> hour from 7am to 7pm US Central time, Monday through Friday, using the app's cron
> secret in the `Authorization: Bearer` header (the route already checks it with
> `authenticateCronRequest`). Don't change the route's code.

## Open question for the client

Who should see candidates in the open pool? Today, Recruiting/HR and group admins see
everyone, and store-scoped managers only see their own stores, even for pooled
candidates. If the client wants every manager in the same region to see pooled
candidates, the access rules need one more change.
