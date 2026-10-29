CREATE OR REPLACE FUNCTION public.guard_bulk_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bulk_sends%ROWTYPE; a public.applications%ROWTYPE; reason text; demo boolean; at_time timestamptz; settings public.messaging_settings%ROWTYPE; store public.dealerships%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND NEW.bulk_send_id IS DISTINCT FROM OLD.bulk_send_id THEN RAISE EXCEPTION 'Bulk message link is immutable'; END IF;
 IF NEW.bulk_send_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO b FROM public.bulk_sends WHERE id=NEW.bulk_send_id;
 SELECT * INTO a FROM public.applications WHERE id=NEW.application_id;
 IF b.id IS NULL OR a.id IS NULL OR NEW.org_id<>b.org_id OR a.org_id<>b.org_id OR a.dealership_id<>b.store_id OR NEW.direction<>'out' OR NEW.party<>'candidate' OR NEW.channel NOT IN ('sms','email') THEN RAISE EXCEPTION 'Invalid bulk message scope'; END IF;
 IF NEW.purpose IS DISTINCT FROM (CASE WHEN NEW.channel='email' THEN 'bulk_email' ELSE 'bulk_text' END) THEN RAISE EXCEPTION 'Invalid bulk message purpose'; END IF;
 demo:=CASE WHEN NEW.channel='email' THEN b.email_demo ELSE b.text_demo END;
 IF TG_OP='UPDATE' AND NEW.status='sending' AND OLD.status='queued' THEN
 SELECT * INTO settings FROM public.messaging_settings WHERE org_id=b.org_id;
 reason:=CASE WHEN NOT coalesce(settings.bulk_messaging_enabled,false) THEN 'Bulk messaging disabled' WHEN NOT public.can_bulk_message(b.org_id,b.store_id,b.sender_id) THEN 'Sender no longer has store access' ELSE public.bulk_skip_reason(a.id,NEW.channel,demo) END;
 IF reason IS NOT NULL THEN UPDATE public.messages SET status='blocked',error=reason,scheduled_for=NULL WHERE id=NEW.id; RETURN NULL; END IF;
 IF demo OR (NEW.channel='sms' AND settings.mode<>'live') OR (NEW.channel='email' AND settings.email_mode<>'live') THEN
 UPDATE public.messages SET status='simulated',provider='practice',sent_at=now(),scheduled_for=NULL WHERE id=NEW.id; RETURN NULL;
 END IF;
 IF NEW.channel='sms' THEN
 SELECT * INTO store FROM public.dealerships WHERE id=b.store_id;
 at_time:=public.bulk_next_text_time(now(),store.timezone,settings.send_start,settings.send_end,settings.send_days);
 IF at_time IS NULL THEN UPDATE public.messages SET status='blocked',error='No texting days are turned on',scheduled_for=NULL WHERE id=NEW.id; RETURN NULL;
 ELSIF at_time>now() THEN UPDATE public.messages SET scheduled_for=at_time WHERE id=NEW.id; RETURN NULL; END IF;
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_bulk_message BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.guard_bulk_message();
CREATE OR REPLACE FUNCTION public.audit_bulk_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reasons jsonb; old_sent integer:=0; old_skip integer:=0; old_queue integer:=0; new_sent integer; new_skip integer; new_queue integer;
BEGIN
 IF NEW.bulk_send_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
 IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.error IS NOT DISTINCT FROM OLD.error THEN RETURN NEW; END IF;
 old_sent:=CASE WHEN OLD.status IN ('sent','simulated','delivered') THEN 1 ELSE 0 END;
 old_skip:=CASE WHEN OLD.status IN ('blocked','failed') THEN 1 ELSE 0 END;
 old_queue:=CASE WHEN OLD.status IN ('queued','sending') THEN 1 ELSE 0 END;
 END IF;
 new_sent:=CASE WHEN NEW.status IN ('sent','simulated','delivered') THEN 1 ELSE 0 END;
 new_skip:=CASE WHEN NEW.status IN ('blocked','failed') THEN 1 ELSE 0 END;
 new_queue:=CASE WHEN NEW.status IN ('queued','sending') THEN 1 ELSE 0 END;
 SELECT skipped_reasons INTO reasons FROM public.bulk_sends WHERE id=NEW.bulk_send_id FOR UPDATE;
 IF old_skip=1 THEN reasons:=jsonb_set(reasons,ARRAY[coalesce(OLD.error,'Delivery failed')],to_jsonb(greatest(0,coalesce((reasons->>coalesce(OLD.error,'Delivery failed'))::integer,0)-1))); END IF;
 IF new_skip=1 THEN reasons:=jsonb_set(reasons,ARRAY[coalesce(NEW.error,'Delivery failed')],to_jsonb(coalesce((reasons->>coalesce(NEW.error,'Delivery failed'))::integer,0)+1)); END IF;
 UPDATE public.bulk_sends SET sent_count=sent_count+new_sent-old_sent,skipped_count=skipped_count+new_skip-old_skip,queued_count=queued_count+new_queue-old_queue,skipped_reasons=reasons,sent_at=CASE WHEN new_sent=1 THEN greatest(sent_at,NEW.sent_at) ELSE sent_at END WHERE id=NEW.bulk_send_id;
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
 INSERT INTO public.application_events(org_id,application_id,actor_id,kind,message)
 SELECT NEW.org_id,NEW.application_id,sender_id,'bulk_message',
 CASE NEW.status WHEN 'simulated' THEN 'Bulk '||CASE NEW.channel WHEN 'sms' THEN 'text' ELSE 'email' END||' sent (demo): '
 WHEN 'sent' THEN 'Bulk '||CASE NEW.channel WHEN 'sms' THEN 'text' ELSE 'email' END||' sent: '
 WHEN 'queued' THEN 'Bulk '||CASE NEW.channel WHEN 'sms' THEN 'text' ELSE 'email' END||' queued: '
 WHEN 'blocked' THEN 'Bulk message skipped ('||coalesce(NEW.error,'blocked')||'): '
 WHEN 'failed' THEN 'Bulk message failed ('||coalesce(NEW.error,'delivery failed')||'): '
 ELSE NULL END||NEW.body FROM public.bulk_sends WHERE id=NEW.bulk_send_id AND NEW.status IN ('simulated','sent','queued','blocked','failed');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_bulk_message AFTER INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.audit_bulk_message();
