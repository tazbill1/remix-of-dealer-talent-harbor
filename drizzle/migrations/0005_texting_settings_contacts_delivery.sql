CREATE TABLE public.messaging_settings (
 org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 mode text NOT NULL DEFAULT 'practice' CHECK (mode IN ('practice','live')),
 send_start time NOT NULL DEFAULT '08:00',
 send_end time NOT NULL DEFAULT '18:00',
 send_days int[] NOT NULL DEFAULT '{1,2,3,4,5,6}' CHECK (send_days <@ ARRAY[1,2,3,4,5,6,7]),
 nudge_after_hours int NOT NULL DEFAULT 4,
 escalate_after_hours int NOT NULL DEFAULT 24,
 ai_provider text NOT NULL DEFAULT 'lovable' CHECK (ai_provider IN ('lovable','anthropic')),
 updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messaging_settings TO authenticated;
GRANT ALL ON public.messaging_settings TO service_role;
ALTER TABLE public.messaging_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read messaging settings" ON public.messaging_settings FOR SELECT TO authenticated USING (is_org_member(org_id, auth.uid()) OR is_platform_admin(auth.uid()));
CREATE POLICY "hr add messaging settings" ON public.messaging_settings FOR INSERT TO authenticated WITH CHECK (has_org_role(org_id, auth.uid(), 'group_admin') OR has_org_role(org_id, auth.uid(), 'recruiter') OR is_platform_admin(auth.uid()));
CREATE POLICY "hr update messaging settings" ON public.messaging_settings FOR UPDATE TO authenticated USING (has_org_role(org_id, auth.uid(), 'group_admin') OR has_org_role(org_id, auth.uid(), 'recruiter') OR is_platform_admin(auth.uid())) WITH CHECK (has_org_role(org_id, auth.uid(), 'group_admin') OR has_org_role(org_id, auth.uid(), 'recruiter') OR is_platform_admin(auth.uid()));
ALTER TABLE public.dealerships ADD COLUMN sms_number text, ADD COLUMN timezone text NOT NULL DEFAULT 'America/Chicago', ADD COLUMN escalation_name text, ADD COLUMN escalation_phone text;
ALTER TABLE public.jobs ADD COLUMN hiring_manager_phone text, ADD COLUMN escalation_name text, ADD COLUMN escalation_phone text;
ALTER TABLE public.messages ADD COLUMN status text NOT NULL DEFAULT 'logged', ADD COLUMN purpose text, ADD COLUMN to_phone text, ADD COLUMN from_phone text, ADD COLUMN provider text, ADD COLUMN provider_message_id text, ADD COLUMN error text, ADD COLUMN scheduled_for timestamptz, ADD COLUMN sent_at timestamptz;
CREATE INDEX messages_status_scheduled_for_idx ON public.messages(status, scheduled_for);
CREATE INDEX messages_provider_message_id_idx ON public.messages(provider_message_id);
CREATE TABLE public.sms_opt_outs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 phone text NOT NULL,
 opted_out_at timestamptz NOT NULL DEFAULT now(),
 source text,
 UNIQUE (org_id, phone)
);
GRANT SELECT ON public.sms_opt_outs TO authenticated;
GRANT ALL ON public.sms_opt_outs TO service_role;
ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read sms opt outs" ON public.sms_opt_outs FOR SELECT TO authenticated USING (is_org_member(org_id, auth.uid()) OR is_platform_admin(auth.uid()));