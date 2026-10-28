REVOKE ALL ON public.interview_recordings FROM anon,authenticated;
GRANT SELECT ON public.interview_recordings TO authenticated;
ALTER TABLE public.messaging_settings ADD COLUMN recording_ai_paused_reason text;
ALTER TABLE public.interview_recordings ADD COLUMN processing_run_id text;
