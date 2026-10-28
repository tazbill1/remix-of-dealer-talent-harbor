CREATE OR REPLACE FUNCTION public.can_access_store(_org uuid, _store uuid, _uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin(_uid)
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = _org AND m.user_id = _uid AND m.role IN ('group_admin','recruiter'))
    OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = _org AND m.user_id = _uid
        AND (
          -- Only regional leaders keep the "no assignments = whole group" fallback; GMs and hiring managers never do.
          (m.role = 'regional_leader' AND NOT EXISTS (SELECT 1 FROM public.org_member_scopes s WHERE s.member_id = m.id))
          OR EXISTS (
            SELECT 1 FROM public.org_member_scopes s
            LEFT JOIN public.dealerships d ON d.id = _store
            WHERE s.member_id = m.id
              AND (s.dealership_id = _store OR (s.region_id IS NOT NULL AND s.region_id = d.region_id))
          )
        )
    )
$function$;

DROP POLICY IF EXISTS "public read open jobs" ON public.jobs;
CREATE POLICY "public read open jobs" ON public.jobs FOR SELECT TO anon USING (status = 'open');
CREATE POLICY "scoped read jobs" ON public.jobs FOR SELECT TO authenticated USING (
  public.is_platform_admin(auth.uid())
  OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid()))
  OR (status = 'open' AND NOT public.is_org_member(org_id, auth.uid()))
);

DROP POLICY IF EXISTS "members read stores" ON public.dealerships;
CREATE POLICY "members read stores" ON public.dealerships FOR SELECT TO authenticated USING (
  public.is_platform_admin(auth.uid())
  OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, id, auth.uid()))
);

DROP POLICY IF EXISTS "members read regions" ON public.regions;
CREATE POLICY "members read regions" ON public.regions FOR SELECT TO authenticated USING (
  public.is_platform_admin(auth.uid())
  OR public.has_org_role(org_id, auth.uid(), 'group_admin')
  OR public.has_org_role(org_id, auth.uid(), 'recruiter')
  OR EXISTS (SELECT 1 FROM public.dealerships d WHERE d.region_id = regions.id AND public.can_access_store(d.org_id, d.id, auth.uid()))
);

DROP POLICY IF EXISTS "org members read resumes" ON storage.objects;
CREATE POLICY "org members read resumes" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'resumes'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND (
    public.is_platform_admin(auth.uid())
    OR public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), 'group_admin')
    OR public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), 'recruiter')
    OR ((storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$' AND public.can_access_application(((storage.foldername(name))[2])::uuid, auth.uid()))
  )
);