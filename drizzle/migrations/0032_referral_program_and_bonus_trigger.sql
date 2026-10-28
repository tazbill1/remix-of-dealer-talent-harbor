CREATE TABLE IF NOT EXISTS public.referral_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  bonus_30_amount numeric,
  bonus_90_amount numeric,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.referral_settings TO authenticated;
GRANT ALL ON public.referral_settings TO service_role;
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages referral settings" ON public.referral_settings FOR ALL TO authenticated
  USING (public.can_manage_referrals(org_id, auth.uid()))
  WITH CHECK (public.can_manage_referrals(org_id, auth.uid()));

ALTER TABLE public.referral_bonuses ADD COLUMN IF NOT EXISTS due_notified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS referral_bonuses_applicant_stage_key ON public.referral_bonuses (applicant_id, payout_stage);

-- When a referred applicant becomes Hired, create pending 30- and 90-day bonuses once.
CREATE OR REPLACE FUNCTION public.create_referral_bonuses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.referral_settings; d date;
BEGIN
  IF NEW.status = 'hired' AND OLD.status IS DISTINCT FROM 'hired' AND NEW.referrer_id IS NOT NULL THEN
    SELECT * INTO s FROM public.referral_settings WHERE org_id = NEW.org_id;
    d := (COALESCE(NEW.hired_at, now()))::date;
    INSERT INTO public.referral_bonuses (org_id, applicant_id, referrer_id, amount, payout_stage, due_date)
    VALUES (NEW.org_id, NEW.id, NEW.referrer_id, s.bonus_30_amount, '30_day', d + 30),
           (NEW.org_id, NEW.id, NEW.referrer_id, s.bonus_90_amount, '90_day', d + 90)
    ON CONFLICT (applicant_id, payout_stage) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS applications_referral_bonuses ON public.applications;
CREATE TRIGGER applications_referral_bonuses AFTER UPDATE OF status ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.create_referral_bonuses();