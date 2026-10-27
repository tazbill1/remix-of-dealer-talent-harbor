ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.dealerships ADD COLUMN IF NOT EXISTS manager_name text;
ALTER TABLE public.dealerships ADD COLUMN IF NOT EXISTS manager_phone text;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  party text NOT NULL CHECK (party IN ('candidate','manager')),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'sms',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read messages" ON public.messages FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "members add messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX messages_app_idx ON public.messages(application_id, created_at);

CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 30,
  location text,
  source text NOT NULL DEFAULT 'werkandme',
  external_event_id text,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage interviews" ON public.interviews FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid())) WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX interviews_org_idx ON public.interviews(org_id, starts_at);

CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  reconnect_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;