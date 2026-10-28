CREATE OR REPLACE FUNCTION public.is_store_staff_for(_org uuid, _store uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _store IS NOT NULL
     AND (public.has_org_role(_org, _uid, 'dealer_manager')
       OR public.has_org_role(_org, _uid, 'hiring_manager')
       OR public.has_org_role(_org, _uid, 'regional_leader'))
     AND public.can_access_store(_org, _store, _uid)
$$;
COMMENT ON FUNCTION public.is_store_staff_for(uuid, uuid, uuid) IS 'Read-only referral access: GMs, hiring managers and regional leaders, limited to stores they can access (regional leaders: their region).';