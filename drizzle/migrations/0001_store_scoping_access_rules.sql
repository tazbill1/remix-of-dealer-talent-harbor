CREATE OR REPLACE FUNCTION public.can_access_store(_org uuid, _store uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_uid)
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = _org AND m.user_id = _uid AND m.role IN ('group_admin','recruiter'))
    OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = _org AND m.user_id = _uid
        AND (
          NOT EXISTS (SELECT 1 FROM public.org_member_scopes s WHERE s.member_id = m.id)
          OR EXISTS (
            SELECT 1 FROM public.org_member_scopes s
            LEFT JOIN public.dealerships d ON d.id = _store
            WHERE s.member_id = m.id
              AND (s.dealership_id = _store OR (s.region_id IS NOT NULL AND s.region_id = d.region_id))
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_access_application(_app uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = _app AND public.is_org_member(a.org_id, _uid) AND public.can_access_store(a.org_id, a.dealership_id, _uid)
  )
$$;

-- applications
DROP POLICY IF EXISTS "members manage applications" ON public.applications;
CREATE POLICY "scoped read applications" ON public.applications FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid()));
CREATE POLICY "members add applications" ON public.applications FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid()));
CREATE POLICY "scoped update applications" ON public.applications FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid()));
CREATE POLICY "scoped delete applications" ON public.applications FOR DELETE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid()));

-- application_events
DROP POLICY IF EXISTS "members add events" ON public.application_events;
DROP POLICY IF EXISTS "members read events" ON public.application_events;
CREATE POLICY "scoped add events" ON public.application_events FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid()));
CREATE POLICY "scoped read events" ON public.application_events FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid()));

-- messages
DROP POLICY IF EXISTS "members add messages" ON public.messages;
DROP POLICY IF EXISTS "members read messages" ON public.messages;
CREATE POLICY "scoped add messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid()));
CREATE POLICY "scoped read messages" ON public.messages FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid()));

-- interviews
DROP POLICY IF EXISTS "members manage interviews" ON public.interviews;
CREATE POLICY "scoped manage interviews" ON public.interviews FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid()));

-- retention_checkins
DROP POLICY IF EXISTS "hr manage checkins" ON public.retention_checkins;
DROP POLICY IF EXISTS "members read checkins" ON public.retention_checkins;
CREATE POLICY "hr manage checkins" ON public.retention_checkins FOR ALL TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.can_post_jobs(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "scoped read checkins" ON public.retention_checkins FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid())));

-- candidates
DROP POLICY IF EXISTS "members manage candidates" ON public.candidates;
CREATE POLICY "scoped read candidates" ON public.candidates FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_org_role(org_id, auth.uid(), 'group_admin')
    OR public.has_org_role(org_id, auth.uid(), 'recruiter')
    OR EXISTS (SELECT 1 FROM public.applications a WHERE a.candidate_id = candidates.id AND public.can_access_application(a.id, auth.uid()))
  );
CREATE POLICY "members add candidates" ON public.candidates FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "members update candidates" ON public.candidates FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "hr delete candidates" ON public.candidates FOR DELETE TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- regions
DROP POLICY IF EXISTS "hr manage regions" ON public.regions;
DROP POLICY IF EXISTS "members read regions" ON public.regions;
CREATE POLICY "hr manage regions" ON public.regions FOR ALL TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.can_post_jobs(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "members read regions" ON public.regions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- org_member_scopes
DROP POLICY IF EXISTS "group admins manage scopes" ON public.org_member_scopes;
DROP POLICY IF EXISTS "members read scopes" ON public.org_member_scopes;
CREATE POLICY "group admins manage scopes" ON public.org_member_scopes FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.is_platform_admin(auth.uid()));
CREATE POLICY "members read scopes" ON public.org_member_scopes FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- region delete
ALTER TABLE public.dealerships DROP CONSTRAINT IF EXISTS dealerships_region_id_fkey;
ALTER TABLE public.dealerships ADD CONSTRAINT dealerships_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dealerships_region_id_idx ON public.dealerships(region_id);
CREATE INDEX IF NOT EXISTS org_member_scopes_member_id_idx ON public.org_member_scopes(member_id);

-- one check-in per mark
ALTER TABLE public.retention_checkins ADD CONSTRAINT retention_checkins_app_mark_key UNIQUE (application_id, day_mark);