ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS division text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS req_type text NOT NULL DEFAULT 'replacement',
  ADD COLUMN IF NOT EXISTS target_start_date date,
  ADD COLUMN IF NOT EXISTS hiring_manager text,
  ADD COLUMN IF NOT EXISTS requested_by uuid;

CREATE OR REPLACE FUNCTION public.can_post_jobs(_org uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_uid)
    OR public.has_org_role(_org, _uid, 'group_admin')
    OR public.has_org_role(_org, _uid, 'recruiter')
$$;

DROP POLICY IF EXISTS "members write jobs" ON public.jobs;
CREATE POLICY "hr writes jobs" ON public.jobs FOR ALL TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()))
  WITH CHECK (public.can_post_jobs(org_id, auth.uid()));
CREATE POLICY "members request jobs" ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND status = 'requested');
CREATE POLICY "members edit requests" ON public.jobs FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND status = 'requested')
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND status = 'requested');

CREATE TABLE public.job_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  department text,
  division text NOT NULL DEFAULT 'general',
  employment_type text NOT NULL DEFAULT 'FULL_TIME',
  pay_min numeric,
  pay_max numeric,
  pay_period text NOT NULL DEFAULT 'YEAR',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_templates TO authenticated;
GRANT ALL ON public.job_templates TO service_role;
ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read templates" ON public.job_templates FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "hr manage templates" ON public.job_templates FOR ALL TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()))
  WITH CHECK (public.can_post_jobs(org_id, auth.uid()));