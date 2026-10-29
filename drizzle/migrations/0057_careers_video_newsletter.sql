CREATE TABLE IF NOT EXISTS public.careers_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  video_url text,
  video_path text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.careers_settings TO authenticated;
GRANT ALL ON public.careers_settings TO service_role;
ALTER TABLE public.careers_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read careers settings" ON public.careers_settings FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "hr write careers settings" ON public.careers_settings FOR ALL TO authenticated USING (public.can_post_jobs(org_id, auth.uid())) WITH CHECK (public.can_post_jobs(org_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid,
  source text NOT NULL DEFAULT 'careers_site',
  consented_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  UNIQUE (org_id, email)
);
GRANT SELECT ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read newsletter" ON public.newsletter_subscribers FOR SELECT TO authenticated USING (public.can_post_jobs(org_id, auth.uid()));

CREATE POLICY "hr manage careers videos" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'careers-videos' AND public.can_post_jobs(((storage.foldername(name))[1])::uuid, auth.uid()))
  WITH CHECK (bucket_id = 'careers-videos' AND public.can_post_jobs(((storage.foldername(name))[1])::uuid, auth.uid()));