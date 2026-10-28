-- Bonus tiers by role
CREATE TABLE IF NOT EXISTS public.referral_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  covers text[] NOT NULL DEFAULT '{}',
  excludes text[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_tiers_org_idx ON public.referral_tiers (org_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_tiers TO authenticated;
GRANT ALL ON public.referral_tiers TO service_role;
ALTER TABLE public.referral_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages referral tiers" ON public.referral_tiers FOR ALL TO authenticated
  USING (public.can_manage_referrals(org_id, auth.uid())) WITH CHECK (public.can_manage_referrals(org_id, auth.uid()));
CREATE POLICY "Members read referral tiers" ON public.referral_tiers FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS referral_tier_id uuid REFERENCES public.referral_tiers(id) ON DELETE SET NULL;
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS role_title text;

-- Program settings
ALTER TABLE public.referral_settings
  ADD COLUMN IF NOT EXISTS payout_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS full_time_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_before_hire boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS excluded_roles text[] NOT NULL DEFAULT ARRAY['Director','General Manager','GM','General Sales Manager','GSM','Controller','Corporate Manager','Hiring Manager'],
  ADD COLUMN IF NOT EXISTS drawing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS drawing_amount numeric DEFAULT 1500;
COMMENT ON COLUMN public.referral_settings.bonus_30_amount IS 'DEPRECATED: replaced by referral_tiers (single bonus after payout_days)';
COMMENT ON COLUMN public.referral_settings.bonus_90_amount IS 'DEPRECATED: replaced by referral_tiers (single bonus after payout_days)';
CREATE POLICY "Members read referral settings" ON public.referral_settings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

-- Bonuses: tier locked in, not-eligible status with reason
ALTER TABLE public.referral_bonuses
  ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES public.referral_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier_name text,
  ADD COLUMN IF NOT EXISTS ineligible_reason text;
ALTER TABLE public.referral_bonuses DROP CONSTRAINT IF EXISTS referral_bonuses_status_check;
ALTER TABLE public.referral_bonuses ADD CONSTRAINT referral_bonuses_status_check CHECK (status IN ('pending','paid','void','not_eligible'));

-- Quarterly drawing
CREATE TABLE IF NOT EXISTS public.referral_drawing_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quarter text NOT NULL,
  bonus_id uuid NOT NULL UNIQUE REFERENCES public.referral_bonuses(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_drawing_entries_q_idx ON public.referral_drawing_entries (org_id, quarter);
GRANT SELECT ON public.referral_drawing_entries TO authenticated;
GRANT ALL ON public.referral_drawing_entries TO service_role;
ALTER TABLE public.referral_drawing_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR reads drawing entries" ON public.referral_drawing_entries FOR SELECT TO authenticated
  USING (public.can_manage_referrals(org_id, auth.uid()));
CREATE POLICY "Store staff read assigned-store drawing entries" ON public.referral_drawing_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = applicant_id AND public.is_store_staff_for(a.org_id, a.dealership_id, auth.uid())));

CREATE TABLE IF NOT EXISTS public.referral_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quarter text NOT NULL,
  amount numeric,
  winner_entry_id uuid REFERENCES public.referral_drawing_entries(id) ON DELETE SET NULL,
  entry_count integer NOT NULL DEFAULT 0,
  picked_by uuid,
  picked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, quarter)
);
GRANT SELECT ON public.referral_drawings TO authenticated;
GRANT ALL ON public.referral_drawings TO service_role;
ALTER TABLE public.referral_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read drawings" ON public.referral_drawings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- Pick a random winner (HR only); recorded once per quarter.
CREATE OR REPLACE FUNCTION public.pick_referral_drawing_winner(_org uuid, _quarter text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e uuid; n integer; amt numeric; rid uuid;
BEGIN
  IF NOT public.can_manage_referrals(_org, auth.uid()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM public.referral_drawings WHERE org_id = _org AND quarter = _quarter) THEN RAISE EXCEPTION 'winner already picked'; END IF;
  SELECT count(*) INTO n FROM public.referral_drawing_entries WHERE org_id = _org AND quarter = _quarter;
  IF n = 0 THEN RAISE EXCEPTION 'no entries'; END IF;
  SELECT id INTO e FROM public.referral_drawing_entries WHERE org_id = _org AND quarter = _quarter ORDER BY random() LIMIT 1;
  SELECT drawing_amount INTO amt FROM public.referral_settings WHERE org_id = _org;
  INSERT INTO public.referral_drawings (org_id, quarter, amount, winner_entry_id, entry_count, picked_by)
  VALUES (_org, _quarter, amt, e, n, auth.uid()) RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.pick_referral_drawing_winner(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_referral_drawing_winner(uuid, text) TO authenticated;

-- Word match helper
CREATE OR REPLACE FUNCTION public.referral_word_match(_text text, _words text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(coalesce(_words, '{}')) w
    WHERE btrim(w) <> '' AND coalesce(_text, '') ~* ('\m' || regexp_replace(btrim(w), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M'));
$$;

CREATE OR REPLACE FUNCTION public.suggest_referral_tier(_org uuid, _title text)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT id FROM (
    SELECT id, 0 AS pri, sort_order FROM public.referral_tiers
     WHERE org_id = _org AND NOT is_default AND public.referral_word_match(_title, covers) AND NOT public.referral_word_match(_title, excludes)
    UNION ALL
    SELECT id, 1, sort_order FROM public.referral_tiers WHERE org_id = _org AND is_default
  ) t ORDER BY pri, sort_order LIMIT 1;
$$;

-- Seed example program
CREATE OR REPLACE FUNCTION public.seed_referral_program(_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.referral_settings (org_id) VALUES (_org) ON CONFLICT (org_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.referral_tiers WHERE org_id = _org) THEN
    INSERT INTO public.referral_tiers (org_id, name, amount, covers, excludes, is_default, sort_order) VALUES
      (_org, 'Service Technicians, Body Shop Techs, Painters (excludes Lube & Oil Techs)', 1500, ARRAY['technician','technicians','tech','techs','body shop','collision','painter','paint'], ARRAY['lube','oil'], false, 1),
      (_org, 'Director', 1000, ARRAY['director'], '{}', false, 2),
      (_org, 'General Manager / General Sales Manager', 750, ARRAY['general manager','general sales manager','gm','gsm'], '{}', false, 3),
      (_org, 'Manager', 500, ARRAY['manager'], '{}', false, 4),
      (_org, 'All other roles (includes Lube & Oil Techs)', 250, '{}', '{}', true, 5);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.seed_referral_program(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seed_referral_program_on_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.seed_referral_program(NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS organizations_seed_referral_program ON public.organizations;
CREATE TRIGGER organizations_seed_referral_program AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_referral_program_on_org();

-- Backfill existing groups
SELECT public.seed_referral_program(id) FROM public.organizations;

-- One bonus after payout_days, tier amount locked, eligibility checked
CREATE OR REPLACE FUNCTION public.create_referral_bonuses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.referral_settings; j public.jobs; t public.referral_tiers; r public.referrers; d date; reason text; tid uuid;
BEGIN
  IF NEW.status <> 'hired' OR NEW.referrer_id IS NULL THEN RETURN NEW; END IF;
  IF NOT ((OLD.status IS DISTINCT FROM 'hired') OR (OLD.referrer_id IS DISTINCT FROM NEW.referrer_id)) THEN RETURN NEW; END IF;
  PERFORM public.seed_referral_program(NEW.org_id);
  SELECT * INTO s FROM public.referral_settings WHERE org_id = NEW.org_id;
  SELECT * INTO j FROM public.jobs WHERE id = NEW.job_id;
  SELECT * INTO r FROM public.referrers WHERE id = NEW.referrer_id;
  tid := coalesce(j.referral_tier_id, public.suggest_referral_tier(NEW.org_id, j.title));
  SELECT * INTO t FROM public.referral_tiers WHERE id = tid;
  d := (coalesce(NEW.hired_at, now()))::date;

  IF OLD.status = 'hired' AND OLD.referrer_id IS DISTINCT FROM NEW.referrer_id AND s.require_before_hire THEN
    reason := 'Not eligible: added after hire';
  ELSIF s.full_time_only AND coalesce(j.employment_type, '') <> 'FULL_TIME' THEN
    reason := 'Not eligible: not a full-time hire';
  ELSIF public.referral_word_match(r.role_title, s.excluded_roles) THEN
    reason := 'Not eligible: referrer role (' || r.role_title || ') is excluded';
  END IF;

  INSERT INTO public.referral_bonuses (org_id, applicant_id, referrer_id, amount, payout_stage, due_date, status, tier_id, tier_name, ineligible_reason)
  VALUES (NEW.org_id, NEW.id, NEW.referrer_id, CASE WHEN reason IS NULL THEN t.amount END, '90_day',
          d + coalesce(s.payout_days, 90), CASE WHEN reason IS NULL THEN 'pending' ELSE 'not_eligible' END, t.id, t.name, reason)
  ON CONFLICT (applicant_id, payout_stage) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS applications_referral_bonuses ON public.applications;
CREATE TRIGGER applications_referral_bonuses AFTER UPDATE OF status, referrer_id ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.create_referral_bonuses();