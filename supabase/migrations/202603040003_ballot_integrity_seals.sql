-- Ballot integrity seals: tamper-evident round snapshots.

create table if not exists public.election_result_seals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  vote_round int not null,
  ballot_status text not null,
  majority_rule text not null,
  threshold_required text not null,
  total_votes int not null,
  counts jsonb not null,
  closed_at timestamptz not null,
  seal_hash text not null unique,
  seal_short text not null,
  created_at timestamptz not null default now(),
  unique (ballot_id, vote_round)
);

create index if not exists election_result_seals_event_round_idx
  on public.election_result_seals(event_id, ballot_id, vote_round);

alter table public.election_result_seals enable row level security;

grant select on public.election_result_seals to authenticated;

drop policy if exists election_result_seals_member_select on public.election_result_seals;
create policy election_result_seals_member_select on public.election_result_seals
for select to authenticated
using (
  exists (
    select 1
    from public.org_members m
    where m.org_id = election_result_seals.org_id
      and m.user_id = auth.uid()
  )
);

create or replace function public.seal_ballot_round(
  p_org_id uuid,
  p_ballot_id uuid,
  p_round int,
  p_seal_secret text
)
returns table (
  seal_short text,
  seal_hash text,
  total_votes int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_ballot_status text;
  v_majority_rule text;
  v_closed_at timestamptz;
  v_counts jsonb := '{}'::jsonb;
  v_total_votes int := 0;
  v_snapshot jsonb;
  v_hash text;
  v_short text;
begin
  if p_seal_secret is null or length(trim(p_seal_secret)) < 16 then
    raise exception 'SEAL_SECRET is missing or too short' using errcode = 'P0001';
  end if;

  select e.id, b.status, b.majority_rule, coalesce(b.closes_at, now())
  into v_event_id, v_ballot_status, v_majority_rule, v_closed_at
  from public.ballots b
  join public.events e on e.id = b.event_id
  where b.id = p_ballot_id
    and e.org_id = p_org_id
  limit 1;

  if not found then
    raise exception 'Ballot not found in organization scope' using errcode = 'P0001';
  end if;

  if v_ballot_status <> 'CLOSED' then
    raise exception 'Ballot round must be CLOSED before sealing' using errcode = 'P0001';
  end if;

  select coalesce(sum(x.votes), 0)::int,
         coalesce(jsonb_object_agg(x.choice_id, x.votes order by x.choice_id), '{}'::jsonb)
  into v_total_votes, v_counts
  from (
    select v.choice_id::text as choice_id, count(*)::int as votes
    from public.votes v
    where v.ballot_id = p_ballot_id
      and v.vote_round = p_round
    group by v.choice_id
  ) x;

  v_snapshot := jsonb_build_object(
    'org_id', p_org_id,
    'event_id', v_event_id,
    'ballot_id', p_ballot_id,
    'round', p_round,
    'majority_rule', v_majority_rule,
    'total_votes', v_total_votes,
    'counts', v_counts,
    'closed_at', v_closed_at
  );

  v_hash := encode(extensions.digest((v_snapshot::text || ':' || p_seal_secret)::bytea, 'sha256'), 'hex');
  v_short := upper(substr(v_hash, 1, 12));

  insert into public.election_result_seals (
    org_id,
    event_id,
    ballot_id,
    vote_round,
    ballot_status,
    majority_rule,
    threshold_required,
    total_votes,
    counts,
    closed_at,
    seal_hash,
    seal_short
  )
  values (
    p_org_id,
    v_event_id,
    p_ballot_id,
    p_round,
    'CLOSED',
    v_majority_rule,
    v_majority_rule,
    v_total_votes,
    v_counts,
    v_closed_at,
    v_hash,
    v_short
  )
  on conflict (ballot_id, vote_round) do nothing;

  return query
  select s.seal_short, s.seal_hash, s.total_votes
  from public.election_result_seals s
  where s.ballot_id = p_ballot_id
    and s.vote_round = p_round
  limit 1;
end;
$$;

grant execute on function public.seal_ballot_round(uuid, uuid, int, text) to authenticated;

create or replace function public.seal_ballot_round(
  p_org_id uuid,
  p_ballot_id uuid,
  p_round int
)
returns table (
  seal_short text,
  seal_hash text,
  total_votes int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text := current_setting('app.seal_secret', true);
begin
  if v_secret is null or length(trim(v_secret)) = 0 then
    raise exception 'SEAL_SECRET not configured for direct RPC sealing' using errcode = 'P0001';
  end if;

  return query
  select *
  from public.seal_ballot_round(p_org_id, p_ballot_id, p_round, v_secret);
end;
$$;

grant execute on function public.seal_ballot_round(uuid, uuid, int) to authenticated;
