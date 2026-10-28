ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

UPDATE public.applications a SET status_changed_at = coalesce(
  (SELECT max(e.created_at) FROM public.application_events e WHERE e.application_id = a.id AND e.kind = 'status'),
  a.updated_at, a.created_at)
WHERE a.status_changed_at IS NULL;

ALTER TABLE public.applications ALTER COLUMN status_changed_at SET DEFAULT now();
ALTER TABLE public.applications ALTER COLUMN status_changed_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.log_status_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status then
    new.updated_at := now();
    new.status_changed_at := now();
    new.reminder_count := 0;
    new.last_reminded_at := null;
    insert into public.application_events(org_id, application_id, kind, message)
      values (new.org_id, new.id, 'status', 'Status changed to ' || new.status::text);
  end if;
  return new;
end $function$;

CREATE TABLE IF NOT EXISTS public.status_reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status public.application_status NOT NULL,
  remind_after_days integer NOT NULL CHECK (remind_after_days BETWEEN 1 AND 365),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, status),
  CHECK (status NOT IN ('hired','rejected','do_not_hire','unqualified'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.status_reminder_rules TO authenticated;
GRANT ALL ON public.status_reminder_rules TO service_role;
ALTER TABLE public.status_reminder_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read reminder rules" ON public.status_reminder_rules FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "hr manage reminder rules" ON public.status_reminder_rules FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.has_org_role(org_id, auth.uid(), 'recruiter') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'group_admin') OR public.has_org_role(org_id, auth.uid(), 'recruiter') OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.seed_status_reminder_rules(_org uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  INSERT INTO public.status_reminder_rules(org_id, status, remind_after_days)
  VALUES (_org,'new',2),(_org,'screening',3),(_org,'interview',7),(_org,'offer',3)
  ON CONFLICT (org_id, status) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.seed_status_reminder_rules(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seed_status_reminders_on_org()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ begin perform public.seed_status_reminder_rules(new.id); return new; end $$;
DROP TRIGGER IF EXISTS organizations_seed_status_reminders ON public.organizations;
CREATE TRIGGER organizations_seed_status_reminders AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_status_reminders_on_org();

SELECT public.seed_status_reminder_rules(id) FROM public.organizations;

-- Core check: in-app notifications only. Returns number of applicants reminded.
CREATE OR REPLACE FUNCTION public.run_status_reminders(_org uuid DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  r record; n integer := 0; days integer; label text;
begin
  for r in
    select a.id, a.org_id, a.dealership_id, a.full_name, a.status, a.status_changed_at,
           d.name store_name, d.region_id, rr.remind_after_days
    from public.applications a
    join public.status_reminder_rules rr on rr.org_id = a.org_id and rr.status = a.status and rr.is_active
    join public.dealerships d on d.id = a.dealership_id
    where (_org is null or a.org_id = _org)
      and a.full_name !~* 'test'
      and a.status_changed_at <= now() - make_interval(days => rr.remind_after_days)
      and (a.last_reminded_at is null or a.last_reminded_at <= now() - make_interval(days => rr.remind_after_days))
    for update of a skip locked
  loop
    days := floor(extract(epoch from now() - r.status_changed_at) / 86400);
    label := case r.status::text
      when 'new' then 'Not Contacted Yet' when 'screening' then 'Contacted'
      when 'interview' then 'Interviewing' when 'offer' then 'Offer'
      when 'other_location' then 'Consider for Another Location or Position'
      when 'hiring_event' then 'Contacted for Hiring Event' else r.status::text end;

    insert into public.notifications(org_id, store_id, recipient_id, type, application_id, message)
    select r.org_id, r.dealership_id, x.user_id, 'status_reminder', r.id,
           'Status reminder: ' || r.full_name || ' has been in ' || label || ' for ' || days || ' days — ' || r.store_name || '.'
    from (
      with local as (
        select distinct m.user_id from public.org_members m
        join public.org_member_scopes s on s.member_id = m.id
        where m.org_id = r.org_id and m.role in ('hiring_manager','dealer_manager')
          and (s.dealership_id = r.dealership_id or (r.region_id is not null and s.region_id = r.region_id))
      ), hr as (
        select distinct user_id from public.org_members where org_id = r.org_id and role = 'recruiter'
      ), admins as (
        select distinct user_id from public.org_members where org_id = r.org_id and role = 'group_admin'
      )
      select user_id from local
      union select user_id from hr where not exists (select 1 from local)
      union select user_id from admins where not exists (select 1 from local) and not exists (select 1 from hr)
    ) x;

    update public.applications
      set reminder_count = reminder_count + 1, last_reminded_at = now()
      where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
REVOKE ALL ON FUNCTION public.run_status_reminders(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_status_reminders(uuid) TO service_role;

-- Safe manual trigger for admins (one group at a time).
CREATE OR REPLACE FUNCTION public.run_status_reminders_now(_org uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  if _org is null or not (public.is_platform_admin(auth.uid())
     or public.has_org_role(_org, auth.uid(), 'group_admin')
     or public.has_org_role(_org, auth.uid(), 'recruiter')) then
    raise exception 'Not allowed';
  end if;
  return public.run_status_reminders(_org);
end $$;
REVOKE ALL ON FUNCTION public.run_status_reminders_now(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_status_reminders_now(uuid) TO authenticated;