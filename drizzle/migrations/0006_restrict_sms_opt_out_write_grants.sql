REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.sms_opt_outs FROM authenticated;
REVOKE ALL ON public.sms_opt_outs FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.messaging_settings FROM authenticated;
REVOKE ALL ON public.messaging_settings FROM anon;