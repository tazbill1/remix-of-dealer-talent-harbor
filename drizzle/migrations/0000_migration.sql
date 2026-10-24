create type public.org_role as enum ('group_admin','dealer_manager','hiring_manager','recruiter');
create type public.application_status as enum ('new','screening','interview','offer','hired','rejected');

create table public.platform_admins (user_id uuid primary key, created_at timestamptz not null default now());
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.organizations to anon;
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  email text,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
grant select, insert, update, delete on public.org_members to authenticated;
grant all on public.org_members to service_role;
alter table public.org_members enable row level security;

create or replace function public.is_platform_admin(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.platform_admins where user_id = _uid) $$;

create or replace function public.is_org_member(_org uuid, _uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.org_members where org_id = _org and user_id = _uid)
      or public.is_platform_admin(_uid) $$;

create or replace function public.has_org_role(_org uuid, _uid uuid, _role public.org_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.org_members where org_id = _org and user_id = _uid and role = _role)
      or public.is_platform_admin(_uid) $$;

create policy "admins read self" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create policy "public read orgs" on public.organizations for select to anon, authenticated using (status = 'active' or public.is_org_member(id, auth.uid()));
create policy "group admins update org" on public.organizations for update to authenticated using (public.has_org_role(id, auth.uid(), 'group_admin'));
create policy "platform admin delete org" on public.organizations for delete to authenticated using (public.is_platform_admin(auth.uid()));

create policy "members read members" on public.org_members for select to authenticated using (public.is_org_member(org_id, auth.uid()));
create policy "group admins manage members" on public.org_members for all to authenticated
  using (public.has_org_role(org_id, auth.uid(), 'group_admin')) with check (public.has_org_role(org_id, auth.uid(), 'group_admin'));

create or replace function public.create_organization(_name text, _slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare _id uuid; _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'Not signed in'; end if;
  if _slug !~ '^[a-z0-9-]{3,40}$' then raise exception 'Invalid web address'; end if;
  insert into public.organizations(name, slug, created_by) values (trim(_name), _slug, _uid) returning id into _id;
  insert into public.org_members(org_id, user_id, email, role)
    values (_id, _uid, (select email from auth.users where id = _uid), 'group_admin');
  return _id;
end $$;
revoke execute on function public.create_organization(text, text) from anon;

create table public.dealerships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  brand text,
  city text,
  state text,
  address text,
  assistant_name text not null default 'Penny',
  created_at timestamptz not null default now()
);
grant select on public.dealerships to anon;
grant select, insert, update, delete on public.dealerships to authenticated;
grant all on public.dealerships to service_role;
alter table public.dealerships enable row level security;
create policy "public read stores" on public.dealerships for select to anon, authenticated using (true);
create policy "managers write stores" on public.dealerships for all to authenticated
  using (public.has_org_role(org_id, auth.uid(), 'group_admin') or public.has_org_role(org_id, auth.uid(), 'dealer_manager'))
  with check (public.has_org_role(org_id, auth.uid(), 'group_admin') or public.has_org_role(org_id, auth.uid(), 'dealer_manager'));

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  dealership_id uuid not null references public.dealerships(id) on delete cascade,
  title text not null,
  department text,
  employment_type text not null default 'FULL_TIME',
  pay_min numeric,
  pay_max numeric,
  pay_period text not null default 'YEAR',
  description text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
grant select on public.jobs to anon;
grant select, insert, update, delete on public.jobs to authenticated;
grant all on public.jobs to service_role;
alter table public.jobs enable row level security;
create policy "public read open jobs" on public.jobs for select to anon, authenticated
  using (status = 'open' or public.is_org_member(org_id, auth.uid()));
create policy "members write jobs" on public.jobs for all to authenticated
  using (public.is_org_member(org_id, auth.uid())) with check (public.is_org_member(org_id, auth.uid()));

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  dealership_id uuid not null references public.dealerships(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  resume_path text,
  source text not null default 'careers',
  status public.application_status not null default 'new',
  open_to_other_stores boolean not null default false,
  status_token uuid not null default gen_random_uuid() unique,
  rating int,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.applications to authenticated;
grant all on public.applications to service_role;
alter table public.applications enable row level security;
create policy "members manage applications" on public.applications for all to authenticated
  using (public.is_org_member(org_id, auth.uid())) with check (public.is_org_member(org_id, auth.uid()));

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.application_events to authenticated;
grant all on public.application_events to service_role;
alter table public.application_events enable row level security;
create policy "members read events" on public.application_events for select to authenticated using (public.is_org_member(org_id, auth.uid()));
create policy "members add events" on public.application_events for insert to authenticated with check (public.is_org_member(org_id, auth.uid()));

create or replace function public.log_status_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.updated_at := now();
    insert into public.application_events(org_id, application_id, kind, message)
      values (new.org_id, new.id, 'status', 'Status changed to ' || new.status::text);
  end if;
  return new;
end $$;
create trigger trg_app_status before update on public.applications for each row execute function public.log_status_change();

create index on public.jobs(org_id); create index on public.applications(org_id, status); create index on public.dealerships(org_id);