CREATE OR REPLACE FUNCTION public.guard_store_texting_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'dealerships' THEN
    IF (TG_OP = 'INSERT' AND NEW.sms_number IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.sms_number IS DISTINCT FROM OLD.sms_number) THEN
      RAISE EXCEPTION 'Only WerkandMe platform admins can change a store''s texting number';
    END IF;
  ELSIF TG_TABLE_NAME = 'messaging_settings' THEN
    IF (TG_OP = 'INSERT' AND NEW.mode IS DISTINCT FROM 'practice')
       OR (TG_OP = 'UPDATE' AND NEW.mode IS DISTINCT FROM OLD.mode) THEN
      RAISE EXCEPTION 'Only WerkandMe platform admins can turn live texting on or off';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_store_texting_fields ON public.dealerships;
CREATE TRIGGER guard_store_texting_fields BEFORE INSERT OR UPDATE ON public.dealerships
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_texting_fields();
DROP TRIGGER IF EXISTS guard_store_texting_fields ON public.messaging_settings;
CREATE TRIGGER guard_store_texting_fields BEFORE INSERT OR UPDATE ON public.messaging_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_texting_fields();