CREATE OR REPLACE FUNCTION public.can_access_onboarding(_org uuid, _store uuid, _uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.can_post_jobs(_org, _uid)
    OR (_store IS NOT NULL
        AND (public.has_org_role(_org, _uid, 'dealer_manager') OR public.has_org_role(_org, _uid, 'hiring_manager'))
        AND public.can_access_store(_org, _store, _uid))
$$;

CREATE OR REPLACE FUNCTION public.add_business_days(_d date, _n integer)
 RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $$
declare d date := _d; c integer := 0;
begin
  if _d is null or _n is null then return null; end if;
  while c < _n loop d := d + 1; if extract(isodow from d) < 6 then c := c + 1; end if; end loop;
  return d;
end $$;

CREATE TABLE public.onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.dealerships(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX onboarding_templates_one_default ON public.onboarding_templates(org_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_default;

CREATE TABLE public.onboarding_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  item_type text NOT NULL CHECK (item_type IN ('document_upload','form_to_complete','acknowledgement','manager_task')),
  who_completes text NOT NULL CHECK (who_completes IN ('new_hire','manager')),
  required boolean NOT NULL DEFAULT true,
  due_business_days integer CHECK (due_business_days BETWEEN 0 AND 60),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.onboarding_template_items(template_id, sort_order);

CREATE TABLE public.onboarding_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.dealerships(id),
  application_id uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.onboarding_templates(id) ON DELETE SET NULL,
  start_date date,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','complete')),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.onboarding_checklists(org_id, store_id, status);

CREATE TABLE public.onboarding_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.dealerships(id),
  checklist_id uuid NOT NULL REFERENCES public.onboarding_checklists(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  item_type text NOT NULL CHECK (item_type IN ('document_upload','form_to_complete','acknowledgement','manager_task')),
  who_completes text NOT NULL CHECK (who_completes IN ('new_hire','manager')),
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  due_date date,
  completed_at timestamptz,
  completed_by uuid,
  file_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.onboarding_checklist_items(checklist_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_templates, public.onboarding_template_items TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.onboarding_checklists, public.onboarding_checklist_items TO authenticated;
GRANT ALL ON public.onboarding_templates, public.onboarding_template_items, public.onboarding_checklists, public.onboarding_checklist_items TO service_role;
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding staff read templates" ON public.onboarding_templates FOR SELECT TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()) OR public.has_org_role(org_id, auth.uid(), 'dealer_manager') OR public.has_org_role(org_id, auth.uid(), 'hiring_manager'));
CREATE POLICY "hr manage templates" ON public.onboarding_templates FOR ALL TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid())) WITH CHECK (public.can_post_jobs(org_id, auth.uid()));
CREATE POLICY "onboarding staff read template items" ON public.onboarding_template_items FOR SELECT TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()) OR public.has_org_role(org_id, auth.uid(), 'dealer_manager') OR public.has_org_role(org_id, auth.uid(), 'hiring_manager'));
CREATE POLICY "hr manage template items" ON public.onboarding_template_items FOR ALL TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()))
  WITH CHECK (public.can_post_jobs(org_id, auth.uid()) AND EXISTS (SELECT 1 FROM public.onboarding_templates t WHERE t.id = template_id AND t.org_id = onboarding_template_items.org_id));

CREATE POLICY "onboarding staff read checklists" ON public.onboarding_checklists FOR SELECT TO authenticated
  USING (public.can_access_onboarding(org_id, store_id, auth.uid()));
CREATE POLICY "onboarding staff update checklists" ON public.onboarding_checklists FOR UPDATE TO authenticated
  USING (public.can_access_onboarding(org_id, store_id, auth.uid())) WITH CHECK (public.can_access_onboarding(org_id, store_id, auth.uid()));
CREATE POLICY "hr delete checklists" ON public.onboarding_checklists FOR DELETE TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()));
CREATE POLICY "onboarding staff read checklist items" ON public.onboarding_checklist_items FOR SELECT TO authenticated
  USING (public.can_access_onboarding(org_id, store_id, auth.uid()));
CREATE POLICY "onboarding staff update checklist items" ON public.onboarding_checklist_items FOR UPDATE TO authenticated
  USING (public.can_access_onboarding(org_id, store_id, auth.uid())) WITH CHECK (public.can_access_onboarding(org_id, store_id, auth.uid()));
CREATE POLICY "hr delete checklist items" ON public.onboarding_checklist_items FOR DELETE TO authenticated
  USING (public.can_post_jobs(org_id, auth.uid()));

