CREATE TABLE IF NOT EXISTS public.store_texting (
  store_id uuid PRIMARY KEY REFERENCES public.dealerships(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_sid text,
  messaging_service_sid text,
  live boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_texting TO authenticated;
GRANT ALL ON public.store_texting TO service_role;
ALTER TABLE public.store_texting ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform admins manage store texting" ON public.store_texting;
CREATE POLICY "platform admins manage store texting" ON public.store_texting FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- Dealer-safe read: number and on/off only, for stores the caller can access.
CREATE OR REPLACE FUNCTION public.store_texting_status(_org uuid)
RETURNS TABLE(store_id uuid, store_name text, sms_number text, live boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT d.id, d.name, d.sms_number, coalesce(t.live, false)
  FROM public.dealerships d
  LEFT JOIN public.store_texting t ON t.store_id = d.id
  WHERE d.org_id = _org
    AND public.is_org_member(_org, auth.uid())
    AND public.can_access_store(_org, d.id, auth.uid())
  ORDER BY d.name
$$;
REVOKE ALL ON FUNCTION public.store_texting_status(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.store_texting_status(uuid) TO authenticated;

ALTER TABLE public.platform_admins ADD COLUMN IF NOT EXISTS phone text;
DROP POLICY IF EXISTS "admins update own phone" ON public.platform_admins;
CREATE POLICY "admins update own phone" ON public.platform_admins FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());