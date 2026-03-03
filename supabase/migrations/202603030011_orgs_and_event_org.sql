-- Organization + membership foundation for monetization / tenant isolation.
-- This migration keeps existing events working by backfilling org_id, then enforcing org scoping.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  mode text not null default 'TRIAL',
  trial_event_id uuid null,
  trial_votes_used int not null default 0,
  trial_votes_limit int not null default 100,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  subscription_status text null,
  current_period_end timestamptz null,
  is_active boolean not null default false,
  constraint organizations_mode_check check (mode in ('DEMO', 'TRIAL', 'PAID'))
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'OWNER',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id),
  constraint org_members_role_check check (role in ('OWNER', 'ADMIN', 'STAFF'))
);

create index if not exists idx_org_members_user_id on public.org_members(user_id);
create index if not exists idx_org_members_org_id on public.org_members(org_id);

comment on table public.organizations is 'Tenant/billing boundary. One Stripe customer/subscription per organization.';
comment on table public.org_members is 'Organization membership and role for admin access control.';

-- Add org linkage to events. Keep nullable until backfill is completed.
alter table public.events
  add column if not exists org_id uuid references public.organizations(id),
  add column if not exists is_trial_event boolean not null default false;

comment on column public.events.org_id is 'Owning organization for tenant and billing isolation.';
comment on column public.events.is_trial_event is 'Marks whether this event is consuming trial limits.';

-- Helper: membership test.
create or replace function public.is_org_member(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members om
    where om.org_id = p_org_id
      and om.user_id = p_user_id
  );
$$;

-- Helper: admin test.
create or replace function public.is_org_admin(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members om
    where om.org_id = p_org_id
      and om.user_id = p_user_id
      and om.role in ('OWNER', 'ADMIN')
  );
$$;

-- Helper: default org for current authenticated user.
create or replace function public.get_current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.org_id
  from public.org_members om
  where om.user_id = auth.uid()
  order by om.created_at asc
  limit 1;
$$;

grant execute on function public.is_org_member(uuid, uuid) to authenticated;
grant execute on function public.is_org_admin(uuid, uuid) to authenticated;
grant execute on function public.get_current_user_org_id() to authenticated;

-- Backfill organizations + ownership from existing users/events.
with seed_users as (
  select distinct e.created_by as user_id
  from public.events e
  where e.created_by is not null
  union
  select distinct ap.user_id
  from public.admin_profiles ap
),
users_without_org as (
  select su.user_id
  from seed_users su
  where not exists (
    select 1
    from public.org_members om
    where om.user_id = su.user_id
  )
),
inserted_orgs as (
  insert into public.organizations (name, created_by, mode, is_active)
  select
    coalesce(nullif(trim(ap.network), ''), 'Organization') || ' Organization',
    uwo.user_id,
    'TRIAL',
    true
  from users_without_org uwo
  left join public.admin_profiles ap on ap.user_id = uwo.user_id
  returning id, created_by
)
insert into public.org_members (org_id, user_id, role)
select io.id, io.created_by, 'OWNER'
from inserted_orgs io
where io.created_by is not null
on conflict (org_id, user_id) do nothing;

-- Ensure every org created_by has owner membership.
insert into public.org_members (org_id, user_id, role)
select o.id, o.created_by, 'OWNER'
from public.organizations o
where o.created_by is not null
on conflict (org_id, user_id) do nothing;

-- Backfill existing events to creator's org.
update public.events e
set org_id = chosen.org_id
from (
  select distinct on (om.user_id)
    om.user_id,
    om.org_id
  from public.org_members om
  order by om.user_id, om.created_at asc
) as chosen
where e.org_id is null
  and chosen.user_id = e.created_by;

