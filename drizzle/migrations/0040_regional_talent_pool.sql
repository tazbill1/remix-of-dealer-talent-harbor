ALTER TABLE public.messaging_settings
  ADD COLUMN IF NOT EXISTS talent_pool_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS talent_pool_after_reminders integer NOT NULL DEFAULT 3 CHECK (talent_pool_after_reminders BETWEEN 1 AND 20);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS in_talent_pool boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS talent_pool_region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moved_to_pool_at timestamptz,
  ADD COLUMN IF NOT EXISTS pool_reason text,
  ADD COLUMN IF NOT EXISTS original_store_id uuid REFERENCES public.dealerships(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS applications_talent_pool_idx ON public.applications(org_id, talent_pool_region_id) WHERE in_talent_pool;

-- Who may see a region's pool: HR/admins everywhere; regional leaders, GMs and hiring managers with any store in that region.
CREATE OR REPLACE FUNCTION public.can_see_pool_region(_org uuid, _region uuid, _uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.can_post_jobs(_org, _uid)
    OR (_region IS NOT NULL
        AND (public.has_org_role(_org, _uid, 'regional_leader') OR public.has_org_role(_org, _uid, 'dealer_manager') OR public.has_org_role(_org, _uid, 'hiring_manager'))
        AND EXISTS (SELECT 1 FROM public.dealerships d WHERE d.org_id = _org AND d.region_id = _region AND public.can_access_store(_org, d.id, _uid)))
$$;

CREATE POLICY "regional pool read applications" ON public.applications FOR SELECT TO authenticated
  USING (in_talent_pool AND public.is_org_member(org_id, auth.uid()) AND public.can_see_pool_region(org_id, talent_pool_region_id, auth.uid()));

-- Daily job: reminders, plus moving long-unanswered applicants into their region's pool when the group turns it on.
CREATE OR REPLACE FUNCTION public.run_status_reminders(_org uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  r record; n integer := 0; days integer; label text; pool_on boolean; pool_after integer;
begin
  for r in
    select a.id, a.org_id, a.dealership_id, a.full_name, a.status, a.status_changed_at, a.reminder_count,
           d.name store_name, d.region_id, rr.remind_after_days
    from public.applications a
    join public.status_reminder_rules rr on rr.org_id = a.org_id and rr.status = a.status and rr.is_active
    join public.dealerships d on d.id = a.dealership_id
    where (_org is null or a.org_id = _org)
      and not a.in_talent_pool
      and a.full_name !~* 'test'
      and a.status not in ('hired','rejected','do_not_hire','unqualified')
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
    select coalesce(ms.talent_pool_enabled, false), coalesce(ms.talent_pool_after_reminders, 3)
      into pool_on, pool_after from public.messaging_settings ms where ms.org_id = r.org_id;

    if coalesce(pool_on, false) and r.region_id is not null and r.reminder_count + 1 >= pool_after then
      update public.applications set
        reminder_count = reminder_count + 1, last_reminded_at = now(),
        in_talent_pool = true, talent_pool_region_id = r.region_id, moved_to_pool_at = now(),
        pool_reason = 'No response after ' || pool_after || ' reminders',
        original_store_id = coalesce(original_store_id, dealership_id)
      where id = r.id;
      insert into public.application_events(org_id, application_id, kind, message)
        values (r.org_id, r.id, 'talent_pool', 'Moved to the regional talent pool: no response after ' || pool_after || ' reminders');
      insert into public.notifications(org_id, store_id, recipient_id, type, application_id, message)
      select r.org_id, r.dealership_id, x.user_id, 'talent_pool', r.id,
             r.full_name || ' moved to the regional talent pool after ' || pool_after || ' reminders — ' || r.store_name || '.'
      from (
        select distinct user_id from public.org_members where org_id = r.org_id and role = 'recruiter'
        union
        select distinct user_id from public.org_members where org_id = r.org_id and role = 'group_admin'
          and not exists (select 1 from public.org_members where org_id = r.org_id and role = 'recruiter')
      ) x;
    else
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
      update public.applications set reminder_count = reminder_count + 1, last_reminded_at = now() where id = r.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $function$;
REVOKE ALL ON FUNCTION public.run_status_reminders(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_status_reminders(uuid) TO service_role;

-- A manager claims a pool candidate for one of their stores (same region; HR/admins any store in the group).
CREATE OR REPLACE FUNCTION public.claim_pool_candidate(_app uuid, _store uuid, _job uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare a public.applications; st public.dealerships; uid uuid := auth.uid();
begin
  select * into a from public.applications where id = _app for update;
  if a.id is null or not a.in_talent_pool then raise exception 'This candidate is not in the talent pool'; end if;
  select * into st from public.dealerships where id = _store and org_id = a.org_id;
  if st.id is null then raise exception 'Store not found in this group'; end if;
  if not public.can_see_pool_region(a.org_id, a.talent_pool_region_id, uid) or not public.can_access_store(a.org_id, st.id, uid) then
    raise exception 'Not allowed';
  end if;
  if not public.can_post_jobs(a.org_id, uid) then
    if not (public.has_org_role(a.org_id, uid, 'dealer_manager') or public.has_org_role(a.org_id, uid, 'hiring_manager')) then
      raise exception 'Only store managers and HR can claim candidates';
    end if;
    if st.region_id is distinct from a.talent_pool_region_id then raise exception 'Store must be in the candidate''s region'; end if;
  end if;
  if _job is not null and not exists (select 1 from public.jobs j where j.id = _job and j.dealership_id = st.id and j.org_id = a.org_id) then
    raise exception 'Job must be at the chosen store';
  end if;
  update public.applications set
    in_talent_pool = false, talent_pool_region_id = null,
    original_store_id = coalesce(original_store_id, dealership_id),
    dealership_id = st.id, job_id = coalesce(_job, job_id), status = 'new'
  where id = _app;
  insert into public.application_events(org_id, application_id, kind, message, actor_id)
    values (a.org_id, _app, 'talent_pool', 'Claimed from the talent pool by ' || st.name, uid);
  return _app;
end $$;
REVOKE ALL ON FUNCTION public.claim_pool_candidate(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_pool_candidate(uuid, uuid, uuid) TO authenticated;

-- HR / Recruiter or group admin returns a candidate to their current store's region pool.
CREATE OR REPLACE FUNCTION public.return_to_talent_pool(_app uuid, _reason text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare a public.applications; reg uuid; why text := coalesce(nullif(btrim(_reason), ''), 'Returned to the pool by HR');
begin
  select * into a from public.applications where id = _app for update;
  if a.id is null or not public.can_post_jobs(a.org_id, auth.uid()) then raise exception 'Not allowed'; end if;
  if a.status in ('hired','do_not_hire') then raise exception 'Hired and Do Not Hire candidates can''t go to the pool'; end if;
  select region_id into reg from public.dealerships where id = a.dealership_id;
  if reg is null then raise exception 'This store isn''t in a region yet'; end if;
  update public.applications set
    in_talent_pool = true, talent_pool_region_id = reg, moved_to_pool_at = now(), pool_reason = left(why, 300),
    original_store_id = coalesce(original_store_id, dealership_id)
  where id = _app;
  insert into public.application_events(org_id, application_id, kind, message, actor_id)
    values (a.org_id, _app, 'talent_pool', 'Returned to the regional talent pool: ' || left(why, 300), auth.uid());
  return _app;
end $$;
REVOKE ALL ON FUNCTION public.return_to_talent_pool(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.return_to_talent_pool(uuid, text) TO authenticated;