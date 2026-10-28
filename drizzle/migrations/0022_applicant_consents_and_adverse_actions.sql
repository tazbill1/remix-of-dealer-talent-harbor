CREATE TABLE public.applicant_consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 store_id uuid REFERENCES public.dealerships(id) ON DELETE RESTRICT,
 applicant_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE RESTRICT,
 consent_type text NOT NULL CHECK (consent_type IN ('sms','ai_screening','background_check','recording','privacy_notice')),
 granted boolean NOT NULL,
 consent_text text NOT NULL,
 consent_version text NOT NULL DEFAULT 'v1',
 source text NOT NULL DEFAULT 'careers_site' CHECK (source IN ('careers_site','sms_reply','staff_entry')),
 ip_address text,
 user_agent text,
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revoked_source text,
 created_by uuid
);
GRANT SELECT, INSERT ON public.applicant_consents TO authenticated;
GRANT UPDATE (revoked_at, revoked_source) ON public.applicant_consents TO authenticated;
GRANT ALL ON public.applicant_consents TO service_role;
REVOKE ALL ON public.applicant_consents FROM anon;
ALTER TABLE public.applicant_consents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.adverse_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 store_id uuid REFERENCES public.dealerships(id) ON DELETE RESTRICT,
 applicant_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'pre_notice_pending' CHECK (status IN ('pre_notice_pending','pre_notice_sent','waiting_period','final_notice_sent','cancelled')),
 reason text,
 pre_notice_sent_at timestamptz,
 waiting_period_ends_at timestamptz,
 final_notice_sent_at timestamptz,
 report_copy_provided boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.adverse_actions TO authenticated;
GRANT ALL ON public.adverse_actions TO service_role;
REVOKE ALL ON public.adverse_actions FROM anon;
ALTER TABLE public.adverse_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX applicant_consents_applicant_type_idx ON public.applicant_consents(applicant_id, consent_type);
CREATE INDEX applicant_consents_org_granted_idx ON public.applicant_consents(org_id, granted_at);
CREATE INDEX adverse_actions_org_status_idx ON public.adverse_actions(org_id, status);
CREATE INDEX adverse_actions_applicant_idx ON public.adverse_actions(applicant_id);
CREATE UNIQUE INDEX adverse_actions_one_open_per_applicant ON public.adverse_actions(applicant_id) WHERE status NOT IN ('final_notice_sent','cancelled');

