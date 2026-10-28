REVOKE ALL ON public.applicant_consents FROM anon, authenticated;
GRANT SELECT, INSERT ON public.applicant_consents TO authenticated;
GRANT UPDATE (revoked_at,revoked_source) ON public.applicant_consents TO authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.applicant_consents FROM service_role;
REVOKE ALL ON public.adverse_actions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.adverse_actions TO authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.adverse_actions FROM service_role;