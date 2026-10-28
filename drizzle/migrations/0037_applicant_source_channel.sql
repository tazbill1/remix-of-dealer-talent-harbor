ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_detail text;

UPDATE public.applications SET source_channel = CASE
  WHEN referrer_id IS NOT NULL OR referred_by_text IS NOT NULL OR lower(source) = 'referral' THEN 'Employee referral'
  WHEN created_manually OR lower(source) = 'manual' THEN 'Manual entry'
  ELSE 'Company website' END
WHERE source_channel IS NULL;

ALTER TABLE public.applications ALTER COLUMN source_channel SET DEFAULT 'Company website';
ALTER TABLE public.applications ALTER COLUMN source_channel SET NOT NULL;
ALTER TABLE public.applications ADD CONSTRAINT applications_source_channel_check CHECK (source_channel IN
  ('Indeed','ZipRecruiter','Company website','Employee referral','Event','Store QR code','Walk-in','Manual entry','Other'));
COMMENT ON COLUMN public.applications.source IS 'Raw tracking tag (e.g. ?source= value); source_channel is the standardized source.';

CREATE OR REPLACE FUNCTION public.set_source_channel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE raw text := lower(btrim(coalesce(NEW.source, '')));
BEGIN
  -- Only derive when the caller didn't pick a standardized source explicitly.
  IF NEW.source_channel IS NOT NULL AND NEW.source_channel <> 'Company website' THEN RETURN NEW; END IF;
  NEW.source_channel := CASE
    WHEN NEW.referrer_id IS NOT NULL OR NEW.referred_by_text IS NOT NULL OR raw = 'referral' THEN 'Employee referral'
    WHEN NEW.created_manually OR raw IN ('manual','staff') THEN 'Manual entry'
    WHEN raw = 'indeed' THEN 'Indeed'
    WHEN raw IN ('ziprecruiter','zip_recruiter','zip') THEN 'ZipRecruiter'
    WHEN raw IN ('event','hiring_event','job_fair') THEN 'Event'
    WHEN raw IN ('qr','store_qr') THEN 'Store QR code'
    WHEN raw IN ('walk-in','walkin','walk_in') THEN 'Walk-in'
    WHEN raw IN ('','careers','own_site','website','google','site') THEN 'Company website'
    ELSE 'Other' END;
  IF NEW.source_channel = 'Other' AND NEW.source_detail IS NULL THEN NEW.source_detail := NEW.source; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS applications_set_source_channel ON public.applications;
CREATE TRIGGER applications_set_source_channel BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_source_channel();

CREATE OR REPLACE VIEW public.applicant_source_counts WITH (security_invoker = true) AS
SELECT org_id, dealership_id AS store_id, source_channel AS source,
  count(*)::int AS applicants,
  count(*) FILTER (WHERE status = 'hired')::int AS hires,
  (GROUPING(dealership_id) = 1) AS org_total
FROM public.applications
GROUP BY GROUPING SETS ((org_id, dealership_id, source_channel), (org_id, source_channel));

GRANT SELECT ON public.applicant_source_counts TO authenticated;
GRANT SELECT ON public.applicant_source_counts TO service_role;