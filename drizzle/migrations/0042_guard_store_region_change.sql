CREATE OR REPLACE FUNCTION public.guard_store_region_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.region_id IS DISTINCT FROM OLD.region_id
     AND auth.uid() IS NOT NULL
     AND NOT (public.is_platform_admin(auth.uid())
              OR public.has_org_role(OLD.org_id, auth.uid(), 'group_admin')
              OR public.has_org_role(OLD.org_id, auth.uid(), 'recruiter')) THEN
    RAISE EXCEPTION 'Only HR / Recruiters and group admins can change a store''s region' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_store_region_change ON public.dealerships;
CREATE TRIGGER guard_store_region_change BEFORE UPDATE OF region_id ON public.dealerships
FOR EACH ROW EXECUTE FUNCTION public.guard_store_region_change();