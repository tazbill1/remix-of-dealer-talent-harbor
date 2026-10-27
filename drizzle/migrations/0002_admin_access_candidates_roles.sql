-- 1. platform admin access
DROP POLICY IF EXISTS "scoped read applications" ON public.applications;
DROP POLICY IF EXISTS "members add applications" ON public.applications;
DROP POLICY IF EXISTS "scoped update applications" ON public.applications;
DROP POLICY IF EXISTS "scoped delete applications" ON public.applications;
CREATE POLICY "scoped read applications" ON public.applications FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid())));
CREATE POLICY "members add applications" ON public.applications FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid())));
CREATE POLICY "scoped update applications" ON public.applications FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid())))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid())));
CREATE POLICY "scoped delete applications" ON public.applications FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_store(org_id, dealership_id, auth.uid())));

DROP POLICY IF EXISTS "scoped add events" ON public.application_events;
DROP POLICY IF EXISTS "scoped read events" ON public.application_events;
CREATE POLICY "scoped add events" ON public.application_events FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid())));
CREATE POLICY "scoped read events" ON public.application_events FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid())));

DROP POLICY IF EXISTS "scoped add messages" ON public.messages;
DROP POLICY IF EXISTS "scoped read messages" ON public.messages;
CREATE POLICY "scoped add messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid())));
CREATE POLICY "scoped read messages" ON public.messages FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid())));

DROP POLICY IF EXISTS "scoped manage interviews" ON public.interviews;
CREATE POLICY "scoped manage interviews" ON public.interviews FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid())))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid()) AND public.can_access_application(application_id, auth.uid())));

-- 2. candidates update
DROP POLICY IF EXISTS "members update candidates" ON public.candidates;
CREATE POLICY "scoped update candidates" ON public.candidates FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_org_role(org_id, auth.uid(), 'group_admin')
    OR public.has_org_role(org_id, auth.uid(), 'recruiter')
    OR EXISTS (SELECT 1 FROM public.applications a WHERE a.candidate_id = candidates.id AND public.can_access_application(a.id, auth.uid()))
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.has_org_role(org_id, auth.uid(), 'group_admin')
    OR public.has_org_role(org_id, auth.uid(), 'recruiter')
    OR EXISTS (SELECT 1 FROM public.applications a WHERE a.candidate_id = candidates.id AND public.can_access_application(a.id, auth.uid()))
  );

-- 3. org_members
DROP POLICY IF EXISTS "group admins manage members" ON public.org_members;
CREATE POLICY "group admins add members" ON public.org_members FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.is_platform_admin(auth.uid()));
CREATE POLICY "group admins update members" ON public.org_members FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.is_platform_admin(auth.uid()));
CREATE POLICY "group admins remove members" ON public.org_members FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_org_member_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'A membership cannot be moved to another group or person';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role AND _uid IS NOT NULL AND OLD.user_id = _uid AND NOT public.is_platform_admin(_uid) THEN
      RAISE EXCEPTION 'You cannot change your own role';
    END IF;
    IF OLD.role = 'group_admin' AND NEW.role <> 'group_admin' AND NOT EXISTS (
      SELECT 1 FROM public.org_members WHERE org_id = OLD.org_id AND role = 'group_admin' AND id <> OLD.id) THEN
      RAISE EXCEPTION 'A group must keep at least one group admin';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.role = 'group_admin'
       AND EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.org_id)
       AND NOT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = OLD.org_id AND role = 'group_admin' AND id <> OLD.id) THEN
      RAISE EXCEPTION 'A group must keep at least one group admin';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_org_member ON public.org_members;
CREATE TRIGGER trg_guard_org_member BEFORE UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_member_change();