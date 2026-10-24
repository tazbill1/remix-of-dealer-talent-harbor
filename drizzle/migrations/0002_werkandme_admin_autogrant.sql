CREATE OR REPLACE FUNCTION public.grant_werkandme_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'cody@werkandme.com' THEN
    INSERT INTO public.platform_admins(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_werkandme_admin ON auth.users;
CREATE TRIGGER on_auth_user_werkandme_admin AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_werkandme_admin();
INSERT INTO public.platform_admins(user_id) SELECT id FROM auth.users WHERE lower(email)='cody@werkandme.com' ON CONFLICT DO NOTHING;