BEGIN;
SET LOCAL ROLE service_role;
DO $$
BEGIN
 IF public.five_business_days_after('2026-10-30 15:00:00+00') <> '2026-11-06 15:00:00+00'::timestamptz THEN RAISE EXCEPTION 'Five business days must skip weekends'; END IF;
 IF public.five_business_days_after('2026-10-26 15:00:00+00') <> '2026-11-02 15:00:00+00'::timestamptz THEN RAISE EXCEPTION 'Five business days from Monday must end next Monday'; END IF;
 IF has_table_privilege('anon','public.applicant_consents','SELECT') OR has_table_privilege('anon','public.adverse_actions','SELECT') THEN RAISE EXCEPTION 'Anonymous reads must be blocked'; END IF;
 IF has_column_privilege('authenticated','public.applicant_consents','consent_text','UPDATE') THEN RAISE EXCEPTION 'Original consent text must be immutable'; END IF;
 IF NOT has_column_privilege('authenticated','public.applicant_consents','revoked_at','UPDATE') THEN RAISE EXCEPTION 'Revocation must be editable'; END IF;
 IF has_table_privilege('authenticated','public.applicant_consents','DELETE') OR has_table_privilege('service_role','public.applicant_consents','TRUNCATE') OR has_table_privilege('authenticated','public.adverse_actions','DELETE') OR has_table_privilege('service_role','public.adverse_actions','TRUNCATE') THEN RAISE EXCEPTION 'Permanent records cannot be removed'; END IF;
END $$;
ROLLBACK;
