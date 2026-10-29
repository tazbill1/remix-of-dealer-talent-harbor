ALTER TABLE public.messaging_settings ADD COLUMN IF NOT EXISTS bulk_messaging_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.bulk_sends (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL,
 org_id uuid NOT NULL REFERENCES public.organizations(id), store_id uuid NOT NULL REFERENCES public.dealerships(id), sender_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel IN ('email','text','both')), subject text, body text NOT NULL,
 selected_count integer NOT NULL DEFAULT 0, sent_count integer NOT NULL DEFAULT 0, skipped_count integer NOT NULL DEFAULT 0, queued_count integer NOT NULL DEFAULT 0,
 skipped_reasons jsonb NOT NULL DEFAULT '{}', is_demo boolean NOT NULL DEFAULT false, email_demo boolean NOT NULL DEFAULT true, text_demo boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
GRANT SELECT ON public.bulk_sends TO authenticated;
GRANT ALL ON public.bulk_sends TO service_role;
ALTER TABLE public.bulk_sends ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.can_bulk_message(_org uuid,_store uuid,_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.dealerships WHERE id=_store AND org_id=_org)
 AND (public.is_platform_admin(_uid) OR public.has_org_role(_org,_uid,'group_admin') OR public.has_org_role(_org,_uid,'recruiter')
 OR ((public.has_org_role(_org,_uid,'dealer_manager') OR public.has_org_role(_org,_uid,'hiring_manager')) AND EXISTS(
 SELECT 1 FROM public.org_members m JOIN public.org_member_scopes s ON s.member_id=m.id WHERE m.org_id=_org AND s.org_id=_org AND m.user_id=_uid AND m.role IN ('dealer_manager','hiring_manager') AND s.dealership_id=_store)))
$$;
REVOKE ALL ON FUNCTION public.can_bulk_message(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_bulk_message(uuid,uuid,uuid) TO authenticated,service_role;
CREATE POLICY "Senders read assigned store bulk history" ON public.bulk_sends FOR SELECT TO authenticated USING(public.can_bulk_message(org_id,store_id,auth.uid()));
COMMENT ON TABLE public.bulk_sends IS 'Server-created audit: one row per store per batch prevents cross-store leakage. Selected counts applicants; sent/skipped/queued count channel deliveries. Live bulk email awaits dedicated provider.';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS bulk_send_id uuid REFERENCES public.bulk_sends(id);
CREATE INDEX IF NOT EXISTS messages_bulk_send_idx ON public.messages(bulk_send_id) WHERE bulk_send_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bulk_sends_org_store_created_idx ON public.bulk_sends(org_id,store_id,created_at DESC);
CREATE INDEX IF NOT EXISTS bulk_sends_batch_idx ON public.bulk_sends(batch_id);
CREATE OR REPLACE FUNCTION public.bulk_phone(_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE d text:=regexp_replace(coalesce(_raw,''),'[^0-9]','','g');
BEGIN
 IF btrim(coalesce(_raw,'')) LIKE '+%' AND length(d) BETWEEN 10 AND 15 THEN RETURN '+'||d; END IF;
 IF length(d)=10 THEN RETURN '+1'||d; END IF;
 IF length(d)=11 AND left(d,1)='1' THEN RETURN '+'||d; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.bulk_next_text_time(_now timestamptz,_zone text,_start time,_end time,_days integer[])
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE local_now timestamp:=_now AT TIME ZONE _zone; dt date; at_time timestamptz; i integer;
BEGIN
 IF extract(isodow FROM local_now)::integer=ANY(_days) AND local_now::time>=_start AND local_now::time<_end THEN RETURN _now; END IF;
 IF _start>=_end OR coalesce(cardinality(_days),0)=0 THEN RETURN NULL; END IF;
 FOR i IN 0..7 LOOP
 dt:=local_now::date+i;
 IF extract(isodow FROM dt)::integer=ANY(_days) THEN at_time:=(dt+_start) AT TIME ZONE _zone; IF at_time>_now THEN RETURN at_time; END IF; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.bulk_render(_text text,_name text,_job text,_store text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT replace(replace(replace(replace(replace(replace(coalesce(_text,''),'{first_name}',coalesce(nullif(split_part(regexp_replace(btrim(_name),'[[:space:]]+',' ','g'),' ',1),''),'there')),'{full_name}',coalesce(_name,'')),'{job_title}',coalesce(_job,'the role')),'{job}',coalesce(_job,'the role')),'{store_name}',coalesce(_store,'our team')),'{store}',coalesce(_store,'our team'))
$$;
CREATE OR REPLACE FUNCTION public.bulk_skip_reason(_app uuid,_channel text,_demo boolean)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.applications%ROWTYPE; c public.candidates%ROWTYPE; dest text;
BEGIN
 SELECT * INTO a FROM public.applications WHERE id=_app;
 IF NOT FOUND THEN RETURN 'Applicant unavailable'; END IF;
 IF a.status='do_not_hire' THEN RETURN 'Do Not Hire'; END IF;
 IF a.archived_at IS NOT NULL OR a.merged_into_id IS NOT NULL THEN RETURN 'Archived applicant'; END IF;
 IF a.candidate_id IS NOT NULL THEN SELECT * INTO c FROM public.candidates WHERE id=a.candidate_id AND org_id=a.org_id; END IF;
 IF _channel='sms' THEN
 dest:=public.bulk_phone(a.phone);
 IF c.sms_opted_out_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.sms_opt_outs o WHERE o.org_id=a.org_id AND public.bulk_phone(o.phone)=dest) THEN RETURN 'Text opt-out'; END IF;
 IF NOT coalesce(c.sms_opt_in,false) THEN RETURN 'No text consent'; END IF;
 IF dest IS NULL AND NOT _demo THEN RETURN 'No valid mobile number'; END IF;
 ELSE
 dest:=lower(btrim(a.email));
 IF dest IS NULL OR dest!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN RETURN 'No valid email address'; END IF;
 IF c.email_opted_out_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.email_opt_outs o WHERE o.org_id=a.org_id AND lower(btrim(o.email))=dest) THEN RETURN 'Email opt-out'; END IF;
 IF NOT _demo THEN RETURN 'Live bulk email service not configured'; END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.bulk_skip_reason(uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_skip_reason(uuid,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.bulk_phone(text),public.bulk_render(text,text,text,text),public.bulk_next_text_time(timestamptz,text,time,time,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bulk_phone(text),public.bulk_render(text,text,text,text),public.bulk_next_text_time(timestamptz,text,time,time,integer[]) TO authenticated,service_role;