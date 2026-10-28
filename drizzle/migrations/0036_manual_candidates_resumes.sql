ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS resume_url text,
  ADD COLUMN IF NOT EXISTS resume_file_name text,
  ADD COLUMN IF NOT EXISTS created_manually boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid;

DROP POLICY IF EXISTS "members add applications" ON public.applications;
CREATE POLICY "members add applications" ON public.applications FOR INSERT TO authenticated
WITH CHECK (
  (is_platform_admin(auth.uid()) OR (is_org_member(org_id, auth.uid()) AND can_access_store(org_id, dealership_id, auth.uid())))
  AND (created_by IS NULL OR created_by = auth.uid())
  AND (NOT created_manually OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "org members upload resumes" ON storage.objects;
CREATE POLICY "org members upload resumes" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND lower(name) ~ '\.(pdf|doc|docx)$'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  AND (
    is_platform_admin(auth.uid())
    OR (is_org_member(((storage.foldername(name))[1])::uuid, auth.uid()) AND (
      has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), 'group_admin'::org_role)
      OR has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), 'recruiter'::org_role)
      OR (((storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$') AND can_access_application(((storage.foldername(name))[2])::uuid, auth.uid()))
    ))
  )
);