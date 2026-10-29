CREATE OR REPLACE FUNCTION public.save_quick_interview_feedback(_org uuid,_interview uuid,_feedback jsonb)
RETURNS public.interview_scorecards LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
 SELECT public.save_interview_feedback(_org,_interview,(_feedback->>'rating')::integer,(_feedback->>'onTime')::boolean,(_feedback->>'experience')::boolean,(_feedback->>'culture')::boolean,(_feedback->>'recommend')::boolean,_feedback->>'recommendation',_feedback->>'notes');
$$;
REVOKE ALL ON FUNCTION public.save_quick_interview_feedback(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_quick_interview_feedback(uuid,uuid,jsonb) TO authenticated;