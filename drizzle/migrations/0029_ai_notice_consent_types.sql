ALTER TABLE public.applicant_consents DROP CONSTRAINT IF EXISTS applicant_consents_consent_type_check;
ALTER TABLE public.applicant_consents ADD CONSTRAINT applicant_consents_consent_type_check CHECK (consent_type = ANY (ARRAY['sms','ai_screening','background_check','recording','privacy_notice','ai_notice']));
ALTER TABLE public.applicant_consents DROP CONSTRAINT IF EXISTS applicant_consents_source_check;
ALTER TABLE public.applicant_consents ADD CONSTRAINT applicant_consents_source_check CHECK (source = ANY (ARRAY['careers_site','sms_reply','staff_entry','careers_form']));