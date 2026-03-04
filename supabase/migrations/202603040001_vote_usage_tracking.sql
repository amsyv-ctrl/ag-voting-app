-- Track per-organization vote usage for plan allowance and overage reporting.

alter table public.organizations
  add column if not exists stripe_price_id text null;

create table if not exists public.org_vote_usage (
  org_id uuid not null references public.organizations(id) on delete cascade,
  billing_period_start timestamptz not null,
  vote_count integer not null default 0,
  primary key (org_id, billing_period_start),
  constraint org_vote_usage_nonnegative_votes check (vote_count >= 0)
);

comment on table public.org_vote_usage is 'Aggregated vote usage per organization and billing period.';

create table if not exists public.org_vote_overage (
  org_id uuid not null references public.organizations(id) on delete cascade,
  billing_period_start timestamptz not null,
  overage_votes integer not null default 0,
  estimated_overage_cents integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, billing_period_start),
  constraint org_vote_overage_nonnegative_votes check (overage_votes >= 0),
  constraint org_vote_overage_nonnegative_cents check (estimated_overage_cents >= 0)
);

comment on table public.org_vote_overage is 'Computed overage snapshot per organization and billing period.';

create or replace function public.current_usage_period_start()
returns timestamptz
language sql
stable
as $$
  select date_trunc('year', timezone('utc', now()));
$$;

create or replace function public.increment_org_vote_usage(
  p_org_id uuid,
  p_allowance integer,
  p_overage_rate_cents integer default 50
)
returns table (
  billing_period_start timestamptz,
  vote_count integer,
  overage_votes integer,
  estimated_overage_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start timestamptz := public.current_usage_period_start();
  v_vote_count integer;
  v_allowance integer := greatest(coalesce(p_allowance, 0), 0);
  v_overage_votes integer;
begin
  insert into public.org_vote_usage (org_id, billing_period_start, vote_count)
  values (p_org_id, v_period_start, 1)
  on conflict (org_id, billing_period_start)
  do update set vote_count = public.org_vote_usage.vote_count + 1
  returning public.org_vote_usage.vote_count into v_vote_count;

  v_overage_votes := greatest(v_vote_count - v_allowance, 0);

  insert into public.org_vote_overage (org_id, billing_period_start, overage_votes, estimated_overage_cents, updated_at)
  values (p_org_id, v_period_start, v_overage_votes, v_overage_votes * greatest(coalesce(p_overage_rate_cents, 0), 0), now())
  on conflict (org_id, billing_period_start)
  do update set
    overage_votes = excluded.overage_votes,
    estimated_overage_cents = excluded.estimated_overage_cents,
    updated_at = now();

  return query
  select v_period_start, v_vote_count, v_overage_votes, v_overage_votes * greatest(coalesce(p_overage_rate_cents, 0), 0);
end;
$$;

create or replace function public.get_org_vote_usage(
  p_org_id uuid,
  p_allowance integer,
  p_overage_rate_cents integer default 50
)
returns table (
  billing_period_start timestamptz,
  vote_count integer,
  allowance integer,
  remaining integer,
  overage_votes integer,
  estimated_overage_cents integer,
  warning_80 boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start timestamptz := public.current_usage_period_start();
  v_vote_count integer := 0;
  v_allowance integer := greatest(coalesce(p_allowance, 0), 0);
  v_overage_votes integer := 0;
begin
  select u.vote_count
  into v_vote_count
  from public.org_vote_usage u
  where u.org_id = p_org_id
    and u.billing_period_start = v_period_start;

  if v_vote_count is null then
    v_vote_count := 0;
  end if;

  v_overage_votes := greatest(v_vote_count - v_allowance, 0);

  return query
  select
    v_period_start,
    v_vote_count,
    v_allowance,
    greatest(v_allowance - v_vote_count, 0),
    v_overage_votes,
    v_overage_votes * greatest(coalesce(p_overage_rate_cents, 0), 0),
    case
      when v_allowance <= 0 then false
      else (v_vote_count::numeric / v_allowance::numeric) >= 0.8
    end;
end;
$$;

alter table public.org_vote_usage enable row level security;
alter table public.org_vote_overage enable row level security;

grant select on public.org_vote_usage to authenticated;
grant select on public.org_vote_overage to authenticated;
grant execute on function public.increment_org_vote_usage(uuid, integer, integer) to authenticated;
grant execute on function public.get_org_vote_usage(uuid, integer, integer) to authenticated;

drop policy if exists "org_vote_usage_member_select" on public.org_vote_usage;
create policy "org_vote_usage_member_select" on public.org_vote_usage
for select to authenticated
using (
  exists (
    select 1
    from public.org_members m
    where m.org_id = org_vote_usage.org_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "org_vote_overage_member_select" on public.org_vote_overage;
create policy "org_vote_overage_member_select" on public.org_vote_overage
for select to authenticated
using (
  exists (
    select 1
    from public.org_members m
    where m.org_id = org_vote_overage.org_id
      and m.user_id = auth.uid()
  )
);
