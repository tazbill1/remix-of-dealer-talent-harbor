CREATE OR REPLACE FUNCTION public.resolve_event_coverage(_code text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('event_id',e.id,'org_slug',o.slug,'name',e.name,'mode',e.coverage_mode,'store_ids',COALESCE((SELECT jsonb_agg(s) FROM public.event_scope_stores(e.org_id,e.coverage_mode,e.covered_store_ids,e.region_id,e.store_id) s),'[]'::jsonb)) FROM public.recruiting_events e JOIN public.organizations o ON o.id=e.org_id WHERE e.code=upper(btrim(_code)) AND e.is_active
$$;
REVOKE ALL ON FUNCTION public.resolve_event_coverage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_event_coverage(text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.resolve_scan(_code text) RETURNS TABLE(kind text,org_slug text,event_id uuid,name text,store_id uuid,store_name text,job_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT 'event',o.slug,e.id,e.name,CASE WHEN e.coverage_mode='legacy' THEN e.store_id ELSE NULL END,CASE WHEN e.coverage_mode='legacy' THEN d.name ELSE NULL END,CASE WHEN e.coverage_mode='legacy' THEN e.job_id ELSE NULL END FROM public.recruiting_events e JOIN public.organizations o ON o.id=e.org_id LEFT JOIN public.dealerships d ON d.id=e.store_id WHERE e.code=upper(btrim(_code)) AND e.is_active
 UNION ALL SELECT 'store',o.slug,NULL,d.name,d.id,d.name,NULL FROM public.dealerships d JOIN public.organizations o ON o.id=d.org_id WHERE d.qr_code=upper(btrim(_code)) LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.guard_application_event_coverage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.recruiting_events;
BEGIN
 IF NEW.recruiting_event_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.recruiting_event_id IS NOT DISTINCT FROM OLD.recruiting_event_id THEN RETURN NEW; END IF;
 SELECT * INTO e FROM public.recruiting_events WHERE id=NEW.recruiting_event_id AND org_id=NEW.org_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recruiting event belongs to a different group'; END IF;
 IF e.coverage_mode<>'legacy' AND NOT EXISTS(SELECT 1 FROM public.event_scope_stores(e.org_id,e.coverage_mode,e.covered_store_ids,e.region_id,e.store_id) s WHERE s=NEW.dealership_id) THEN RAISE EXCEPTION 'Applicant store is not covered by this event'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER application_event_coverage_guard BEFORE INSERT OR UPDATE OF recruiting_event_id ON public.applications FOR EACH ROW EXECUTE FUNCTION public.guard_application_event_coverage();