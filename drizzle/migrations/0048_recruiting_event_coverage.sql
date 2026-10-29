ALTER TABLE public.recruiting_events ADD COLUMN IF NOT EXISTS coverage_mode text NOT NULL DEFAULT 'legacy', ADD COLUMN IF NOT EXISTS covered_store_ids uuid[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id);
UPDATE public.recruiting_events SET covered_store_ids = ARRAY[store_id] WHERE store_id IS NOT NULL AND cardinality(covered_store_ids)=0;
ALTER TABLE public.recruiting_events ADD CONSTRAINT recruiting_event_coverage_mode CHECK (coverage_mode IN ('legacy','stores','region','group'));

CREATE OR REPLACE FUNCTION public.event_scope_stores(_org uuid, _mode text, _stores uuid[], _region uuid, _legacy_store uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT d.id FROM public.dealerships d WHERE d.org_id=_org AND CASE WHEN _mode='stores' THEN d.id=ANY(_stores) WHEN _mode='region' THEN d.region_id=_region WHEN _mode='group' THEN true ELSE _legacy_store IS NULL OR d.id=_legacy_store END
$$;
REVOKE ALL ON FUNCTION public.event_scope_stores(uuid,text,uuid[],uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.event_scope_stores(uuid,text,uuid[],uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.can_manage_event_scope(_org uuid,_mode text,_stores uuid[],_region uuid,_legacy_store uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.can_post_jobs(_org,_uid) OR (
 (public.has_org_role(_org,_uid,'dealer_manager') OR public.has_org_role(_org,_uid,'hiring_manager'))
 AND EXISTS(SELECT 1 FROM public.event_scope_stores(_org,_mode,_stores,_region,_legacy_store))
 AND NOT EXISTS(SELECT 1 FROM public.event_scope_stores(_org,_mode,_stores,_region,_legacy_store) s WHERE NOT public.can_access_store(_org,s,_uid)))
$$;
REVOKE ALL ON FUNCTION public.can_manage_event_scope(uuid,text,uuid[],uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_event_scope(uuid,text,uuid[],uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.can_read_event_scope(_org uuid,_mode text,_stores uuid[],_region uuid,_legacy_store uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_platform_admin(_uid) OR (public.is_org_member(_org,_uid) AND (public.can_post_jobs(_org,_uid) OR EXISTS(SELECT 1 FROM public.event_scope_stores(_org,_mode,_stores,_region,_legacy_store) s WHERE public.can_access_store(_org,s,_uid))))
$$;
REVOKE ALL ON FUNCTION public.can_read_event_scope(uuid,text,uuid[],uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_event_scope(uuid,text,uuid[],uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_recruiting_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.org_id<>OLD.org_id THEN RAISE EXCEPTION 'Event group cannot change'; END IF;
 IF NEW.store_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dealerships WHERE id=NEW.store_id AND org_id=NEW.org_id) THEN RAISE EXCEPTION 'Store belongs to a different group'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.covered_store_ids) s WHERE NOT EXISTS(SELECT 1 FROM public.dealerships d WHERE d.id=s AND d.org_id=NEW.org_id)) THEN RAISE EXCEPTION 'Covered stores must belong to this group'; END IF;
 IF NEW.coverage_mode='stores' AND cardinality(NEW.covered_store_ids)=0 THEN RAISE EXCEPTION 'Pick at least one store'; END IF;
 IF NEW.coverage_mode='region' AND (NEW.region_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.regions WHERE id=NEW.region_id AND org_id=NEW.org_id)) THEN RAISE EXCEPTION 'Pick a region in this group'; END IF;
 IF NEW.coverage_mode='legacy' THEN NEW.covered_store_ids:=CASE WHEN NEW.store_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.store_id] END;
 ELSE
  NEW.store_id:=CASE WHEN NEW.coverage_mode='stores' AND cardinality(NEW.covered_store_ids)=1 THEN NEW.covered_store_ids[1] ELSE NULL END;
  IF NEW.coverage_mode<>'stores' THEN NEW.covered_store_ids:='{}'; END IF;
  IF NEW.coverage_mode<>'region' THEN NEW.region_id:=NULL; END IF;
 END IF;
 IF NEW.job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=NEW.job_id AND j.org_id=NEW.org_id AND j.dealership_id IN (SELECT public.event_scope_stores(NEW.org_id,NEW.coverage_mode,NEW.covered_store_ids,NEW.region_id,NEW.store_id))) THEN RAISE EXCEPTION 'Job must belong to a covered store'; END IF;
 IF auth.uid() IS NOT NULL AND NOT public.can_manage_event_scope(NEW.org_id,NEW.coverage_mode,NEW.covered_store_ids,NEW.region_id,NEW.store_id,auth.uid()) THEN RAISE EXCEPTION 'You can only cover your assigned stores'; END IF;
 RETURN NEW;
END $$;

DROP POLICY IF EXISTS "events read" ON public.recruiting_events;
DROP POLICY IF EXISTS "events insert" ON public.recruiting_events;
DROP POLICY IF EXISTS "events update" ON public.recruiting_events;
DROP POLICY IF EXISTS "events delete" ON public.recruiting_events;
CREATE POLICY "events read" ON public.recruiting_events FOR SELECT TO authenticated USING(public.can_read_event_scope(org_id,coverage_mode,covered_store_ids,region_id,store_id,auth.uid()));
CREATE POLICY "events insert" ON public.recruiting_events FOR INSERT TO authenticated WITH CHECK(public.can_manage_event_scope(org_id,coverage_mode,covered_store_ids,region_id,store_id,auth.uid()));
CREATE POLICY "events update" ON public.recruiting_events FOR UPDATE TO authenticated USING(public.can_manage_event_scope(org_id,coverage_mode,covered_store_ids,region_id,store_id,auth.uid())) WITH CHECK(public.can_manage_event_scope(org_id,coverage_mode,covered_store_ids,region_id,store_id,auth.uid()));
CREATE POLICY "events delete" ON public.recruiting_events FOR DELETE TO authenticated USING(public.can_manage_event_scope(org_id,coverage_mode,covered_store_ids,region_id,store_id,auth.uid()));

CREATE OR REPLACE FUNCTION public.event_coverage_options(_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT(public.is_platform_admin(auth.uid()) OR public.is_org_member(_org,auth.uid())) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 RETURN jsonb_build_object('group_allowed',public.can_manage_event_scope(_org,'group','{}',NULL,NULL,auth.uid()),'region_ids',COALESCE((SELECT jsonb_agg(r.id) FROM public.regions r WHERE r.org_id=_org AND public.can_manage_event_scope(_org,'region','{}',r.id,NULL,auth.uid())),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.event_coverage_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_coverage_options(uuid) TO authenticated,service_role;

CREATE OR REPLACE VIEW public.applicant_scan_counts WITH (security_invoker=true) AS
 SELECT a.org_id,'event'::text AS kind,a.recruiting_event_id AS event_id,e.name AS event_name,a.dealership_id AS store_id,count(*)::integer AS applicants,(count(*) FILTER(WHERE a.status='hired'))::integer AS hires FROM public.applications a JOIN public.recruiting_events e ON e.id=a.recruiting_event_id GROUP BY a.org_id,a.recruiting_event_id,e.name,a.dealership_id
 UNION ALL SELECT a.org_id,'store_qr'::text,NULL::uuid,NULL::text,a.dealership_id,count(*)::integer,(count(*) FILTER(WHERE a.status='hired'))::integer FROM public.applications a WHERE a.source_channel='Store QR code' GROUP BY a.org_id,a.dealership_id;
GRANT SELECT ON public.applicant_scan_counts TO authenticated,service_role;
COMMENT ON COLUMN public.recruiting_events.coverage_mode IS 'legacy preserves pre-existing single-store/job scan destinations; new scope modes list all open jobs at covered stores';