CREATE FUNCTION public.can_read_compliance_record(_org uuid, _store uuid, _app uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT public.is_platform_admin(_uid)
 OR public.has_org_role(_org, _uid, 'group_admin')
 OR public.has_org_role(_org, _uid, 'recruiter')
 OR EXISTS (
  SELECT 1 FROM public.org_members m
  JOIN public.org_member_scopes s ON s.member_id=m.id AND s.org_id=_org
  JOIN public.applications a ON a.id=_app AND a.org_id=_org
  JOIN public.dealerships d ON d.id=coalesce(_store,a.dealership_id) AND d.org_id=_org
  WHERE m.org_id=_org AND m.user_id=_uid AND m.role IN ('dealer_manager','hiring_manager')
  AND (s.dealership_id=d.id OR (s.region_id IS NOT NULL AND s.region_id=d.region_id))
 );
$$;
REVOKE ALL ON FUNCTION public.can_read_compliance_record(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_compliance_record(uuid,uuid,uuid,uuid) TO authenticated, service_role;

CREATE POLICY "read consent records" ON public.applicant_consents FOR SELECT TO authenticated
 USING (public.can_read_compliance_record(org_id,store_id,applicant_id,auth.uid()));
CREATE POLICY "staff enter consent records" ON public.applicant_consents FOR INSERT TO authenticated
 WITH CHECK ((public.has_org_role(org_id,auth.uid(),'group_admin') OR public.has_org_role(org_id,auth.uid(),'recruiter')) AND source='staff_entry' AND created_by=auth.uid());
CREATE POLICY "staff revoke consent records" ON public.applicant_consents FOR UPDATE TO authenticated
 USING (public.has_org_role(org_id,auth.uid(),'group_admin') OR public.has_org_role(org_id,auth.uid(),'recruiter'))
 WITH CHECK (public.has_org_role(org_id,auth.uid(),'group_admin') OR public.has_org_role(org_id,auth.uid(),'recruiter'));
CREATE POLICY "read adverse actions" ON public.adverse_actions FOR SELECT TO authenticated
 USING (public.can_read_compliance_record(org_id,store_id,applicant_id,auth.uid()));
CREATE POLICY "staff create adverse actions" ON public.adverse_actions FOR INSERT TO authenticated
 WITH CHECK ((public.has_org_role(org_id,auth.uid(),'group_admin') OR public.has_org_role(org_id,auth.uid(),'recruiter')) AND created_by=auth.uid());
CREATE POLICY "staff update adverse actions" ON public.adverse_actions FOR UPDATE TO authenticated
 USING (public.has_org_role(org_id,auth.uid(),'group_admin') OR public.has_org_role(org_id,auth.uid(),'recruiter'))
 WITH CHECK (public.has_org_role(org_id,auth.uid(),'group_admin') OR public.has_org_role(org_id,auth.uid(),'recruiter'));

CREATE FUNCTION public.guard_compliance_record() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Compliance records cannot be deleted'; END IF;
 IF TG_TABLE_NAME='applicant_consents' AND TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'revoked_at'-'revoked_source') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at'-'revoked_source') THEN
   RAISE EXCEPTION 'Only revoked_at and revoked_source may change';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revoked_source IS DISTINCT FROM OLD.revoked_source) THEN
   RAISE EXCEPTION 'Recorded consent withdrawal cannot be changed';
  END IF;
  IF NEW.revoked_at IS NULL AND NEW.revoked_source IS NOT NULL THEN
   RAISE EXCEPTION 'revoked_source requires revoked_at';
  END IF;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id=NEW.applicant_id AND a.org_id=NEW.org_id AND (NEW.store_id IS NULL OR a.dealership_id=NEW.store_id)) THEN
  RAISE EXCEPTION 'Applicant and store must belong to the specified organization and application';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_compliance_record() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_applicant_consents BEFORE INSERT OR UPDATE OR DELETE ON public.applicant_consents FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_record();
CREATE TRIGGER guard_adverse_actions BEFORE INSERT OR UPDATE OR DELETE ON public.adverse_actions FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_record();

CREATE FUNCTION public.five_business_days_after(_start timestamptz) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public AS $$
DECLARE next_time timestamp := _start AT TIME ZONE 'UTC'; days integer := 0;
BEGIN
 WHILE days < 5 LOOP
  next_time := next_time + interval '1 day';
  IF extract(isodow FROM next_time) < 6 THEN days := days + 1; END IF;
 END LOOP;
 RETURN next_time AT TIME ZONE 'UTC';
END;
$$;
REVOKE ALL ON FUNCTION public.five_business_days_after(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.five_business_days_after(timestamptz) TO authenticated,service_role;
CREATE FUNCTION public.default_adverse_action_times() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.pre_notice_sent_at IS NOT NULL THEN
  IF NEW.waiting_period_ends_at IS NULL OR (TG_OP='UPDATE' AND NEW.pre_notice_sent_at IS DISTINCT FROM OLD.pre_notice_sent_at AND NEW.waiting_period_ends_at IS NOT DISTINCT FROM OLD.waiting_period_ends_at) THEN
   NEW.waiting_period_ends_at := public.five_business_days_after(NEW.pre_notice_sent_at);
  END IF;
 END IF;
 NEW.updated_at := now();
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.default_adverse_action_times() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER default_adverse_action_times BEFORE INSERT OR UPDATE ON public.adverse_actions FOR EACH ROW EXECUTE FUNCTION public.default_adverse_action_times();
COMMENT ON COLUMN public.adverse_actions.waiting_period_ends_at IS 'Defaults to five Monday-Friday business days after pre_notice_sent_at, calculated in UTC; holidays excluded from the calculation only by staff override.';
COMMENT ON TABLE public.applicant_consents IS 'Permanent consent evidence. Only revocation fields may be updated. DELETE is blocked by trigger, including service-role deletes.';
COMMENT ON TABLE public.adverse_actions IS 'Background-check adverse-action tracking only; this table does not send notices or expose internal reasons to candidates.';