CREATE OR REPLACE FUNCTION public.send_bulk_applicants(_org uuid,_applicant_ids uuid[],_channel text,_body text,_subject text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); batch uuid:=gen_random_uuid(); b uuid; a record; store public.dealerships%ROWTYPE; settings public.messaging_settings%ROWTYPE;
 ids uuid[]; appid uuid; channels text[]; ch text; demo boolean; reason text; at_time timestamptz; rendered text; rendered_subject text; skipped integer:=0; counts record; selected integer; record_ids uuid[]:='{}';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF NOT(public.is_platform_admin(uid) OR public.has_org_role(_org,uid,'group_admin') OR public.has_org_role(_org,uid,'recruiter') OR public.has_org_role(_org,uid,'dealer_manager') OR public.has_org_role(_org,uid,'hiring_manager')) THEN RAISE EXCEPTION 'Bulk messaging not permitted'; END IF;
 SELECT * INTO settings FROM public.messaging_settings WHERE org_id=_org FOR SHARE;
 IF NOT FOUND OR NOT settings.bulk_messaging_enabled THEN RAISE EXCEPTION 'Bulk messaging is disabled'; END IF;
 IF _channel IS NULL OR _channel NOT IN ('email','text','both') OR nullif(btrim(_body),'') IS NULL THEN RAISE EXCEPTION 'Choose a channel and enter a message'; END IF;
 IF _channel IN ('email','both') AND nullif(btrim(_subject),'') IS NULL THEN RAISE EXCEPTION 'Email subject required'; END IF;
 IF coalesce(cardinality(_applicant_ids),0)=0 THEN RAISE EXCEPTION 'Select applicants'; END IF;
 SELECT array_agg(DISTINCT x) INTO ids FROM unnest(_applicant_ids) x;
 selected:=cardinality(ids);
 channels:=CASE _channel WHEN 'both' THEN ARRAY['email','sms'] WHEN 'text' THEN ARRAY['sms'] ELSE ARRAY['email'] END;
 FOREACH appid IN ARRAY ids LOOP
 SELECT ap.*,j.title AS job_title INTO a FROM public.applications ap JOIN public.jobs j ON j.id=ap.job_id AND j.org_id=ap.org_id WHERE ap.id=appid AND ap.org_id=_org;
 IF NOT FOUND THEN skipped:=skipped+cardinality(channels); CONTINUE; END IF;
 IF NOT public.can_bulk_message(_org,a.dealership_id,uid) THEN skipped:=skipped+cardinality(channels); CONTINUE; END IF;
 SELECT * INTO store FROM public.dealerships WHERE id=a.dealership_id AND org_id=_org;
 SELECT id INTO b FROM public.bulk_sends WHERE batch_id=batch AND store_id=store.id;
 IF b IS NULL THEN
 INSERT INTO public.bulk_sends(batch_id,org_id,store_id,sender_id,channel,subject,body,is_demo,email_demo,text_demo)
 VALUES(batch,_org,store.id,uid,_channel,_subject,_body,(_channel='email' AND settings.email_mode<>'live') OR (_channel='text' AND settings.mode<>'live') OR (_channel='both' AND settings.email_mode<>'live' AND settings.mode<>'live'),settings.email_mode<>'live',settings.mode<>'live') RETURNING id INTO b;
 record_ids:=array_append(record_ids,b);
 END IF;
 UPDATE public.bulk_sends SET selected_count=selected_count+1 WHERE id=b;
 rendered:=public.bulk_render(_body,a.full_name,a.job_title,store.name);
 rendered_subject:=public.bulk_render(_subject,a.full_name,a.job_title,store.name);
 FOREACH ch IN ARRAY channels LOOP
 demo:=CASE WHEN ch='email' THEN settings.email_mode<>'live' ELSE settings.mode<>'live' END;
 reason:=public.bulk_skip_reason(a.id,ch,demo); at_time:=now();
 IF ch='sms' AND reason IS NULL AND NOT demo THEN
 at_time:=public.bulk_next_text_time(now(),coalesce(store.timezone,'America/Chicago'),settings.send_start,settings.send_end,settings.send_days);
 IF at_time IS NULL THEN reason:='No texting days are turned on'; END IF;
 END IF;
 INSERT INTO public.messages(org_id,application_id,party,direction,channel,subject,body,purpose,to_phone,from_phone,to_email,status,scheduled_for,error,provider,sent_at,bulk_send_id)
 VALUES(_org,a.id,'candidate','out',ch,CASE WHEN ch='email' THEN rendered_subject END,
 CASE WHEN ch='sms' AND NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.application_id=a.id AND m.channel='sms' AND m.direction='out' AND m.status IN ('sent','simulated','delivered')) THEN rendered||E'\nReply STOP to opt out.' ELSE rendered END,
 CASE WHEN ch='email' THEN 'bulk_email' ELSE 'bulk_text' END,
 CASE WHEN ch='sms' THEN public.bulk_phone(a.phone) END,CASE WHEN ch='sms' THEN public.bulk_phone(store.sms_number) END,CASE WHEN ch='email' THEN lower(btrim(a.email)) END,
 CASE WHEN reason IS NOT NULL THEN 'blocked' WHEN demo THEN 'simulated' ELSE 'queued' END,CASE WHEN reason IS NULL AND NOT demo THEN at_time END,reason,
 CASE WHEN demo AND reason IS NULL THEN 'practice' END,CASE WHEN demo AND reason IS NULL THEN now() END,b);
 END LOOP;
 END LOOP;
 SELECT coalesce(sum(sent_count),0) AS sent,coalesce(sum(skipped_count),0) AS blocked,coalesce(sum(queued_count),0) AS queued INTO counts FROM public.bulk_sends WHERE batch_id=batch;
 RETURN jsonb_build_object('batch_id',batch,'bulk_send_ids',record_ids,'selected',selected,'sent',counts.sent,'skipped',counts.blocked+skipped,'queued',counts.queued,'unavailable',skipped,'count_unit','channel deliveries','note','Live channels queue for the existing delivery worker; live bulk email is skipped until a bulk service is configured. Unavailable/out-of-scope IDs are never exposed in history.');
END $$;
REVOKE ALL ON FUNCTION public.send_bulk_applicants(uuid,uuid[],text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_bulk_applicants(uuid,uuid[],text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_bulk_message(),public.audit_bulk_message() FROM PUBLIC,anon,authenticated;