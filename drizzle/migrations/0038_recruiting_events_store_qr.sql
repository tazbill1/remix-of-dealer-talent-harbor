CREATE TABLE public.recruiting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.dealerships(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_date date NOT NULL,
  location text,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruiting_events_org_idx ON public.recruiting_events(org_id, event_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiting_events TO authenticated;
GRANT ALL ON public.recruiting_events TO service_role;
ALTER TABLE public.recruiting_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_events(_org uuid, _store uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_post_jobs(_org, _uid)
    OR (_store IS NOT NULL
        AND (public.has_org_role(_org, _uid, 'dealer_manager') OR public.has_org_role(_org, _uid, 'hiring_manager'))
        AND public.can_access_store(_org, _store, _uid))
$$;

CREATE POLICY "events read" ON public.recruiting_events FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid())
  AND (store_id IS NULL OR public.can_access_store(org_id, store_id, auth.uid()))));
CREATE POLICY "events insert" ON public.recruiting_events FOR INSERT TO authenticated
WITH CHECK (public.can_manage_events(org_id, store_id, auth.uid()));
CREATE POLICY "events update" ON public.recruiting_events FOR UPDATE TO authenticated
USING (public.can_manage_events(org_id, store_id, auth.uid()))
WITH CHECK (public.can_manage_events(org_id, store_id, auth.uid()));
CREATE POLICY "events delete" ON public.recruiting_events FOR DELETE TO authenticated
USING (public.can_manage_events(org_id, store_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_recruiting_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dealerships d WHERE d.id = NEW.store_id AND d.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'Store belongs to a different group'; END IF;
  IF NEW.job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = NEW.job_id AND j.org_id = NEW.org_id
      AND (NEW.store_id IS NULL OR j.dealership_id = NEW.store_id)) THEN
    RAISE EXCEPTION 'Job must belong to the event''s group and store'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recruiting_events_guard BEFORE INSERT OR UPDATE ON public.recruiting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_recruiting_event();

-- Per-store QR code (generated for existing stores by the default).
ALTER TABLE public.dealerships ADD COLUMN IF NOT EXISTS qr_code text NOT NULL DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 8));
ALTER TABLE public.dealerships ADD CONSTRAINT dealerships_qr_code_key UNIQUE (qr_code);

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS recruiting_event_id uuid REFERENCES public.recruiting_events(id) ON DELETE SET NULL;

-- Public scan lookup: only the minimum to route the visitor (no anon table access).
CREATE OR REPLACE FUNCTION public.resolve_scan(_code text)
RETURNS TABLE(kind text, org_slug text, event_id uuid, name text, store_id uuid, store_name text, job_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'event', o.slug, e.id, e.name, e.store_id, d.name, e.job_id
  FROM public.recruiting_events e JOIN public.organizations o ON o.id = e.org_id
  LEFT JOIN public.dealerships d ON d.id = e.store_id
  WHERE e.code = upper(btrim(_code)) AND e.is_active
  UNION ALL
  SELECT 'store', o.slug, NULL, d.name, d.id, d.name, NULL
  FROM public.dealerships d JOIN public.organizations o ON o.id = d.org_id
  WHERE d.qr_code = upper(btrim(_code))
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.resolve_scan(text) TO anon, authenticated;

-- Source mapping now also understands event and store QR scans.
CREATE OR REPLACE FUNCTION public.set_source_channel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE raw text := lower(btrim(coalesce(NEW.source, ''))); ev_name text;
BEGIN
  IF NEW.recruiting_event_id IS NOT NULL THEN
    SELECT name INTO ev_name FROM public.recruiting_events WHERE id = NEW.recruiting_event_id AND org_id = NEW.org_id;
    IF ev_name IS NULL THEN RAISE EXCEPTION 'Recruiting event belongs to a different group'; END IF;
    NEW.source_channel := 'Event';
    NEW.source_detail := ev_name;
    RETURN NEW;
  END IF;
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
  IF NEW.source_channel = 'Store QR code' AND NEW.source_detail IS NULL THEN
    SELECT name INTO NEW.source_detail FROM public.dealerships WHERE id = NEW.dealership_id;
  END IF;
  IF NEW.source_channel = 'Other' AND NEW.source_detail IS NULL THEN NEW.source_detail := NEW.source; END IF;
  RETURN NEW;
END $$;

-- Reporting: applicants and hires per event, and per store from store QR scans (viewer's own access applies).
CREATE OR REPLACE VIEW public.applicant_scan_counts WITH (security_invoker = true) AS
SELECT a.org_id, 'event'::text AS kind, a.recruiting_event_id AS event_id, e.name AS event_name,
  coalesce(e.store_id, a.dealership_id) AS store_id,
  count(*)::int AS applicants, count(*) FILTER (WHERE a.status = 'hired')::int AS hires
FROM public.applications a JOIN public.recruiting_events e ON e.id = a.recruiting_event_id
GROUP BY a.org_id, a.recruiting_event_id, e.name, coalesce(e.store_id, a.dealership_id)
UNION ALL
SELECT a.org_id, 'store_qr', NULL, NULL, a.dealership_id,
  count(*)::int, count(*) FILTER (WHERE a.status = 'hired')::int
FROM public.applications a
WHERE a.source_channel = 'Store QR code'
GROUP BY a.org_id, a.dealership_id;
GRANT SELECT ON public.applicant_scan_counts TO authenticated, service_role;