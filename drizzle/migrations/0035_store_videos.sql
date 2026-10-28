CREATE OR REPLACE FUNCTION public.can_manage_store_videos(_org uuid, _store uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_post_jobs(_org, _uid)
    OR (_store IS NOT NULL AND (public.has_org_role(_org, _uid, 'dealer_manager') OR public.has_org_role(_org, _uid, 'hiring_manager'))
        AND public.can_access_store(_org, _store, _uid))
$$;

CREATE TABLE IF NOT EXISTS public.store_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.dealerships(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('welcome', 'thank_you')),
  storage_path text NOT NULL,
  file_name text,
  enabled boolean NOT NULL DEFAULT false,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_videos_one_per_kind UNIQUE NULLS NOT DISTINCT (org_id, store_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_videos TO authenticated;
GRANT ALL ON public.store_videos TO service_role;
ALTER TABLE public.store_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read store videos" ON public.store_videos FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.is_org_member(org_id, auth.uid())
    AND (store_id IS NULL OR public.can_access_store(org_id, store_id, auth.uid()))));
CREATE POLICY "Managers add store videos" ON public.store_videos FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.can_manage_store_videos(org_id, store_id, auth.uid()));
CREATE POLICY "Managers edit store videos" ON public.store_videos FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.can_manage_store_videos(org_id, store_id, auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.can_manage_store_videos(org_id, store_id, auth.uid()));
CREATE POLICY "Managers remove store videos" ON public.store_videos FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.can_manage_store_videos(org_id, store_id, auth.uid()));

-- Files: store-videos/<org_id>/<store_id or 'group'>/<file>
CREATE POLICY "store videos read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'store-videos' AND (public.is_platform_admin(auth.uid()) OR public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())));
CREATE POLICY "store videos upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'store-videos' AND (public.is_platform_admin(auth.uid()) OR public.can_manage_store_videos(((storage.foldername(name))[1])::uuid,
    CASE WHEN (storage.foldername(name))[2] = 'group' THEN NULL ELSE ((storage.foldername(name))[2])::uuid END, auth.uid())));
CREATE POLICY "store videos delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'store-videos' AND (public.is_platform_admin(auth.uid()) OR public.can_manage_store_videos(((storage.foldername(name))[1])::uuid,
    CASE WHEN (storage.foldername(name))[2] = 'group' THEN NULL ELSE ((storage.foldername(name))[2])::uuid END, auth.uid())));