DROP POLICY IF EXISTS "public read open jobs" ON public.jobs;

CREATE POLICY "public read open jobs"
ON public.jobs
FOR SELECT
TO anon, authenticated
USING (
  (status = 'open')
  OR is_platform_admin(auth.uid())
  OR (is_org_member(org_id, auth.uid()) AND can_access_store(org_id, dealership_id, auth.uid()))
);