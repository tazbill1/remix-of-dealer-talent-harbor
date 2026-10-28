CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.dealerships(id) ON DELETE SET NULL,
  recipient_id uuid NOT NULL,
  type text NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON public.notifications (recipient_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own notifications" ON public.notifications;
CREATE POLICY "read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (recipient_id = auth.uid() AND public.is_org_member(org_id, auth.uid())));
DROP POLICY IF EXISTS "mark own notifications read" ON public.notifications;
CREATE POLICY "mark own notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() AND public.is_org_member(org_id, auth.uid()))
  WITH CHECK (recipient_id = auth.uid());