-- Auto-assign organization for future event inserts.
create or replace function public.assign_event_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_org_name text;
begin
  if new.org_id is not null then
    return new;
  end if;

  select om.org_id
  into v_org_id
  from public.org_members om
  where om.user_id = new.created_by
  order by om.created_at asc
  limit 1;

  if v_org_id is null then
    select coalesce(nullif(trim(ap.network), ''), 'Organization') || ' Organization'
    into v_org_name
    from public.admin_profiles ap
    where ap.user_id = new.created_by
    limit 1;

    if v_org_name is null then
      v_org_name := 'Organization';
    end if;

    insert into public.organizations (name, created_by, mode, is_active)
    values (v_org_name, new.created_by, 'TRIAL', false)
    returning id into v_org_id;

    insert into public.org_members (org_id, user_id, role)
    values (v_org_id, new.created_by, 'OWNER')
    on conflict (org_id, user_id) do nothing;
  end if;

  new.org_id := v_org_id;
  return new;
end;
$$;

drop trigger if exists trg_assign_event_org_id on public.events;
create trigger trg_assign_event_org_id
before insert on public.events
for each row
execute procedure public.assign_event_org_id();

-- Default org_id from membership for authenticated inserts.
alter table public.events
  alter column org_id set default public.get_current_user_org_id();

-- If any legacy rows are still null, fail loudly so we do not apply a partial policy migration.
do $$
begin
  if exists (select 1 from public.events where org_id is null) then
    raise exception 'events.org_id backfill incomplete: at least one event row has NULL org_id';
  end if;
end $$;

alter table public.events
  alter column org_id set not null;

-- RLS: org-scoped access model.
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.events enable row level security;

grant select, insert, update on table public.organizations to authenticated;
grant select, insert, update, delete on table public.org_members to authenticated;
grant select, insert, update, delete on table public.events to authenticated;

-- Replace legacy creator-only event policies with org-based policies.
drop policy if exists "events_admin_select" on public.events;
drop policy if exists "events_admin_insert" on public.events;
drop policy if exists "events_admin_update" on public.events;
drop policy if exists "events_admin_delete" on public.events;

create policy "events_org_select" on public.events
for select to authenticated
using (public.is_org_member(org_id, auth.uid()));

create policy "events_org_insert" on public.events
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_org_admin(org_id, auth.uid())
);

create policy "events_org_update" on public.events
for update to authenticated
using (public.is_org_admin(org_id, auth.uid()))
with check (public.is_org_admin(org_id, auth.uid()));

create policy "events_org_delete" on public.events
for delete to authenticated
using (public.is_org_admin(org_id, auth.uid()));

-- Organizations table policies.
drop policy if exists "organizations_member_select" on public.organizations;
drop policy if exists "organizations_admin_update" on public.organizations;
drop policy if exists "organizations_owner_insert" on public.organizations;

create policy "organizations_member_select" on public.organizations
for select to authenticated
using (public.is_org_member(id, auth.uid()));

create policy "organizations_admin_update" on public.organizations
for update to authenticated
using (public.is_org_admin(id, auth.uid()))
with check (public.is_org_admin(id, auth.uid()));

create policy "organizations_owner_insert" on public.organizations
for insert to authenticated
with check (created_by = auth.uid());

-- Org members table policies.
drop policy if exists "org_members_member_select" on public.org_members;
drop policy if exists "org_members_admin_insert" on public.org_members;
drop policy if exists "org_members_admin_update" on public.org_members;
drop policy if exists "org_members_admin_delete" on public.org_members;

create policy "org_members_member_select" on public.org_members
for select to authenticated
using (public.is_org_member(org_id, auth.uid()));

create policy "org_members_admin_insert" on public.org_members
for insert to authenticated
with check (public.is_org_admin(org_id, auth.uid()));

create policy "org_members_admin_update" on public.org_members
for update to authenticated
using (public.is_org_admin(org_id, auth.uid()))
with check (public.is_org_admin(org_id, auth.uid()));

create policy "org_members_admin_delete" on public.org_members
for delete to authenticated
using (public.is_org_admin(org_id, auth.uid()));
