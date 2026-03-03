alter table choices
  add column if not exists is_withdrawn boolean not null default false;

alter table choices
  add column if not exists withdrawn_at timestamptz;

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
  select b.id, b.slug, b.title, b.incumbent_name, b.description, b.ballot_type, b.majority_rule, b.status, b.opens_at, b.closes_at, b.vote_round, b.requires_pin, e.name as event_name
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
  where c.ballot_id = v_ballot.id
    and coalesce(c.is_withdrawn, false) = false;

  return jsonb_build_object(
    'ballot_id', v_ballot.id,
    'event_name', v_ballot.event_name,
    'slug', v_ballot.slug,
    'title', v_ballot.title,
    'incumbent_name', v_ballot.incumbent_name,
    'description', v_ballot.description,
    'ballot_type', v_ballot.ballot_type,
    'majority_rule', v_ballot.majority_rule,
    'status', v_ballot.status,
    'opens_at', v_ballot.opens_at,
    'closes_at', v_ballot.closes_at,
    'vote_round', v_ballot.vote_round,
    'requires_pin', v_ballot.requires_pin,
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
  v_hide_public boolean;
begin
  select b.id, b.majority_rule, b.status, b.closes_at, b.vote_round, b.results_visibility
  into v_ballot
  from ballots b
  where b.slug = p_slug
  limit 1;

  if not found then
    raise exception 'Ballot not found' using errcode = 'P0001';
  end if;

  if v_ballot.status = 'OPEN' and v_ballot.closes_at is not null and v_ballot.closes_at <= now() then
    update ballots set status = 'CLOSED' where id = v_ballot.id;
    v_ballot.status := 'CLOSED';
  end if;

  select count(*) into v_total
  from votes v
  join choices c on c.id = v.choice_id
  where v.ballot_id = v_ballot.id
    and v.vote_round = v_ballot.vote_round
    and coalesce(c.is_withdrawn, false) = false;

  with counts as (
    select c.id as choice_id, c.label, count(v.id)::bigint as votes
    from choices c
    left join votes v
      on v.choice_id = c.id
      and v.ballot_id = v_ballot.id
      and v.vote_round = v_ballot.vote_round
    where c.ballot_id = v_ballot.id
      and coalesce(c.is_withdrawn, false) = false
    group by c.id, c.label, c.sort_order
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

  v_hide_public := coalesce(v_ballot.results_visibility, 'LIVE') = 'CLOSED_ONLY' and v_ballot.status = 'OPEN';

  return jsonb_build_object(
    'ballot_id', v_ballot.id,
    'ballot_status', v_ballot.status,
    'vote_round', v_ballot.vote_round,
    'total_votes', v_total,
    'rows', v_rows,
    'winner_choice_id', null,
    'winner_label', null,
    'top_pct', null,
    'has_tie', false,
    'majority_rule', v_ballot.majority_rule,
    'results_visibility', coalesce(v_ballot.results_visibility, 'LIVE'),
    'hidden_until_closed', v_hide_public
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
  select b.id, b.event_id, b.status, b.opens_at, b.closes_at, b.vote_round, b.requires_pin
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
      and coalesce(c.is_withdrawn, false) = false
  ) then
    raise exception 'Invalid choice' using errcode = 'P0001';
  end if;

  if v_ballot.requires_pin then
    if p_pin_code is null or p_pin_code !~ '^[0-9]{4}$' then
      raise exception 'PIN must be a 4-digit code' using errcode = 'P0001';
    end if;

    select p.id
    into v_pin
    from pins p
    where p.event_id = v_ballot.event_id
      and p.is_active = true
      and (
        p.code = p_pin_code
        or extensions.crypt(p_pin_code, p.code) = p.code
      )
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
        and pu.vote_round = v_ballot.vote_round
    ) then
      raise exception 'PIN already used for this ballot round' using errcode = 'P0001';
    end if;
  end if;

  insert into votes (ballot_id, choice_id, vote_round)
  values (v_ballot.id, p_choice_id, v_ballot.vote_round)
  returning id into v_vote_id;

  if v_ballot.requires_pin then
    insert into pin_uses (pin_id, ballot_id, vote_round, used_at, device_fingerprint_hash, vote_id)
    values (v_pin.id, v_ballot.id, v_ballot.vote_round, v_now, p_device_fingerprint_hash, v_vote_id);
  end if;

  return jsonb_build_object(
    'message', 'Vote received',
    'voteId', v_vote_id,
    'submittedAt', v_now
  );
exception
  when unique_violation then
    raise exception 'PIN already used for this ballot round' using errcode = 'P0001';
end;
$$;
