-- Harden burst-vote path for conference usage by keeping more validation in one
-- transaction and adding supporting indexes for hot lookups.

create index if not exists idx_votes_ballot_round_created_at
  on public.votes(ballot_id, vote_round, created_at desc);

create index if not exists idx_choices_ballot_withdrawn_sort
  on public.choices(ballot_id, is_withdrawn, sort_order);

create index if not exists idx_pins_event_active_code_created
  on public.pins(event_id, is_active, code, created_at);

create or replace function public.submit_vote_atomic(
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
  select
    b.id,
    b.event_id,
    b.status,
    b.opens_at,
    b.closes_at,
    b.vote_round,
    b.requires_pin,
    e.org_id,
    e.is_trial_event,
    o.mode as org_mode,
    o.trial_event_id,
    o.trial_votes_limit,
    o.stripe_price_id
  into v_ballot
  from public.ballots b
  join public.events e on e.id = b.event_id
  join public.organizations o on o.id = e.org_id
  where b.slug = p_slug
    and b.deleted_at is null
  limit 1;

  if not found then
    raise exception 'Ballot not found' using errcode = 'P0001';
  end if;

  if v_ballot.status <> 'OPEN' or (v_ballot.opens_at is not null and v_ballot.opens_at > v_now) then
    raise exception 'Ballot is closed' using errcode = 'P0001';
  end if;

  if v_ballot.closes_at is not null and v_ballot.closes_at <= v_now then
    update public.ballots set status = 'CLOSED' where id = v_ballot.id;
    raise exception 'Ballot is closed' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.choices c
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

    if exists (
      select 1
      from public.pins p
      where p.event_id = v_ballot.event_id
        and p.code = p_pin_code
        and (p.is_active = false or p.disabled_at is not null)
    ) then
      raise exception 'PIN_DISABLED' using errcode = 'P0001';
    end if;

    select p.id
    into v_pin
    from public.pins p
    where p.event_id = v_ballot.event_id
      and p.is_active = true
      and p.disabled_at is null
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
      select 1
      from public.pin_uses pu
      where pu.pin_id = v_pin.id
        and pu.ballot_id = v_ballot.id
        and pu.vote_round = v_ballot.vote_round
    ) then
      raise exception 'PIN already used for this ballot round' using errcode = 'P0001';
    end if;
  end if;

  if v_ballot.org_mode = 'TRIAL'
    and v_ballot.is_trial_event = true
    and v_ballot.trial_event_id = v_ballot.event_id
  then
    update public.organizations o
    set trial_votes_used = o.trial_votes_used + 1
    where o.id = v_ballot.org_id
      and o.trial_event_id = v_ballot.event_id
      and o.trial_votes_used < o.trial_votes_limit;

    if not found then
      raise exception 'TRIAL_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  if v_ballot.requires_pin then
    insert into public.pin_uses (pin_id, ballot_id, vote_round, used_at)
    values (v_pin.id, v_ballot.id, v_ballot.vote_round, v_now);
  end if;

  insert into public.votes (ballot_id, choice_id, vote_round)
  values (v_ballot.id, p_choice_id, v_ballot.vote_round)
  returning id into v_vote_id;

  return jsonb_build_object(
    'message', 'Vote received',
    'voteId', v_vote_id,
    'submittedAt', v_now,
    'eventId', v_ballot.event_id,
    'orgId', v_ballot.org_id,
    'orgMode', v_ballot.org_mode,
    'stripePriceId', v_ballot.stripe_price_id,
    'trialVotesLimit', v_ballot.trial_votes_limit
  );
exception
  when unique_violation then
    raise exception 'PIN already used for this ballot round' using errcode = 'P0001';
end;
$$;
