CREATE OR REPLACE FUNCTION public.save_interview_feedback(_org uuid,_interview uuid,_rating integer,_on_time boolean,_experience boolean,_culture boolean,_recommend boolean,_recommendation text,_notes text)
RETURNS public.interview_scorecards LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE app uuid; saved public.interview_scorecards; card uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_interview_feedback(_org,_interview,auth.uid()) THEN RAISE EXCEPTION 'You cannot leave feedback for this interview' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_interview::text || auth.uid()::text,0));
 SELECT application_id INTO app FROM public.interviews WHERE id=_interview AND org_id=_org;
 IF app IS NULL THEN RAISE EXCEPTION 'Interview is unavailable'; END IF;
 SELECT id INTO card FROM public.interview_scorecards WHERE interview_id=_interview AND author_id=auth.uid() AND org_id=_org;
 IF card IS NULL THEN
 INSERT INTO public.interview_scorecards(org_id,interview_id,application_id,author_id,feedback_rating,feedback_on_time,feedback_experience,feedback_culture,feedback_recommend,feedback_recommendation,feedback_notes,feedback_updated_at)
 VALUES(_org,_interview,app,auth.uid(),_rating,_on_time,_experience,_culture,_recommend,_recommendation,nullif(btrim(_notes),''),now()) RETURNING * INTO saved;
 ELSE
 UPDATE public.interview_scorecards SET feedback_rating=_rating,feedback_on_time=_on_time,feedback_experience=_experience,feedback_culture=_culture,feedback_recommend=_recommend,feedback_recommendation=_recommendation,feedback_notes=nullif(btrim(_notes),''),feedback_updated_at=now(),updated_at=now()
 WHERE id=card RETURNING * INTO saved;
 END IF;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'Feedback was not saved' USING ERRCODE='42501'; END IF;
 RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.save_interview_feedback(uuid,uuid,integer,boolean,boolean,boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_interview_feedback(uuid,uuid,integer,boolean,boolean,boolean,boolean,text,text) TO authenticated;