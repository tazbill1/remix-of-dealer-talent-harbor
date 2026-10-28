-- 1) Normalized matching keys
CREATE OR REPLACE FUNCTION public.norm_email(_e text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS
$$ SELECT nullif(lower(btrim(coalesce(_e, ''))), '') $$;
CREATE OR REPLACE FUNCTION public.norm_phone(_p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS
$$ SELECT CASE WHEN length(regexp_replace(coalesce(_p, ''), '\D', '', 'g')) >= 10 THEN right(regexp_replace(_p, '\D', '', 'g'), 10) END $$;
CREATE OR REPLACE FUNCTION public.norm_name(_n text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS
$$ SELECT nullif(regexp_replace(lower(btrim(coalesce(_n, ''))), '\s+', ' ', 'g'), '') $$;

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS email_norm text GENERATED ALWAYS AS (public.norm_email(email)) STORED;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS phone_norm text GENERATED ALWAYS AS (public.norm_phone(phone)) STORED;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.applications(id);
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS email_norm text GENERATED ALWAYS AS (public.norm_email(email)) STORED;
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS phone_norm text GENERATED ALWAYS AS (public.norm_phone(phone)) STORED;
CREATE INDEX IF NOT EXISTS applications_org_email_norm ON public.applications(org_id, email_norm);
CREATE INDEX IF NOT EXISTS applications_org_phone_norm ON public.applications(org_id, phone_norm);

-- 2) Possible duplicates
CREATE TABLE IF NOT EXISTS public.possible_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_a_type text NOT NULL CHECK (record_a_type IN ('application','referrer','team_member')),
  record_a_id uuid NOT NULL,
  record_b_type text NOT NULL CHECK (record_b_type IN ('application','referrer','team_member')),
  record_b_id uuid NOT NULL,
  store_a_id uuid, store_b_id uuid,
  match_reason text NOT NULL CHECK (match_reason IN ('same_email','same_phone','same_name_phone')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','merged','not_duplicate')),
  kept_id uuid,
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, record_a_type, record_a_id, record_b_type, record_b_id)
);
CREATE INDEX IF NOT EXISTS possible_duplicates_org_status ON public.possible_duplicates(org_id, status);
GRANT SELECT ON public.possible_duplicates TO authenticated;
GRANT ALL ON public.possible_duplicates TO service_role;
ALTER TABLE public.possible_duplicates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "HR and assigned managers read possible duplicates" ON public.possible_duplicates;
CREATE POLICY "HR and assigned managers read possible duplicates" ON public.possible_duplicates FOR SELECT TO authenticated
USING (public.can_post_jobs(org_id, auth.uid())
  OR ((public.has_org_role(org_id, auth.uid(), 'dealer_manager') OR public.has_org_role(org_id, auth.uid(), 'hiring_manager'))
      AND ((store_a_id IS NOT NULL AND public.can_access_store(org_id, store_a_id, auth.uid()))
        OR (store_b_id IS NOT NULL AND public.can_access_store(org_id, store_b_id, auth.uid())))));

-- All person-like records in one place (archived applications excluded)
CREATE OR REPLACE FUNCTION public.person_records(_org uuid)
RETURNS TABLE(rtype text, rid uuid, store_id uuid, name_n text, email_n text, phone_n text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'application', a.id, a.dealership_id, public.norm_name(a.full_name), a.email_norm, a.phone_norm
    FROM public.applications a WHERE a.org_id = _org AND a.archived_at IS NULL
  UNION ALL
  SELECT 'referrer', r.id, r.store_id, public.norm_name(r.employee_name), r.email_norm, r.phone_norm
    FROM public.referrers r WHERE r.org_id = _org
  UNION ALL
  SELECT 'team_member', m.id, NULL, NULL, public.norm_email(m.email), NULL
    FROM public.org_members m WHERE m.org_id = _org
$$;
REVOKE EXECUTE ON FUNCTION public.person_records(uuid) FROM PUBLIC, anon, authenticated;

-- Record matches for one record against the rest of its org (never across orgs)
CREATE OR REPLACE FUNCTION public.detect_duplicates_for(_org uuid, _type text, _id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare me record; n integer;
begin
  select * into me from public.person_records(_org) p where p.rtype = _type and p.rid = _id;
  if me.rid is null then return 0; end if;
  insert into public.possible_duplicates(org_id, record_a_type, record_a_id, record_b_type, record_b_id, store_a_id, store_b_id, match_reason)
  select _org,
    case when (me.rtype || me.rid::text) < (o.rtype || o.rid::text) then me.rtype else o.rtype end,
    case when (me.rtype || me.rid::text) < (o.rtype || o.rid::text) then me.rid else o.rid end,
    case when (me.rtype || me.rid::text) < (o.rtype || o.rid::text) then o.rtype else me.rtype end,
    case when (me.rtype || me.rid::text) < (o.rtype || o.rid::text) then o.rid else me.rid end,
    case when (me.rtype || me.rid::text) < (o.rtype || o.rid::text) then me.store_id else o.store_id end,
    case when (me.rtype || me.rid::text) < (o.rtype || o.rid::text) then o.store_id else me.store_id end,
    case when me.email_n is not null and me.email_n = o.email_n then 'same_email'
         when me.phone_n = o.phone_n and me.name_n = o.name_n then 'same_name_phone'
         else 'same_phone' end
  from public.person_records(_org) o
  where not (o.rtype = me.rtype and o.rid = me.rid)
    and ((me.email_n is not null and me.email_n = o.email_n) or (me.phone_n is not null and me.phone_n = o.phone_n))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
REVOKE EXECUTE ON FUNCTION public.detect_duplicates_for(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.detect_duplicates_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  perform public.detect_duplicates_for(new.org_id, TG_ARGV[0], new.id);
  return null;
end $$;
DROP TRIGGER IF EXISTS applications_detect_duplicates ON public.applications;
CREATE TRIGGER applications_detect_duplicates AFTER INSERT OR UPDATE OF email, phone, full_name ON public.applications
  FOR EACH ROW WHEN (new.archived_at IS NULL) EXECUTE FUNCTION public.detect_duplicates_trigger('application');
DROP TRIGGER IF EXISTS referrers_detect_duplicates ON public.referrers;
CREATE TRIGGER referrers_detect_duplicates AFTER INSERT OR UPDATE OF email, phone, employee_name ON public.referrers
  FOR EACH ROW EXECUTE FUNCTION public.detect_duplicates_trigger('referrer');
DROP TRIGGER IF EXISTS org_members_detect_duplicates ON public.org_members;
CREATE TRIGGER org_members_detect_duplicates AFTER INSERT OR UPDATE OF email ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.detect_duplicates_trigger('team_member');

-- Backfill existing data
DO $$ declare r record; begin
  for r in select o.id org, p.rtype, p.rid from public.organizations o, lateral public.person_records(o.id) p loop
    perform public.detect_duplicates_for(r.org, r.rtype, r.rid);
  end loop;
end $$;

-- 3) Consent records may only be re-pointed during a merge (inside the merge function, never from the app)
CREATE OR REPLACE FUNCTION public.guard_compliance_record()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE merging boolean := current_setting('app.merging', true) = 'on' AND current_user IN ('postgres','supabase_admin');
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Compliance records cannot be deleted'; END IF;
 IF TG_TABLE_NAME='applicant_consents' AND TG_OP='UPDATE' THEN
  IF merging THEN
   IF (to_jsonb(NEW)-'applicant_id'-'store_id') IS DISTINCT FROM (to_jsonb(OLD)-'applicant_id'-'store_id') THEN
    RAISE EXCEPTION 'A merge may only re-point consent records';
   END IF;
  ELSE
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
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id=NEW.applicant_id AND a.org_id=NEW.org_id AND (NEW.store_id IS NULL OR a.dealership_id=NEW.store_id)) THEN
  RAISE EXCEPTION 'Applicant and store must belong to the specified organization and application';
 END IF;
 RETURN NEW;
END;
$function$;

-- Merge two applicant records: keep one, move everything from the other, archive it.
CREATE OR REPLACE FUNCTION public.merge_duplicate(_dup uuid, _keep uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare d public.possible_duplicates; k public.applications; o public.applications; uid uuid := auth.uid(); other uuid;
begin
  select * into d from public.possible_duplicates where id = _dup for update;
  if d.id is null then raise exception 'Possible duplicate not found'; end if;
  if not public.can_post_jobs(d.org_id, uid) then raise exception 'Only HR / Recruiters and group admins can merge'; end if;
  if d.status <> 'open' then raise exception 'This possible duplicate was already reviewed'; end if;
  if d.record_a_type <> 'application' or d.record_b_type <> 'application' then
    raise exception 'Only two applicant records can be merged; mark this one as not a duplicate or handle it by hand';
  end if;
  if _keep not in (d.record_a_id, d.record_b_id) then raise exception 'Keep must be one of the two records'; end if;
  other := case when _keep = d.record_a_id then d.record_b_id else d.record_a_id end;
  select * into k from public.applications where id = _keep and org_id = d.org_id for update;
  select * into o from public.applications where id = other and org_id = d.org_id for update;
  if k.id is null or o.id is null then raise exception 'Both records must be in this group'; end if;
  if k.archived_at is not null or o.archived_at is not null then raise exception 'One of these records was already merged'; end if;

  perform set_config('app.merging', 'on', true);
  update public.application_events set application_id = k.id where application_id = o.id;
  update public.messages set application_id = k.id where application_id = o.id;
  update public.interviews set application_id = k.id where application_id = o.id;
  update public.interview_scorecards set application_id = k.id where application_id = o.id;
  update public.offers set application_id = k.id where application_id = o.id;
  update public.notifications set application_id = k.id where application_id = o.id;
  update public.retention_checkins r set application_id = k.id where r.application_id = o.id
    and not exists (select 1 from public.retention_checkins x where x.application_id = k.id and x.day_mark = r.day_mark);
  update public.referral_bonuses b set applicant_id = k.id where b.applicant_id = o.id
    and not exists (select 1 from public.referral_bonuses x where x.applicant_id = k.id and x.payout_stage = b.payout_stage);
  update public.referral_drawing_entries set applicant_id = k.id where applicant_id = o.id;
  update public.applicant_consents set applicant_id = k.id, store_id = case when store_id is null then null else k.dealership_id end where applicant_id = o.id;
  update public.adverse_actions set applicant_id = k.id, store_id = case when store_id is null then null else k.dealership_id end where applicant_id = o.id;
  update public.interview_recordings set applicant_id = k.id, store_id = k.dealership_id where applicant_id = o.id;
  update public.onboarding_checklists set application_id = k.id where application_id = o.id
    and not exists (select 1 from public.onboarding_checklists x where x.application_id = k.id);
  perform set_config('app.merging', 'off', true);

  update public.applications set
    status = case when o.status = 'do_not_hire' then 'do_not_hire'::application_status else k.status end,
    phone = coalesce(k.phone, o.phone),
    linkedin_url = coalesce(k.linkedin_url, o.linkedin_url),
    resume_path = coalesce(k.resume_path, o.resume_path),
    resume_file_name = case when k.resume_path is null then o.resume_file_name else k.resume_file_name end,
    resume_url = coalesce(k.resume_url, o.resume_url),
    referrer_id = coalesce(k.referrer_id, o.referrer_id),
    referral_source = coalesce(k.referral_source, o.referral_source),
    referred_by_text = coalesce(k.referred_by_text, o.referred_by_text),
    candidate_id = coalesce(k.candidate_id, o.candidate_id),
    notes = nullif(concat_ws(E'\n\n', k.notes, case when o.notes is not null then 'From merged record: ' || o.notes end), '')
  where id = k.id;
  update public.applications set archived_at = now(), merged_into_id = k.id where id = o.id;

  insert into public.application_events(org_id, application_id, kind, message, actor_id) values
    (d.org_id, k.id, 'merge', 'Merged duplicate record ' || o.full_name || ' (' || coalesce(o.email, '') || ') into this one', uid);

  update public.possible_duplicates set status = 'merged', kept_id = k.id, reviewed_by = uid, reviewed_at = now() where id = d.id;
  -- Other open matches involving the archived record are no longer relevant
  update public.possible_duplicates set status = 'merged', kept_id = k.id, reviewed_by = uid, reviewed_at = now()
    where org_id = d.org_id and status = 'open' and id <> d.id
      and ((record_a_type = 'application' and record_a_id = o.id) or (record_b_type = 'application' and record_b_id = o.id));
  return k.id;
end $$;
REVOKE EXECUTE ON FUNCTION public.merge_duplicate(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_duplicate(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_not_duplicate(_dup uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare d public.possible_duplicates;
begin
  select * into d from public.possible_duplicates where id = _dup for update;
  if d.id is null then raise exception 'Possible duplicate not found'; end if;
  if not public.can_post_jobs(d.org_id, auth.uid()) then raise exception 'Only HR / Recruiters and group admins can review duplicates'; end if;
  if d.status <> 'open' then raise exception 'This possible duplicate was already reviewed'; end if;
  update public.possible_duplicates set status = 'not_duplicate', reviewed_by = auth.uid(), reviewed_at = now() where id = d.id;
  return true;
end $$;
REVOKE EXECUTE ON FUNCTION public.mark_not_duplicate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_not_duplicate(uuid) TO authenticated;