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
    and (
      p.code = p_pin_code
      or crypt(p_pin_code, p.code) = p.code
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
