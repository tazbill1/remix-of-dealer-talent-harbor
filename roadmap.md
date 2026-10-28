# WerkandMe Hiring roadmap

## Done (phase 1 foundation)
- [x] Multi-group accounts, private data per group, WerkandMe Admin console
- [x] Stores, jobs (post to many stores), public careers site per group
- [x] Indeed-format job feed + Google Jobs markup, source tagging
- [x] 60-second apply with resume, applicant status page
- [x] Drag-and-drop pipeline, profile, ratings, notes, timeline, "open to other stores"

## Done (Track 1)
- [x] Req fields: Fixed Ops/Variable, replacement/growth, hiring manager, target start
- [x] Only Recruiting/HR posts; others submit requests HR approves
- [x] Enterprise job bank
- [x] Store-to-store transfer, bulk stage update, bulk email

## Done (Assistant + intake)
- [x] Drag-and-drop resume upload with AI auto-fill (PDF, Word, image)
- [x] Per-store assistant texting threads (candidate + hiring manager) that auto-update profile, rating, stage, and book interviews
- [x] Interviews page + add-to-calendar download

## Next
- [ ] Interview invite email to the staff member when an interview is booked, with an .ics attachment so it lands on their Google/Outlook calendar (Tom's preferred path over Google sign-in).
- [ ] Choose a connected Google calendar when staff set an interview time and create its calendar event (requires Google app-user connection setup).
- [x] Analytics Reports: four read-only reports, date/region/store filters, test toggle, print and PDF; verified real admin (7 stores) and manager (4 assigned Dallas-region stores), PDF download and phone layout. No group logo is stored, so reports use a group monogram; unavailable historical attention is labeled current.
- [x] Clean Integrations wording and matching cards, move Texting settings from Team, and verify unchanged values plus sidebar tooltip.
- [x] Texting setup: group settings, store contacts, job overrides, delivery tracking and phone opt-outs; verified policies and save/reopen controls
- [x] Texting engine: outbox with consent/STOP/texting-window checks, practice mode, Twilio adapter, inbound + delivery-receipt webhooks, assistant replies through the outbox, Claude switch (docs/texting-engine.md)
- [ ] Live SMS delivery (blocked: Twilio account + carrier registration)
- [x] Texting workflows: welcome on apply, manager summary with 1/2 replies, nudges, escalation contact, interview reminders, 30/60/90 check-ins (scheduled: /api/public/cron/workflows)
- [x] Calendars without sign-in: subscribe link (interviews show in Outlook/Google) and busy times read from each person's iCal link, set on Team, My calendar or the invite
- [ ] One-click Microsoft/Google calendar sign-in (needs an Azure/Google Cloud app registration)
- [x] Track 2 analytics page: time to first contact, aging by stage, time to fill by role/rooftop, manager response, open roles (fixed ops vs variable, per store), applicant and contacted counts, breakdowns by location/role/hiring manager/source, CSV exports
- [x] Stage changes logged to the timeline (powers first contact, aging, time to fill)
- [x] Data model update applied (regions, candidates, consent, retention dates, check-ins, event actor)
- [x] Track 2 retention: 30/60/90 by location, region and enterprise, with CSV export
- [x] Region filters on Applicants and Analytics; transfers stay in-region by default
- [x] "Also applied for" on the profile (one candidate, many applications)
- [x] 30/60/90 check-ins recorded on each hire's profile
- [x] Store/region access rules + Team page (docs/access-rules-update.md)
- [x] Enterprise templates (email + text), in-app email to one or many applicants with merge fields, unsubscribe links, Integrations page; practice mode until the sender domain is set up (docs/email-update.md)
- [x] 3-business-day untouched escalation (code; schedule it in Lovable: docs/escalation-schedule.md)
- [x] Team invites by email/link with role + store/region coverage; remove members; managers must be given coverage (docs/team-invites-update.md)
- [x] Screening (knockout) questions on jobs: answers on the apply form, unmet requirements flagged on cards/profiles, assistant doesn't re-ask (docs/knockout-questions-update.md)
- [ ] Video library + welcome/thank-you videos, applicant intro video recording
- [x] Live email (notify.workwithwerk.com verified; sending address penny@notify.workwithwerk.com, mode live)
- [ ] Live texts (blocked: Twilio)
- [~] Per-store AI HR assistant: texting, check-ins and nudges done; group settings (tone, facts, screening, hand-off) and take-over done; weekly HR summary done
- [ ] Interviews: in-person recording, Zoom/Meet/Teams transcripts, AI grading, AI interview questions
- [x] Automated status moves from events (manager 1/2, candidate booking, offer sent, offer signed → Hired option) and HR-defined status rules (no reply, no change in stage, failed screening question)

- [x] Simplify BoldSign connection and setup into one section; verified connection checks, template save/reopen, copied production address and mobile layout.

## Done (Oct 27)
- [x] Job Share button: tagged links for free boards + QR code
- [x] Offer letters + documents to sign (BoldSign), one texted signing link, signed copy download
- [x] Interview self-scheduling with store interview hours; booking link in invite text and email
- [x] Automatic texts page: every automatic text on/off, wording, timing; check-in days; booking window
- [x] AI assistant settings: tone, facts it may share, screening topics, hand-off to a person, pause/take-over, books only real open times

## Still to do
- [ ] Background checks (partner TBD) — tracking on the profile done (Requested / In progress / Clear / Flagged, set by Recruiting/HR); vendor hookup still to do
- [x] Weekly HR summary per store: one email per person for the stores they cover, chosen day/time, preview button (off until turned on)
- [~] Interview intelligence: question kits and interviewer scorecards done (docs/interview-scorecards-update.md); recording/transcripts and AI-drafted scorecards still to do (needs consent wording, signed off by the group)
- [ ] Separate Twilio brand per client before go-live; bulk email via Resend/SES
