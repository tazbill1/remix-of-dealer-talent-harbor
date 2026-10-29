ALTER TABLE public.interview_scorecards
  ADD COLUMN IF NOT EXISTS feedback_rating integer CHECK (feedback_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS feedback_on_time boolean,
  ADD COLUMN IF NOT EXISTS feedback_experience boolean,
  ADD COLUMN IF NOT EXISTS feedback_culture boolean,
  ADD COLUMN IF NOT EXISTS feedback_recommend boolean,
  ADD COLUMN IF NOT EXISTS feedback_recommendation text CHECK (feedback_recommendation IN ('hire','maybe','pass')),
  ADD COLUMN IF NOT EXISTS feedback_notes text,
  ADD COLUMN IF NOT EXISTS feedback_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_event_id uuid REFERENCES public.application_events(id);

CREATE OR REPLACE FUNCTION public.can_interview_feedback(_org uuid, _interview uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.interviews i JOIN public.applications a ON a.id=i.application_id AND a.org_id=i.org_id
  WHERE i.id=_interview AND i.org_id=_org AND (
   public.is_platform_admin(_uid) OR public.has_org_role(_org,_uid,'group_admin') OR public.has_org_role(_org,_uid,'recruiter') OR
   ((public.has_org_role(_org,_uid,'dealer_manager') OR public.has_org_role(_org,_uid,'hiring_manager')) AND public.can_access_store(_org,a.dealership_id,_uid))
  )
 );
$$;
REVOKE ALL ON FUNCTION public.can_interview_feedback(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_interview_feedback(uuid,uuid,uuid) TO authenticated,service_role;

DROP POLICY IF EXISTS "read scorecards" ON public.interview_scorecards;
CREATE POLICY "read scorecards" ON public.interview_scorecards FOR SELECT TO authenticated
USING ((public.is_platform_admin(auth.uid()) OR public.can_access_application(application_id,auth.uid())) AND (feedback_updated_at IS NULL OR public.can_interview_feedback(org_id,interview_id,auth.uid())));

CREATE OR REPLACE FUNCTION public.guard_quick_feedback() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed boolean; summary text;
BEGIN
 IF TG_OP='INSERT' THEN changed := NEW.feedback_updated_at IS NOT NULL OR NEW.feedback_rating IS NOT NULL OR NEW.feedback_on_time IS NOT NULL OR NEW.feedback_experience IS NOT NULL OR NEW.feedback_culture IS NOT NULL OR NEW.feedback_recommend IS NOT NULL OR NEW.feedback_recommendation IS NOT NULL OR NEW.feedback_notes IS NOT NULL OR NEW.feedback_event_id IS NOT NULL;
 ELSE
 changed := ROW(NEW.feedback_rating,NEW.feedback_on_time,NEW.feedback_experience,NEW.feedback_culture,NEW.feedback_recommend,NEW.feedback_recommendation,NEW.feedback_notes,NEW.feedback_updated_at,NEW.feedback_event_id) IS DISTINCT FROM ROW(OLD.feedback_rating,OLD.feedback_on_time,OLD.feedback_experience,OLD.feedback_culture,OLD.feedback_recommend,OLD.feedback_recommendation,OLD.feedback_notes,OLD.feedback_updated_at,OLD.feedback_event_id);
 IF OLD.feedback_updated_at IS NOT NULL AND ROW(NEW.org_id,NEW.interview_id,NEW.application_id,NEW.author_id) IS DISTINCT FROM ROW(OLD.org_id,OLD.interview_id,OLD.application_id,OLD.author_id) THEN RAISE EXCEPTION 'Feedback identity cannot change'; END IF;
 END IF;
 IF NOT changed THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.author_id<>auth.uid() OR NOT public.can_interview_feedback(NEW.org_id,NEW.interview_id,auth.uid()) THEN RAISE EXCEPTION 'You cannot edit feedback for this interview' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.interviews WHERE id=NEW.interview_id AND org_id=NEW.org_id AND application_id=NEW.application_id) THEN RAISE EXCEPTION 'Interview does not match applicant'; END IF;
 IF TG_OP='INSERT' AND NEW.feedback_event_id IS NOT NULL THEN RAISE EXCEPTION 'Feedback event is managed by the app'; END IF;
 IF TG_OP='UPDATE' AND NEW.feedback_event_id IS DISTINCT FROM OLD.feedback_event_id THEN RAISE EXCEPTION 'Feedback event is managed by the app'; END IF;
 IF length(coalesce(NEW.feedback_notes,''))>2000 THEN RAISE EXCEPTION 'Notes must be 2000 characters or fewer'; END IF;
 NEW.feedback_updated_at := now();
 NEW.author_name := coalesce(auth.jwt()->>'email','Interviewer');
 summary := coalesce(NEW.feedback_rating::text,'—') || '/5 · ' || coalesce(initcap(NEW.feedback_recommendation),'No pick') || ' · by ' || NEW.author_name;
 IF NEW.feedback_event_id IS NULL THEN
  INSERT INTO public.application_events(org_id,application_id,kind,message,actor_id) VALUES(NEW.org_id,NEW.application_id,'interview_feedback',summary,auth.uid()) RETURNING id INTO NEW.feedback_event_id;
 ELSE
  UPDATE public.application_events SET message=summary,created_at=now() WHERE id=NEW.feedback_event_id AND org_id=NEW.org_id AND application_id=NEW.application_id AND actor_id=auth.uid() AND kind='interview_feedback';
  IF NOT FOUND THEN RAISE EXCEPTION 'Feedback timeline record is unavailable'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_quick_feedback() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_quick_feedback BEFORE INSERT OR UPDATE ON public.interview_scorecards FOR EACH ROW EXECUTE FUNCTION public.guard_quick_feedback();

CREATE OR REPLACE FUNCTION public.save_interview_feedback(_org uuid,_interview uuid,_rating integer,_on_time boolean,_experience boolean,_culture boolean,_recommend boolean,_recommendation text,_notes text)
RETURNS public.interview_scorecards LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE app uuid; saved public.interview_scorecards;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_interview_feedback(_org,_interview,auth.uid()) THEN RAISE EXCEPTION 'You cannot leave feedback for this interview' USING ERRCODE='42501'; END IF;
 SELECT application_id INTO app FROM public.interviews WHERE id=_interview AND org_id=_org;
 IF app IS NULL THEN RAISE EXCEPTION 'Interview is unavailable'; END IF;
 INSERT INTO public.interview_scorecards(org_id,interview_id,application_id,author_id,feedback_rating,feedback_on_time,feedback_experience,feedback_culture,feedback_recommend,feedback_recommendation,feedback_notes,feedback_updated_at)
 VALUES(_org,_interview,app,auth.uid(),_rating,_on_time,_experience,_culture,_recommend,_recommendation,nullif(btrim(_notes),''),now())
 ON CONFLICT(interview_id,author_id) DO UPDATE SET feedback_rating=EXCLUDED.feedback_rating,feedback_on_time=EXCLUDED.feedback_on_time,feedback_experience=EXCLUDED.feedback_experience,feedback_culture=EXCLUDED.feedback_culture,feedback_recommend=EXCLUDED.feedback_recommend,feedback_recommendation=EXCLUDED.feedback_recommendation,feedback_notes=EXCLUDED.feedback_notes,feedback_updated_at=now(),updated_at=now()
 RETURNING * INTO saved;
 RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.save_interview_feedback(uuid,uuid,integer,boolean,boolean,boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_interview_feedback(uuid,uuid,integer,boolean,boolean,boolean,boolean,text,text) TO authenticated;