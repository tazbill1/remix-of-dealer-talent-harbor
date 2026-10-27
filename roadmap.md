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
- [x] Texting setup: group settings, store contacts, job overrides, delivery tracking and phone opt-outs; verified policies and save/reopen controls
- [x] Texting engine: outbox with consent/STOP/texting-window checks, practice mode, Twilio adapter, inbound + delivery-receipt webhooks, assistant replies through the outbox, Claude switch (docs/texting-engine.md)
- [ ] Live SMS delivery (blocked: Twilio account + carrier registration)
- [x] Texting workflows: welcome on apply, manager summary with 1/2 replies, nudges, escalation contact, interview reminders, 30/60/90 check-ins (schedule /api/cron/workflows: docs/texting-engine.md)
- [ ] One-click Outlook/Google calendar sync + outside-booking detection (blocked: Microsoft/Google sign-in client setup was declined)
- [x] Track 2 analytics page: time to first contact, aging by stage, time to fill by role/rooftop, manager response, open roles (fixed ops vs variable, per store), applicant and contacted counts, breakdowns by location/role/hiring manager/source, CSV exports
- [x] Stage changes logged to the timeline (powers first contact, aging, time to fill)
- [x] Data model update applied (regions, candidates, consent, retention dates, check-ins, event actor)
- [x] Track 2 retention: 30/60/90 by location, region and enterprise, with CSV export
- [x] Region filters on Applicants and Analytics; transfers stay in-region by default
- [x] "Also applied for" on the profile (one candidate, many applications)
- [x] 30/60/90 check-ins recorded on each hire's profile
- [ ] Store/region access rules + Team page: see docs/access-rules-update.md
- [ ] Enterprise communication templates + in-app bulk sending (needs sender domain)
- [x] 3-business-day untouched escalation (code; schedule it in Lovable: docs/escalation-schedule.md)
- [ ] Per-store access for managers (limit to assigned stores) and team invites
- [ ] Questionnaires attached to jobs (knockout questions)
- [ ] Video library + welcome/thank-you videos, applicant intro video recording
- [ ] Automated email (needs sender domain) and texts (needs Twilio)
- [ ] Per-store AI HR assistant: applicant chat, check-ins, manager nudges, HR summaries
- [ ] Interviews: in-person recording, Zoom/Meet/Teams transcripts, AI grading, AI interview questions
- [ ] Automated status moves from events
