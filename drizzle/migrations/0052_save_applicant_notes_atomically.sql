CREATE OR REPLACE FUNCTION public.add_applicant_note(_org uuid, _app uuid, _note text) RETURNS public.application_events LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE saved public.application_events; touched uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to save a note'; END IF;
 IF NULLIF(btrim(_note),'') IS NULL OR length(_note)>10000 THEN RAISE EXCEPTION 'Enter a note of up to 10000 characters'; END IF;
 UPDATE public.applications SET notes=CASE WHEN NULLIF(btrim(notes),'') IS NULL THEN btrim(_note) ELSE notes || E'\n\n' || btrim(_note) END WHERE id=_app AND org_id=_org RETURNING id INTO touched;
 IF touched IS NULL THEN RAISE EXCEPTION 'Note was not saved. Check your store access and try again'; END IF;
 INSERT INTO public.application_events(org_id,application_id,kind,message,actor_id) VALUES (_org,_app,'note',btrim(_note),auth.uid()) RETURNING * INTO saved;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.add_applicant_note(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_applicant_note(uuid,uuid,text) TO authenticated;