-- Staff may only change completion fields on items; checklist identity, token and store never change from the app.
CREATE OR REPLACE FUNCTION public.guard_onboarding_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
begin
  if auth.role() = 'service_role' or current_user in ('postgres','supabase_admin') then return new; end if;
  if TG_TABLE_NAME = 'onboarding_checklist_items' then
    if (to_jsonb(new) - 'completed_at' - 'completed_by' - 'file_path' - 'notes' - 'updated_at')
       is distinct from (to_jsonb(old) - 'completed_at' - 'completed_by' - 'file_path' - 'notes' - 'updated_at') then
      raise exception 'Only completion details can change on a checklist item';
    end if;
    if new.completed_at is not null and new.completed_at is distinct from old.completed_at then new.completed_by := auth.uid(); end if;
  else
    if new.token is distinct from old.token or new.org_id is distinct from old.org_id or new.store_id is distinct from old.store_id
       or new.application_id is distinct from old.application_id or new.template_id is distinct from old.template_id then
      raise exception 'Only the start date can change on a checklist';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
CREATE TRIGGER onboarding_checklists_guard BEFORE UPDATE ON public.onboarding_checklists FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_change();
CREATE TRIGGER onboarding_items_guard BEFORE UPDATE ON public.onboarding_checklist_items FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_change();

-- Checklist status follows its items.
CREATE OR REPLACE FUNCTION public.refresh_onboarding_status()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare done integer; req_open integer;
begin
  select count(*) filter (where completed_at is not null), count(*) filter (where required and completed_at is null)
    into done, req_open from public.onboarding_checklist_items where checklist_id = new.checklist_id;
  update public.onboarding_checklists set
    status = case when req_open = 0 and done > 0 then 'complete' when done > 0 then 'in_progress' else 'not_started' end,
    completed_at = case when req_open = 0 and done > 0 then coalesce(completed_at, now()) else null end,
    updated_at = now()
  where id = new.checklist_id;
  return null;
end $$;
CREATE TRIGGER onboarding_items_status AFTER UPDATE OF completed_at ON public.onboarding_checklist_items FOR EACH ROW EXECUTE FUNCTION public.refresh_onboarding_status();

-- Default template per group.
CREATE OR REPLACE FUNCTION public.seed_onboarding_template(_org uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare t uuid;
begin
  if exists (select 1 from public.onboarding_templates where org_id = _org and store_id is null and is_default) then return; end if;
  insert into public.onboarding_templates(org_id, name, is_default) values (_org, 'New hire onboarding', true) returning id into t;
  insert into public.onboarding_template_items(org_id, template_id, title, description, item_type, who_completes, required, due_business_days, sort_order) values
    (_org, t, 'Signed offer letter', 'Upload your signed offer letter.', 'document_upload', 'new_hire', true, null, 1),
    (_org, t, 'W-4 federal tax form', 'Upload your completed federal W-4.', 'document_upload', 'new_hire', true, null, 2),
    (_org, t, 'State tax form', 'Upload your state withholding form, if your state has one.', 'document_upload', 'new_hire', false, null, 3),
    (_org, t, 'I-9 Section 1', 'Complete Section 1 of Form I-9 by your first day.', 'form_to_complete', 'new_hire', true, null, 4),
    (_org, t, 'I-9 Section 2 document check', 'Review the new hire''s identity and work documents in person within 3 business days of their start date.', 'manager_task', 'manager', true, 3, 5),
    (_org, t, 'Direct deposit form', 'Upload your direct deposit form.', 'document_upload', 'new_hire', true, null, 6),
    (_org, t, 'Handbook acknowledgement', 'Confirm you have received and read the employee handbook.', 'acknowledgement', 'new_hire', true, null, 7),
    (_org, t, 'Background check complete', 'Mark done once the background check has cleared.', 'manager_task', 'manager', true, null, 8),
    (_org, t, 'Drug screen complete', 'Mark done once the drug screen has cleared, if required for this role.', 'manager_task', 'manager', false, null, 9);
end $$;
REVOKE ALL ON FUNCTION public.seed_onboarding_template(uuid) FROM public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.seed_onboarding_on_org()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ begin perform public.seed_onboarding_template(new.id); return new; end $$;
CREATE TRIGGER organizations_seed_onboarding AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_onboarding_on_org();
SELECT public.seed_onboarding_template(id) FROM public.organizations;

-- One checklist per hire, from the store's template or the group default.
CREATE OR REPLACE FUNCTION public.create_onboarding_checklist()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare t uuid; c uuid; sd date;
begin
  if new.status <> 'hired' or old.status is not distinct from 'hired' then return new; end if;
  if exists (select 1 from public.onboarding_checklists where application_id = new.id) then return new; end if;
  perform public.seed_onboarding_template(new.org_id);
  select id into t from public.onboarding_templates where org_id = new.org_id and store_id = new.dealership_id
    order by is_default desc, created_at desc limit 1;
  if t is null then
    select id into t from public.onboarding_templates where org_id = new.org_id and store_id is null and is_default limit 1;
  end if;
  sd := coalesce(new.start_date, (coalesce(new.hired_at, now()))::date);
  insert into public.onboarding_checklists(org_id, store_id, application_id, template_id, start_date)
    values (new.org_id, new.dealership_id, new.id, t, sd)
    on conflict (application_id) do nothing returning id into c;
  if c is null then return new; end if;
  insert into public.onboarding_checklist_items(org_id, store_id, checklist_id, title, description, item_type, who_completes, required, sort_order, due_date)
    select new.org_id, new.dealership_id, c, i.title, i.description, i.item_type, i.who_completes, i.required, i.sort_order,
           case when i.due_business_days is not null then public.add_business_days(sd, i.due_business_days) end
    from public.onboarding_template_items i where i.template_id = t;
  return new;
end $$;
CREATE TRIGGER applications_onboarding_checklist AFTER UPDATE OF status ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.create_onboarding_checklist();

-- New hire link (no login): read own checklist, no file paths.
CREATE OR REPLACE FUNCTION public.onboarding_by_token(_token uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'checklist_id', c.id, 'org_id', c.org_id, 'status', c.status, 'start_date', c.start_date,
    'name', a.full_name, 'store', d.name,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'description', i.description,
        'item_type', i.item_type, 'who_completes', i.who_completes, 'required', i.required, 'due_date', i.due_date,
        'completed', i.completed_at IS NOT NULL) ORDER BY i.sort_order)
      FROM public.onboarding_checklist_items i WHERE i.checklist_id = c.id), '[]'::jsonb))
  FROM public.onboarding_checklists c
  JOIN public.applications a ON a.id = c.application_id
  JOIN public.dealerships d ON d.id = c.store_id
  WHERE c.token = _token
