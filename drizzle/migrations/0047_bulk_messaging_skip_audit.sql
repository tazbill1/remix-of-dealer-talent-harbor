ALTER TABLE public.bulk_sends ADD COLUMN IF NOT EXISTS unavailable_count integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.bulk_sends.unavailable_count IS 'Unknown or unauthorized channel selections recorded on one accessible store audit row, without storing recipient IDs or leaking other stores.';
CREATE OR REPLACE FUNCTION public.audit_bulk_unavailable(_batch uuid,_count integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid;
BEGIN
 IF _count<=0 THEN RETURN; END IF;
 SELECT id INTO target FROM public.bulk_sends WHERE batch_id=_batch AND sender_id=auth.uid() ORDER BY created_at,id LIMIT 1;
 IF target IS NOT NULL THEN
 UPDATE public.bulk_sends SET unavailable_count=unavailable_count+_count,skipped_count=skipped_count+_count,
 skipped_reasons=jsonb_set(skipped_reasons,ARRAY['Applicant unavailable or outside assigned stores'],to_jsonb(coalesce((skipped_reasons->>'Applicant unavailable or outside assigned stores')::integer,0)+_count)) WHERE id=target;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.audit_bulk_unavailable(uuid,integer) FROM PUBLIC,anon,authenticated;
-- Patch only the newly added bulk RPC; no existing sending function changes.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.send_bulk_applicants(uuid,uuid[],text,text,text)'::regprocedure) INTO definition;
 definition:=replace(definition,' SELECT coalesce(sum(sent_count),0) AS sent',' PERFORM public.audit_bulk_unavailable(batch,skipped);'||E'\n SELECT coalesce(sum(sent_count),0) AS sent');
 definition:=replace(definition,'''skipped'',counts.blocked+skipped','''skipped'',greatest(counts.blocked,skipped)');
 EXECUTE definition;
END $migration$;