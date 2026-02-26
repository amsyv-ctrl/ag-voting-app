create extension if not exists pgcrypto;

create type ballot_type as enum ('YES_NO', 'PICK_ONE');
create type majority_rule as enum ('SIMPLE', 'TWO_THIRDS');
create type ballot_status as enum ('DRAFT', 'OPEN', 'CLOSED');

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date,
  location text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists ballots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) 	on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  ballot_type ballot_type not null,
  majority_rule majority_rule not null,
  status ballot_status not null default 'DRAFT',
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists choices (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references ballots(id) on delete cascade,
  label text not null,
  sort_order int not null default 1,
  unique (ballot_id, sort_order)
);

create table if not exists pins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references ballots(id) on delete cascade,
  choice_id uuid not null references choices(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists pin_uses (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references pins(id) on delete cascade,
  ballot_id uuid not null references ballots(id) on delete cascade,
  used_at timestamptz not null default now(),
  device_fingerprint_hash text,
  vote_id uuid references votes(id) on delete set null,
  unique(pin_id, ballot_id)
);

create index if not exists idx_ballots_event_id on ballots(event_id);
create index if not exists idx_ballots_slug on ballots(slug);
create index if not exists idx_choices_ballot_id on choices(ballot_id);
create index if not exists idx_pins_event_id on pins(event_id);
create index if not exists idx_votes_ballot_id on votes(ballot_id);
create index if not exists idx_votes_choice_id on votes(choice_id);
create index if not exists idx_pin_uses_ballot_id on pin_uses(ballot_id);

alter table events enable row level security;
alter table ballots enable row level security;
alter table choices enable row level security;
alter table pins enable row level security;
alter table pin_uses enable row level security;
alter table votes enable row level security;

create policy "events_admin_select" on events
for select to authenticated
using (created_by = auth.uid());

create policy "events_admin_insert" on events
for insert to authenticated
with check (created_by = auth.uid());

create policy "events_admin_update" on events
for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "events_admin_delete" on events
for delete to authenticated
using (created_by = auth.uid());

create policy "ballots_admin_all" on ballots
for all to authenticated
using (
  exists (
    select 1 from events e
    where e.id = ballots.event_id
    and e.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1 from events e
    where e.id = ballots.event_id
    and e.created_by = auth.uid()
  )
);

create policy "choices_admin_all" on choices
for all to authenticated
using (
  exists (
    select 1
    from ballots b
    join events e on e.id = b.event_id
    where b.id = choices.ballot_id
    and e.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from ballots b
    join events e on e.id = b.event_id
    where b.id = choices.ballot_id
    and e.created_by = auth.uid()
  )
);

create policy "pins_admin_select" on pins
for select to authenticated
using (
  exists (
    select 1
    from events e
    where e.id = pins.event_id
    and e.created_by = auth.uid()
  )
);

create policy "pin_uses_admin_select" on pin_uses
for select to authenticated
using (
  exists (
    select 1
    from ballots b
    join events e on e.id = b.event_id
    where b.id = pin_uses.ballot_id
    and e.created_by = auth.uid()
  )
);

create policy "votes_admin_select" on votes
for select to authenticated
using (
  exists (
    select 1
    from ballots b
    join events e on e.id = b.event_id
    where b.id = votes.ballot_id
    and e.created_by = auth.uid()
  )
);

create or replace function get_ballot_public(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ballot record;
  v_choices jsonb;
begin
  select b.id, b.slug, b.title, b.description, b.ballot_type, b.majority_rule, b.status, b.opens_at, b.closes_at, e.name as event_name
  into v_ballot
  from ballots b
  join events e on e.id = b.event_id
  where b.slug = p_slug
  and b.status = 'OPEN'
  and (b.opens_at is null or b.opens_at <= now())
  and (b.closes_at is null or b.closes_at > now())
  limit 1;

  if not found then
    raise exception 'Ballot is not open' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'sort_order', c.sort_order) order by c.sort_order),
    '[]'::jsonb
  )
  into v_choices
  from choices c
  where c.ballot_id = v_ballot.id;

  return jsonb_build_object(
    'ballot_id', v_ballot.id,
    'event_name', v_ballot.event_name,
    'slug', v_ballot.slug,
    'title', v_ballot.title,
    'description', v_ballot.description,
    'ballot_type', v_ballot.ballot_type,
    'majority_rule', v_ballot.majority_rule,
    'status', v_ballot.status,
    'opens_at', v_ballot.opens_at,
    'closes_at', v_ballot.closes_at,
    'choices', v_choices
  );