$$;

-- New hire completes one of their own items. Uploads must already be in this checklist's folder.
CREATE OR REPLACE FUNCTION public.onboarding_complete_item(_token uuid, _item uuid, _file_path text DEFAULT NULL, _notes text DEFAULT NULL)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'storage'
AS $$
declare c public.onboarding_checklists; i public.onboarding_checklist_items;
begin
  select * into c from public.onboarding_checklists where token = _token;
  if c.id is null then raise exception 'This link is no longer valid'; end if;
  select * into i from public.onboarding_checklist_items where id = _item and checklist_id = c.id for update;
  if i.id is null or i.who_completes <> 'new_hire' then raise exception 'Not allowed'; end if;
  if i.item_type = 'document_upload' then
    if _file_path is null or _file_path not like c.org_id::text || '/' || c.id::text || '/%'
       or lower(_file_path) !~ '\.(pdf|jpe?g|png|docx?)$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'onboarding-docs' and o.name = _file_path) then
      raise exception 'Please upload the document first';
    end if;
  end if;
  update public.onboarding_checklist_items set
    completed_at = now(), completed_by = null,
    file_path = coalesce(_file_path, file_path), notes = coalesce(left(_notes, 1000), notes), updated_at = now()
  where id = i.id;
  return true;
end $$;
REVOKE ALL ON FUNCTION public.onboarding_by_token(uuid) FROM public;
REVOKE ALL ON FUNCTION public.onboarding_complete_item(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.onboarding_by_token(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.onboarding_complete_item(uuid, uuid, text, text) TO anon, authenticated, service_role;

-- Files: staff with onboarding access for that checklist's store; no anonymous reads ever.
CREATE POLICY "onboarding docs staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'onboarding-docs' AND EXISTS (SELECT 1 FROM public.onboarding_checklists c
    WHERE c.org_id::text = (storage.foldername(name))[1] AND c.id::text = (storage.foldername(name))[2]
      AND public.can_access_onboarding(c.org_id, c.store_id, auth.uid())));
CREATE POLICY "onboarding docs staff upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'onboarding-docs' AND lower(name) ~ '\.(pdf|jpe?g|png|docx?)$' AND EXISTS (SELECT 1 FROM public.onboarding_checklists c
    WHERE c.org_id::text = (storage.foldername(name))[1] AND c.id::text = (storage.foldername(name))[2]
      AND public.can_access_onboarding(c.org_id, c.store_id, auth.uid())));
CREATE POLICY "onboarding docs hr delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'onboarding-docs' AND EXISTS (SELECT 1 FROM public.onboarding_checklists c
    WHERE c.org_id::text = (storage.foldername(name))[1] AND c.id::text = (storage.foldername(name))[2]
      AND public.can_post_jobs(c.org_id, auth.uid())));