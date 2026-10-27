-- 1. Regions
CREATE TABLE public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regions TO authenticated;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read regions" ON public.regions FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "hr manage regions" ON public.regions FOR ALL TO authenticated USING (public.can_post_jobs(org_id, auth.uid())) WITH CHECK (public.can_post_jobs(org_id, auth.uid()));

ALTER TABLE public.dealerships ADD COLUMN region_id uuid REFERENCES public.regions(id);

-- 2. Regional leader role + member scopes
ALTER TYPE public.org_role ADD VALUE 'regional_leader';

CREATE TABLE public.org_member_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  member_id uuid NOT NULL REFERENCES public.org_members(id) ON DELETE CASCADE,
  region_id uuid REFERENCES public.regions(id) ON DELETE CASCADE,
  dealership_id uuid REFERENCES public.dealerships(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_member_scopes TO authenticated;
GRANT ALL ON public.org_member_scopes TO service_role;
ALTER TABLE public.org_member_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read scopes" ON public.org_member_scopes FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "group admins manage scopes" ON public.org_member_scopes FOR ALL TO authenticated USING (public.has_org_role(org_id, auth.uid(), 'group_admin')) WITH CHECK (public.has_org_role(org_id, auth.uid(), 'group_admin'));

-- 3 + 4. Candidates with consent fields
CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  full_name text NOT NULL,
  email text,
  phone text,
  city text,
  sms_opt_in boolean NOT NULL DEFAULT false,
  sms_opt_in_at timestamptz,
  sms_opted_out_at timestamptz,
  email_opted_out_at timestamptz,
  consent_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX candidates_org_email_idx ON public.candidates (org_id, lower(email));
CREATE INDEX candidates_org_phone_idx ON public.candidates (org_id, phone);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage candidates" ON public.candidates FOR ALL TO authenticated USING (public.is_org_member(org_id, auth.uid())) WITH CHECK (public.is_org_member(org_id, auth.uid()));

ALTER TABLE public.applications ADD COLUMN candidate_id uuid REFERENCES public.candidates(id);

-- Backfill: one candidate per distinct email per group, matched by email or phone; email-less applications get their own candidate
DO $$
DECLARE r RECORD; cid uuid;
BEGIN
  FOR r IN SELECT * FROM public.applications WHERE candidate_id IS NULL LOOP
    SELECT id INTO cid FROM public.candidates
      WHERE org_id = r.org_id AND (
        (r.email IS NOT NULL AND r.email <> '' AND email = lower(r.email))
        OR (r.phone IS NOT NULL AND r.phone <> '' AND phone = r.phone)
      ) LIMIT 1;
    IF cid IS NULL THEN
      INSERT INTO public.candidates (org_id, full_name, email, phone)
      VALUES (r.org_id, r.full_name, CASE WHEN r.email IS NULL OR r.email = '' THEN NULL ELSE lower(r.email) END, r.phone)
      RETURNING id INTO cid;
    END IF;
    UPDATE public.applications SET candidate_id = cid WHERE id = r.id;
  END LOOP;
END $$;

-- 5. Retention
ALTER TABLE public.applications
  ADD COLUMN hired_at timestamptz,
  ADD COLUMN start_date date,
  ADD COLUMN departed_at date,
  ADD COLUMN departure_reason text;

CREATE TABLE public.retention_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  day_mark integer NOT NULL CHECK (day_mark IN (30, 60, 90)),
  due_on date NOT NULL,
  sent_at timestamptz,
  still_employed boolean,
  response text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retention_checkins TO authenticated;
GRANT ALL ON public.retention_checkins TO service_role;
ALTER TABLE public.retention_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read checkins" ON public.retention_checkins FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "hr manage checkins" ON public.retention_checkins FOR ALL TO authenticated USING (public.can_post_jobs(org_id, auth.uid())) WITH CHECK (public.can_post_jobs(org_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.set_hired_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF new.status = 'hired' AND old.status IS DISTINCT FROM 'hired' AND new.hired_at IS NULL THEN
    new.hired_at := now();
  END IF;
  RETURN new;
END $fn$;

CREATE TRIGGER trg_app_hired BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_hired_at();

-- 6. Who acted
ALTER TABLE public.application_events ADD COLUMN actor_id uuid DEFAULT auth.uid();