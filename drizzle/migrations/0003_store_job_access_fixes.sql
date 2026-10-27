-- 1. Stores: replace public read with scoped member read + anon column-limited read
DROP POLICY IF EXISTS "public read stores" ON public.dealerships;

CREATE POLICY "members read stores" ON public.dealerships
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()) OR is_platform_admin(auth.uid()));

CREATE POLICY "anon read store basics" ON public.dealerships
  FOR SELECT TO anon
  USING (true);

REVOKE SELECT ON public.dealerships FROM anon;
GRANT SELECT (id, org_id, name, brand, city, state, address, assistant_name) ON public.dealerships TO anon;

-- 2. Store edits: replace "managers write stores"
DROP POLICY IF EXISTS "managers write stores" ON public.dealerships;

CREATE POLICY "posters add stores" ON public.dealerships
  FOR INSERT TO authenticated
  WITH CHECK (can_post_jobs(org_id, auth.uid()));

CREATE POLICY "posters delete stores" ON public.dealerships
  FOR DELETE TO authenticated
  USING (can_post_jobs(org_id, auth.uid()));

CREATE POLICY "managers update stores" ON public.dealerships
  FOR UPDATE TO authenticated
  USING (
    can_post_jobs(org_id, auth.uid())
    OR (has_org_role(org_id, auth.uid(), 'dealer_manager') AND can_access_store(org_id, id, auth.uid()))
  )
  WITH CHECK (
    can_post_jobs(org_id, auth.uid())
    OR (has_org_role(org_id, auth.uid(), 'dealer_manager') AND can_access_store(org_id, id, auth.uid()))
  );

-- 3. Jobs: scope requests to accessible stores, platform admin reads open jobs
DROP POLICY IF EXISTS "members request jobs" ON public.jobs;
DROP POLICY IF EXISTS "members edit requests" ON public.jobs;
DROP POLICY IF EXISTS "public read open jobs" ON public.jobs;

CREATE POLICY "members request jobs" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(org_id, auth.uid())
    AND can_access_store(org_id, dealership_id, auth.uid())
    AND (can_post_jobs(org_id, auth.uid()) OR status = 'requested')
  );

CREATE POLICY "members edit requests" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    is_org_member(org_id, auth.uid())
    AND can_access_store(org_id, dealership_id, auth.uid())
    AND (can_post_jobs(org_id, auth.uid()) OR status = 'requested')
  )
  WITH CHECK (
    is_org_member(org_id, auth.uid())
    AND can_access_store(org_id, dealership_id, auth.uid())
    AND (can_post_jobs(org_id, auth.uid()) OR status = 'requested')
  );

CREATE POLICY "public read open jobs" ON public.jobs
  FOR SELECT TO anon, authenticated
  USING (status = 'open' OR is_platform_admin(auth.uid()));