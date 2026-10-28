CREATE TABLE IF NOT EXISTS public.referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.dealerships(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  department text,
  email text,
  phone text,
  referral_code text NOT NULL DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrers_referral_code_key UNIQUE (referral_code)
);
CREATE INDEX IF NOT EXISTS referrers_org_store_idx ON public.referrers (org_id, store_id);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS referred_by_text text;
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_referral_source_check;
ALTER TABLE public.applications ADD CONSTRAINT applications_referral_source_check
  CHECK (referral_source IS NULL OR referral_source IN ('link','qr','typed'));
CREATE INDEX IF NOT EXISTS applications_referrer_idx ON public.applications (referrer_id);

CREATE TABLE IF NOT EXISTS public.referral_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  amount numeric,
  payout_stage text NOT NULL CHECK (payout_stage IN ('30_day','90_day')),
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','void')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_bonuses_org_status_due_idx ON public.referral_bonuses (org_id, status, due_date);

-- Keep referrer, applicant and bonus in the same group
CREATE OR REPLACE FUNCTION public.guard_referral_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'applications' THEN
    IF NEW.referrer_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.referrers r WHERE r.id = NEW.referrer_id AND r.org_id = NEW.org_id) THEN
      RAISE EXCEPTION 'Referrer belongs to a different group';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.referrers r WHERE r.id = NEW.referrer_id AND r.org_id = NEW.org_id)
       OR NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = NEW.applicant_id AND a.org_id = NEW.org_id) THEN
      RAISE EXCEPTION 'Referral bonus must match its group';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS applications_referral_org ON public.applications;
CREATE TRIGGER applications_referral_org BEFORE INSERT OR UPDATE OF referrer_id, org_id ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_referral_org();
DROP TRIGGER IF EXISTS referral_bonuses_org ON public.referral_bonuses;
CREATE TRIGGER referral_bonuses_org BEFORE INSERT OR UPDATE ON public.referral_bonuses
  FOR EACH ROW EXECUTE FUNCTION public.guard_referral_org();

-- Who manages referrals: group admins, recruiters (HR), platform admins
CREATE OR REPLACE FUNCTION public.can_manage_referrals(_org uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_uid)
      OR public.has_org_role(_org, _uid, 'group_admin')
      OR public.has_org_role(_org, _uid, 'recruiter')
$$;
-- Store staff (GMs, hiring managers) limited to assigned stores
CREATE OR REPLACE FUNCTION public.is_store_staff_for(_org uuid, _store uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _store IS NOT NULL
     AND (public.has_org_role(_org, _uid, 'dealer_manager') OR public.has_org_role(_org, _uid, 'hiring_manager'))
     AND public.can_access_store(_org, _store, _uid)
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrers TO authenticated;
GRANT ALL ON public.referrers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_bonuses TO authenticated;
GRANT ALL ON public.referral_bonuses TO service_role;
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR manages referrers" ON public.referrers FOR ALL TO authenticated
  USING (public.can_manage_referrals(org_id, auth.uid()))
  WITH CHECK (public.can_manage_referrals(org_id, auth.uid()));
CREATE POLICY "Store staff read assigned-store referrers" ON public.referrers FOR SELECT TO authenticated
  USING (public.is_store_staff_for(org_id, store_id, auth.uid()));

CREATE POLICY "HR manages referral bonuses" ON public.referral_bonuses FOR ALL TO authenticated
  USING (public.can_manage_referrals(org_id, auth.uid()))
  WITH CHECK (public.can_manage_referrals(org_id, auth.uid()));
CREATE POLICY "Store staff read assigned-store bonuses" ON public.referral_bonuses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applications a
    WHERE a.id = applicant_id AND public.is_store_staff_for(a.org_id, a.dealership_id, auth.uid())));

-- Public apply form: look up an active referrer by code, name only
CREATE OR REPLACE FUNCTION public.referrer_by_code(_org uuid, _code text)
RETURNS TABLE(id uuid, employee_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.employee_name FROM public.referrers r
  WHERE r.org_id = _org AND r.active AND r.referral_code = upper(trim(_code))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.referrer_by_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referrer_by_code(uuid, text) TO anon, authenticated, service_role;