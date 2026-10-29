ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS hiring_manager_user_id uuid;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS escalation_user_id uuid;
COMMENT ON COLUMN public.jobs.hiring_manager IS 'DEPRECATED as input: derived display name for legacy consumers; hiring_manager_user_id is the authoritative assignment.';
CREATE OR REPLACE FUNCTION public.job_manager_is_eligible(_org uuid, _store uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.org_members m JOIN public.dealerships d ON d.id=_store AND d.org_id=_org WHERE m.org_id=_org AND m.user_id=_user AND m.role IN ('dealer_manager','hiring_manager') AND EXISTS (SELECT 1 FROM public.org_member_scopes s WHERE s.org_id=_org AND s.member_id=m.id AND (s.dealership_id=d.id OR s.region_id=d.region_id)))
$$;
REVOKE ALL ON FUNCTION public.job_manager_is_eligible(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.job_manager_is_eligible(uuid,uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.job_contact_options(_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_platform_admin(auth.uid()) OR public.is_org_member(_org,auth.uid())) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN jsonb_build_object('managers', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'store_id',d.id,'name',COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'full_name'),''),NULLIF(btrim(u.raw_user_meta_data->>'name'),''),m.email),'email',m.email)) FROM public.dealerships d JOIN public.org_members m ON m.org_id=d.org_id JOIN auth.users u ON u.id=m.user_id WHERE d.org_id=_org AND public.can_access_store(_org,d.id,auth.uid()) AND m.role IN ('dealer_manager','hiring_manager') AND public.job_manager_is_eligible(_org,d.id,m.user_id)), '[]'::jsonb),
 'escalations', COALESCE((SELECT jsonb_agg(jsonb_build_object('store_id',d.id,'user_id',c.user_id,'name',c.name,'phone',c.phone)) FROM public.dealerships d CROSS JOIN LATERAL (SELECT m.user_id,COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'full_name'),''),NULLIF(btrim(u.raw_user_meta_data->>'name'),''),m.email) name,COALESCE(NULLIF(u.raw_user_meta_data->>'phone',''),NULLIF(u.phone,'')) phone FROM public.org_members m JOIN auth.users u ON u.id=m.user_id WHERE m.org_id=_org AND m.role IN ('recruiter','group_admin') ORDER BY CASE WHEN EXISTS (SELECT 1 FROM public.org_member_scopes s WHERE s.org_id=_org AND s.member_id=m.id AND (s.dealership_id=d.id OR s.region_id=d.region_id)) THEN 0 ELSE 1 END, CASE m.role WHEN 'recruiter' THEN 0 ELSE 1 END,m.created_at,m.id LIMIT 1) c WHERE d.org_id=_org AND public.can_access_store(_org,d.id,auth.uid())), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.job_contact_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.job_contact_options(uuid) TO authenticated,service_role;
WITH matches AS (
 SELECT j.id,min(m.user_id::text)::uuid user_id FROM public.jobs j JOIN public.org_members m ON m.org_id=j.org_id JOIN auth.users u ON u.id=m.user_id WHERE public.job_manager_is_eligible(j.org_id,j.dealership_id,m.user_id) AND NULLIF(btrim(j.hiring_manager),'') IS NOT NULL AND lower(btrim(j.hiring_manager)) IN (lower(btrim(m.email)),lower(btrim(u.raw_user_meta_data->>'full_name')),lower(btrim(u.raw_user_meta_data->>'name'))) GROUP BY j.id HAVING count(DISTINCT m.user_id)=1
) UPDATE public.jobs j SET hiring_manager_user_id=x.user_id FROM matches x WHERE j.id=x.id;
CREATE OR REPLACE FUNCTION public.guard_job_contacts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record;
BEGIN
 IF TG_OP='INSERT' OR NEW.hiring_manager_user_id IS DISTINCT FROM OLD.hiring_manager_user_id OR NEW.dealership_id IS DISTINCT FROM OLD.dealership_id OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
  IF NEW.hiring_manager_user_id IS NOT NULL AND NOT public.job_manager_is_eligible(NEW.org_id,NEW.dealership_id,NEW.hiring_manager_user_id) THEN RAISE EXCEPTION 'Hiring manager must be a manager assigned to this store in this group'; END IF;
 END IF;
 IF NEW.hiring_manager_user_id IS NULL THEN NEW.hiring_manager:=NULL;
 ELSE SELECT COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'full_name'),''),NULLIF(btrim(u.raw_user_meta_data->>'name'),''),m.email) INTO NEW.hiring_manager FROM public.org_members m JOIN auth.users u ON u.id=m.user_id WHERE m.org_id=NEW.org_id AND m.user_id=NEW.hiring_manager_user_id; END IF;
 IF NULLIF(btrim(NEW.escalation_name),'') IS NULL AND NULLIF(btrim(NEW.escalation_phone),'') IS NULL THEN
  SELECT m.user_id,COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'full_name'),''),NULLIF(btrim(u.raw_user_meta_data->>'name'),''),m.email) name,COALESCE(NULLIF(u.raw_user_meta_data->>'phone',''),NULLIF(u.phone,'')) phone INTO c FROM public.org_members m JOIN auth.users u ON u.id=m.user_id JOIN public.dealerships d ON d.id=NEW.dealership_id AND d.org_id=NEW.org_id WHERE m.org_id=NEW.org_id AND m.role IN ('recruiter','group_admin') ORDER BY CASE WHEN EXISTS (SELECT 1 FROM public.org_member_scopes s WHERE s.org_id=NEW.org_id AND s.member_id=m.id AND (s.dealership_id=d.id OR s.region_id=d.region_id)) THEN 0 ELSE 1 END, CASE m.role WHEN 'recruiter' THEN 0 ELSE 1 END,m.created_at,m.id LIMIT 1;
  NEW.escalation_name:=c.name; NEW.escalation_phone:=c.phone; NEW.escalation_user_id:=c.user_id;
 ELSIF TG_OP='INSERT' THEN NEW.escalation_user_id:=NULL;
 ELSIF NEW.escalation_name IS DISTINCT FROM OLD.escalation_name OR NEW.escalation_phone IS DISTINCT FROM OLD.escalation_phone THEN NEW.escalation_user_id:=NULL;
 ELSE NEW.escalation_user_id:=OLD.escalation_user_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_job_contacts() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_job_contacts ON public.jobs;
CREATE TRIGGER guard_job_contacts BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.guard_job_contacts();
UPDATE public.jobs SET hiring_manager_user_id=hiring_manager_user_id;
