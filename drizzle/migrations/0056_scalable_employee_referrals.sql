ALTER TABLE public.referral_settings ADD COLUMN IF NOT EXISTS self_signup_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.dealerships ADD COLUMN IF NOT EXISTS referral_signup_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS dealership_referral_signup_token_idx ON public.dealerships(referral_signup_token);
CREATE INDEX IF NOT EXISTS referrers_name_store_idx ON public.referrers(org_id, store_id, public.norm_name(employee_name));
CREATE INDEX IF NOT EXISTS referrers_email_lookup_idx ON public.referrers(org_id,email_norm);
CREATE INDEX IF NOT EXISTS referrers_phone_lookup_idx ON public.referrers(org_id,phone_norm);
CREATE INDEX IF NOT EXISTS applications_referrer_lookup_idx ON public.applications(org_id,referrer_id);
CREATE TABLE IF NOT EXISTS public.referral_signup_limits (
  rate_key text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.referral_signup_limits TO service_role;
ALTER TABLE public.referral_signup_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.register_referral_employee(_org uuid,_store uuid,_name text,_role text,_department text,_email text,_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.referrers; n text:=btrim(_name); e text:=nullif(btrim(_email),''); p text:=nullif(btrim(_phone),'');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.dealerships WHERE id=_store AND org_id=_org) THEN RAISE EXCEPTION 'Store is not in this group'; END IF;
 IF length(n)<2 OR length(n)>120 OR length(btrim(coalesce(_role,'')))=0 OR length(_role)>120 OR length(coalesce(_department,''))>120 THEN RAISE EXCEPTION 'Name and role are required (maximum 120 characters)'; END IF;
 IF e IS NULL AND p IS NULL THEN RAISE EXCEPTION 'Email or phone is required'; END IF;
 IF e IS NOT NULL AND (length(e)>200 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
 IF p IS NOT NULL AND (length(p)>30 OR regexp_replace(p,'\D','','g') !~ '^1?[2-9][0-9]{2}[2-9][0-9]{6}$') THEN RAISE EXCEPTION 'Enter a valid US phone'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_org::text,0));
 SELECT * INTO r FROM public.referrers WHERE org_id=_org AND
   ((store_id=_store AND public.norm_name(employee_name)=public.norm_name(n)) OR (e IS NOT NULL AND email_norm=public.norm_email(e)) OR (p IS NOT NULL AND phone_norm=public.norm_phone(p)))
 ORDER BY created_at,id LIMIT 1;
 IF r.id IS NOT NULL THEN RETURN jsonb_build_object('id',r.id,'code',r.referral_code,'existing',true,'active',r.active); END IF;
 INSERT INTO public.referrers(org_id,store_id,employee_name,role_title,department,email,phone)
 VALUES(_org,_store,n,btrim(_role),nullif(btrim(_department),''),lower(e),p) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'code',r.referral_code,'existing',false,'active',r.active);
