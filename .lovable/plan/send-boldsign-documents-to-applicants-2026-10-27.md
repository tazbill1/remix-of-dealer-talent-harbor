# Send BoldSign documents to applicants

## Recommendation
Build and edit documents in BoldSign as templates. You plan to add and change documents over time, and this way you can do that in BoldSign whenever you like, with no changes needed in this app. BoldSign's editor is also better for placing signature, date and initial boxes.

## How it works
1. In BoldSign, create a template for each document (offer letter, new-hire paperwork, policies). Name the fill-in boxes with standard names such as ApplicantName, JobTitle, Store, Pay and StartDate.
2. In this app, a new "Documents" section on Integrations lists your BoldSign templates automatically. Any new or edited template shows up there too.
3. On an applicant, a "Send document" button lets you pick one or more templates. Details are filled in from the applicant and job, you get a quick review, then you send.
4. The applicant gets a signing email from BoldSign. On the applicant you can see Sent, Viewed, Signed or Declined, and download the signed copy.
5. When an offer letter is signed, the applicant can move to Hired automatically (optional, off by default).

## What stays the same
- Applicant emails still come from penny@notify.workwithwerk.com. Signing emails come from BoldSign.
- Only admins and recruiters can send documents.

## Technical details
- Server functions call BoldSign through the linked connection: list templates, send from a template with prefilled fields, and get the document status or download.
- Extend the existing offer-letter records into a general `signature_requests` table (org_id, application_id, template_id, template_name, boldsign_document_id, status, timestamps), with group-scoped RLS.
- Add a public webhook route at /api/public/boldsign/webhook that checks BoldSign's signature and updates the status.
- Tests: field mapping from applicant to template, status changes, and who can send.
