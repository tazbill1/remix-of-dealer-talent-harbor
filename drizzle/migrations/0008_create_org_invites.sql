CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by uuid,
  accepted_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_invites_org_idx ON public.org_invites(org_id);
GRANT SELECT ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Group admins see invites" ON public.org_invites FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.is_platform_admin(auth.uid()));