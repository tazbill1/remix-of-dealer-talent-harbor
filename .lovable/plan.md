# WerkandMe Hiring: Applicant Tracking for Dealer Groups

A WerkandMe service that many dealer groups can sign up for. Each group (5, 15 or 40+ stores) gets its own private space to post jobs, send them to job sites, and handle every applicant.

## Who uses it
- **WerkandMe Admin**: one master login. Sees all dealer groups, approves new sign-ups, manages plans, and can step in to help any group.
- **Group admins**: see and manage every store, job, applicant, template and user in their own group only.
- **Dealership managers**: manage jobs, videos and staff for their own store.
- **Hiring managers**: review and move applicants for the stores they're assigned to.
- **Recruiters / HR**: follow progress across the group's stores.
- **Applicants**: no login. They browse the group's careers site and apply.

## Keeping each group's data separate
- Every record (stores, jobs, applicants, videos, messages, AI chats) belongs to exactly one dealer group.
- Access rules in the database block anyone from seeing another group's data, even by accident. Only the WerkandMe Admin can see across groups.
- Each group gets its own careers site address and its own job feed.
- Self sign-up: a dealer group creates an account, adds its stores, and invites its team.

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
10. **An AI assistant for every store**: a bubbly, kind, organized "favorite HR assistant" personality. You can name it per store.
    - **For applicants**: answers questions about the job and store, reminds them to finish the questionnaire or intro video, and confirms interview times, by text, email and on the job page. Each conversation is tied to one applicant, so it never mixes people up.
    - **For hiring managers**: daily nudges ("3 applicants waiting over 48 hours"), reminders to give interview feedback, and a simple to-do list.
    - **For recruiters / HR**: daily or weekly summary of each store's progress, slow spots, and standout applicants.
    - Every AI message is logged on the applicant's profile, and a person can take over at any time.
11. **WerkandMe Admin console**: list of all dealer groups, their stores, usage and status.
12. **Interviews**:
    - One-tap "Record interview" button on the applicant profile for in-person interviews (phone or laptop mic), with the applicant's consent noted.
    - Transcripts from Zoom, Google Meet and Microsoft Teams interviews, either pulled in automatically once those accounts are connected or uploaded by hand.
    - AI grading from the transcript: score for each question and skill, strengths, concerns and a recommendation. Hiring managers can always change the grade.
    - AI-made interview questions for each applicant, based on the job, their resume, questionnaire answers and their chats with the assistant.
13. **Applicants always know where they stand**:
    - Status moves forward automatically wherever possible (applied, questionnaire done, interview booked, interviewed, decision).
    - A simple status page on the applicant's link, always up to date.
    - The assistant checks in every few days even when nothing has changed ("We've had lots of interest and we're still reviewing, hang tight!") and asks light, fun questions to keep them excited.
    - Check-ins stop when the applicant is hired, turned down, or asks to stop.
14. **Open to other stores**: an applicant who isn't the right fit at one store can be flagged "open to contact" (with their OK). Other stores in the same group can then see and reach out to them. Never visible to other dealer groups.

## What you'll need to provide
- **Email**: a domain you own (for example careers.yourgroup.com) to send from.
- **Texting**: a Twilio account and phone number (I'll connect it when we get there).
- **Video interviews**: Zoom, Google and Microsoft accounts for automatic transcripts. Until those are connected, transcripts can be uploaded by hand.
- Posting straight to Indeed's paid sponsored listings isn't included; the free feed covers organic listings.
- Recording laws vary by state; the app asks for consent before recording, but please check with your legal team.

## Design direction (WerkandMe style sheet)
- Colors: Navy #1d224b for main text and dark panels, Sapphire #0052a4 for buttons and links, Lime #80cd60 for success and "Hired", Ultra-Marine #00bfe4 for highlights. Clean white backgrounds.
- Brand gradient (chartreuse to navy) used only on a few headline words, never as backgrounds.
- Inter font: bold, simple headlines; regular body text.
- WerkandMe logo in the header, brand icon as a small accent (app icon, loading). Light logo on navy areas.
- Dealership-focused photos; calm, uncluttered data screens for managers and a bright, friendly careers site. Works on phones from the start.

## Technical details
- Lovable Cloud: database, sign-in (email/password), file storage for resumes and videos (paths prefixed by organization id).
- Multi-tenant: `organizations` table; every tenant table carries `organization_id`. RLS checks membership via security-definer functions (`is_org_member`, `has_org_role`, `is_platform_admin`).
- Roles in separate tables: `platform_admins` (WerkandMe) and `org_members` (org_id, user_id, role: group_admin, dealer_manager, hiring_manager, recruiter) plus `member_store_access`.
- Tables: organizations, dealerships, jobs, job_templates, questionnaires, questions, applications, answers, messages, message_templates, videos, ai_agents (per store: name, tone notes), ai_conversations (one per application), ai_tasks.
- Public routes: /c/$orgSlug (careers), /c/$orgSlug/jobs/$jobId, /apply/$jobId, /q/$token (questionnaire, video recording, assistant chat), /feed/$orgSlug/jobs.xml.
- Signed-in area: /dashboard, /jobs, /applicants, /dealerships, /questionnaires, /templates, /videos, /team, /assistant; /platform for the WerkandMe Admin.
- AI: Lovable AI Gateway from server functions. Context is always loaded by application id + organization id, so an assistant only sees its own applicant. Scheduled server routes send manager nudges and HR summaries.
- Lovable app emails and Twilio texts are sent from the server. Intro videos use the browser's MediaRecorder.
- Build order: Cloud, organizations and roles, then sign-up and admin console, stores and jobs, careers site and feed, apply flow and questionnaires, pipeline, emails and texts, then AI assistants.