END $$;
REVOKE ALL ON FUNCTION public.register_referral_employee(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_referral_employee(uuid,uuid,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.referral_employee_signup(_token uuid,_first text,_last text,_role text,_email text,_phone text,_rate_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.dealerships; o public.organizations; result jsonb; count_attempts integer;
BEGIN
 SELECT * INTO s FROM public.dealerships WHERE referral_signup_token=_token;
 IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.referral_settings WHERE org_id=s.org_id AND self_signup_enabled) THEN RAISE EXCEPTION 'Employee signup is not available'; END IF;
 IF length(btrim(coalesce(_first,'')))=0 OR length(btrim(coalesce(_last,'')))=0 OR length(_first)>60 OR length(_last)>60 THEN RAISE EXCEPTION 'First and last names are required'; END IF;
 IF _rate_key IS NULL OR length(_rate_key)<>64 THEN RAISE EXCEPTION 'Invalid signup request'; END IF;
 INSERT INTO public.referral_signup_limits(rate_key,window_start,attempts) VALUES(_rate_key,now(),1)
 ON CONFLICT(rate_key) DO UPDATE SET window_start=CASE WHEN referral_signup_limits.window_start<now()-interval '1 hour' THEN now() ELSE referral_signup_limits.window_start END,
 attempts=CASE WHEN referral_signup_limits.window_start<now()-interval '1 hour' THEN 1 ELSE referral_signup_limits.attempts+1 END RETURNING attempts INTO count_attempts;
 IF count_attempts>30 THEN RETURN jsonb_build_object('limited',true); END IF;
 result:=public.register_referral_employee(s.org_id,s.id,btrim(_first)||' '||btrim(_last),_role,NULL,_email,_phone);
 SELECT * INTO o FROM public.organizations WHERE id=s.org_id;
 RETURN result||jsonb_build_object('orgSlug',o.slug);
END $$;
REVOKE ALL ON FUNCTION public.referral_employee_signup(uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.referral_employee_signup(uuid,text,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.import_referral_employees(_org uuid,_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; result jsonb; results jsonb:='[]'; inserted integer:=0; skipped integer:=0; failed integer:=0; row_number integer:=0;
BEGIN
 IF NOT public.can_manage_referrals(_org,auth.uid()) THEN RAISE EXCEPTION 'Only HR and admins can import employees'; END IF;
 IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)>250 THEN RAISE EXCEPTION 'Import at most 250 rows per batch'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  row_number:=row_number+1;
  BEGIN
   result:=public.register_referral_employee(_org,(item->>'store_id')::uuid,item->>'name',item->>'role',item->>'department',item->>'email',item->>'phone');
   IF (result->>'existing')::boolean THEN skipped:=skipped+1; ELSE inserted:=inserted+1; END IF;
   results:=results||jsonb_build_array(jsonb_build_object('row',row_number,'status',CASE WHEN (result->>'existing')::boolean THEN 'duplicate' ELSE 'added' END));
  EXCEPTION WHEN OTHERS THEN
   failed:=failed+1; results:=results||jsonb_build_array(jsonb_build_object('row',row_number,'status','error','error','Could not add this row. Check the store, name, role and contact details.'));
  END;
 END LOOP;
 RETURN jsonb_build_object('inserted',inserted,'skipped',skipped,'failed',failed,'rows',results);
END $$;
REVOKE ALL ON FUNCTION public.import_referral_employees(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_referral_employees(uuid,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.referral_employee_directory(_org uuid,_search text DEFAULT '',_store uuid DEFAULT NULL,_department text DEFAULT NULL,_sort text DEFAULT 'referrals',_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH counts AS (
 SELECT referrer_id,count(*) referrals,count(*) FILTER(WHERE status='hired') hires FROM public.applications
 WHERE org_id=_org AND referrer_id IS NOT NULL AND archived_at IS NULL GROUP BY referrer_id
 ), filtered AS (
 SELECT r.id,r.employee_name,r.store_id,r.department,r.role_title,r.email,r.phone,r.referral_code,r.active,
 coalesce(c.referrals,0) referrals,coalesce(c.hires,0) hires
 FROM public.referrers r LEFT JOIN counts c ON c.referrer_id=r.id
 WHERE r.org_id=_org AND (_store IS NULL OR r.store_id=_store) AND (_department IS NULL OR r.department=_department)
 AND (coalesce(_search,'')='' OR strpos(lower(concat_ws(' ',r.employee_name,r.role_title,r.department,r.email,r.phone,r.referral_code)),lower(left(_search,120)))>0)
 ), page AS (
 SELECT * FROM filtered ORDER BY CASE WHEN _sort='hires' THEN hires WHEN _sort='referrals' THEN referrals ELSE 0 END DESC,
 CASE WHEN _sort='hires' THEN referrals ELSE hires END DESC,employee_name,id LIMIT 50 OFFSET greatest(0,least(coalesce(_offset,0),1000000))
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.referral_employee_directory(uuid,text,uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.referral_employee_directory(uuid,text,uuid,text,text,integer) TO authenticated,service_role;

CREATE POLICY "Managers edit assigned-store referrers" ON public.referrers FOR UPDATE TO authenticated
 USING ((public.has_org_role(org_id,auth.uid(),'dealer_manager') OR public.has_org_role(org_id,auth.uid(),'hiring_manager')) AND store_id IS NOT NULL AND public.can_access_store(org_id,store_id,auth.uid()))
 WITH CHECK ((public.has_org_role(org_id,auth.uid(),'dealer_manager') OR public.has_org_role(org_id,auth.uid(),'hiring_manager')) AND store_id IS NOT NULL AND public.can_access_store(org_id,store_id,auth.uid()));