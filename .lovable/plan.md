# Dealer Group Applicant Tracking System

One hub where a 40+ store dealer group posts jobs, sends them to job sites, and handles every applicant.

## Who uses it
- **Group admins**: see and manage every store, job, applicant, template and user.
- **Dealership managers**: manage jobs, videos and staff for their own store.
- **Hiring managers**: review and move applicants for the stores they're assigned to.
- **Applicants**: no login. They browse the careers site and apply.

## What gets built (phase 1)
1. **Command center dashboard**: open jobs, new applicants today, time-to-hire, and a ranking of stores. Filter by store, brand, region or role.
2. **Dealerships**: add the 40+ stores (name, brand, address, logo, welcome video).
3. **Jobs**: quick job builder with role templates (Sales Consultant, Service Tech, Finance Manager and so on), pay range, store, status (draft/open/closed). Copy one job to many stores at once.
4. **Public careers site**: group-wide job board with search by store, city and role, plus job pages for each store. Mobile-first apply form in about 60 seconds with resume upload.
5. **Job sites**: a public job feed that Indeed, ZipRecruiter, Glassdoor and Google Jobs can read automatically, plus Google Jobs markup on each job page. Each applicant is tagged with the site they came from.
6. **Questionnaires**: build question sets (yes/no, multiple choice, short answer, knockout questions) and attach them to jobs or role templates.
7. **Automated responses**: right after an applicant applies:
   - Email and text with a thank-you, the store's welcome video, and a link to that job's questionnaire.
   - Optional prompt to record and send a short intro video (in the browser, on a phone or computer; never required).
   - Editable templates for each stage (applied, interview, offer, not selected).
8. **Applicant pipeline**: drag-and-drop board (New, Screening, Interview, Offer, Hired, Rejected) with an applicant profile showing resume, answers, intro video, notes, ratings and message history. One-click email or text replies.
9. **Video library**: upload a welcome or thank-you video for each store, or one for the whole group.

## What you'll need to provide
- **Email**: a domain you own (for example careers.yourgroup.com) to send from.
- **Texting**: a Twilio account and phone number (I'll connect it when we get there).
- Posting straight to Indeed's paid sponsored listings isn't included; the free feed covers organic listings.

## Design direction (WerkandMe style sheet)
- Colors: Navy #1d224b for main text and dark panels, Sapphire #0052a4 for buttons and links, Lime #80cd60 for success and "Hired", Ultra-Marine #00bfe4 for highlights. Clean white backgrounds.
- Brand gradient (chartreuse to navy) used only on a few headline words, never as backgrounds.
- Inter font: bold, simple headlines; regular body text.
- WerkandMe logo in the header, brand icon as a small accent (app icon, loading). Light logo on navy areas.
- Dealership-focused photos; calm, uncluttered data screens for managers and a bright, friendly careers site. Works on phones from the start.

## Technical details
- Lovable Cloud: database, sign-in (email/password), file storage for resumes and videos.
- Roles live in a separate table (group_admin, dealer_manager, hiring_manager) and are assigned per store. Access rules make sure each person sees only their stores.
- Tables: dealerships, jobs, job_templates, questionnaires, questions, applications, answers, messages, message_templates, videos, user_store_access.
- Public routes: /careers, /careers/$jobId, /apply/$jobId, /q/$token (questionnaire plus video recording), /feed/jobs.xml (Indeed-format XML).
- Signed-in area: /dashboard, /jobs, /applicants, /dealerships, /questionnaires, /templates, /videos, /team.
- Lovable app emails and Twilio text messages are sent from the server when an application is submitted. Intro videos are recorded with the browser's MediaRecorder and uploaded to storage.
- Build order: set up Cloud and roles, then stores and jobs, then the careers site and feed, then apply flow and questionnaires, then pipeline, then automated email and text messages.