end;
$$;

create or replace function get_ballot_results_public(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ballot record;
  v_total bigint;
  v_rows jsonb;
begin
  select b.id, b.majority_rule, b.status, b.closes_at
  into v_ballot
  from ballots b
  where b.slug = p_slug
  and b.status in ('OPEN', 'CLOSED')
  limit 1;

  if not found then
    raise exception 'Ballot not found' using errcode = 'P0001';
  end if;

  if v_ballot.status = 'OPEN' and v_ballot.closes_at is not null and v_ballot.closes_at <= now() then
    update ballots set status = 'CLOSED' where id = v_ballot.id;
  end if;

  select count(*) into v_total from votes v where v.ballot_id = v_ballot.id;

  with counts as (
    select c.id as choice_id, c.label, count(v.id)::bigint as votes
    from choices c
    left join votes v on v.choice_id = c.id and v.ballot_id = v_ballot.id
    where c.ballot_id = v_ballot.id
    group by c.id, c.label
    order by count(v.id) desc, c.sort_order asc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'choice_id', choice_id,
        'label', label,
        'votes', votes,
        'pct', case when v_total = 0 then 0 else votes::numeric / v_total::numeric end
      )
    ),
    '[]'::jsonb
  )
  into v_rows
  from counts;

  return jsonb_build_object(
    'ballot_id', v_ballot.id,
    'total_votes', v_total,
    'rows', v_rows,
    'winner_choice_id', null,
    'winner_label', null,
    'top_pct', null,
    'has_tie', false,
    'majority_rule', v_ballot.majority_rule
  );
end;
$$;

create or replace function submit_vote_atomic(
  p_slug text,
  p_pin_code text,
  p_choice_id uuid,
  p_device_fingerprint_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ballot record;
  v_pin record;
  v_vote_id uuid;
  v_now timestamptz := now();
begin
  if p_pin_code !~ '^[0-9]{4}$' then
    raise exception 'PIN must be a 4-digit code' using errcode = 'P0001';
  end if;

  select b.id, b.event_id, b.status, b.opens_at, b.closes_at
  into v_ballot
  from ballots b
  where b.slug = p_slug
  limit 1;

  if not found then
    raise exception 'Ballot not found' using errcode = 'P0001';
  end if;

  if v_ballot.status <> 'OPEN' or (v_ballot.opens_at is not null and v_ballot.opens_at > v_now) then
    raise exception 'Ballot is closed' using errcode = 'P0001';
  end if;

  if v_ballot.closes_at is not null and v_ballot.closes_at <= v_now then
    update ballots set status = 'CLOSED' where id = v_ballot.id;
    raise exception 'Ballot is closed' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from choices c
    where c.id = p_choice_id
    and c.ballot_id = v_ballot.id
  ) then
    raise exception 'Invalid choice' using errcode = 'P0001';
  end if;

  select p.id
  into v_pin
  from pins p
  where p.event_id = v_ballot.event_id
    and p.is_active = true
    and crypt(p_pin_code, p.code) = p.code
  order by p.created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'Invalid PIN' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from pin_uses pu
    where pu.pin_id = v_pin.id
      and pu.ballot_id = v_ballot.id
  ) then
    raise exception 'PIN already used for this ballot' using errcode = 'P0001';
  end if;

  insert into votes (ballot_id, choice_id)
  values (v_ballot.id, p_choice_id)
  returning id into v_vote_id;

  insert into pin_uses (pin_id, ballot_id, used_at, device_fingerprint_hash, vote_id)
  values (v_pin.id, v_ballot.id, v_now, p_device_fingerprint_hash, v_vote_id);

  return jsonb_build_object(
    'message', 'Vote received',
    'voteId', v_vote_id,
    'submittedAt', v_now
  );
exception
  when unique_violation then
    raise exception 'PIN already used for this ballot' using errcode = 'P0001';
end;
$$;

revoke all on function get_ballot_public(text) from public;
revoke all on function get_ballot_results_public(text) from public;
revoke all on function submit_vote_atomic(text, text, uuid, text) from public;

grant execute on function get_ballot_public(text) to anon, authenticated;
grant execute on function get_ballot_results_public(text) to anon, authenticated;
