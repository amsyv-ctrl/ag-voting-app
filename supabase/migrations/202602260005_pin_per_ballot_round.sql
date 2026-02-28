alter table pin_uses
  add column if not exists vote_round integer not null default 1;

update pin_uses pu
set vote_round = coalesce(v.vote_round, b.vote_round, 1)
from ballots b
left join votes v on v.id = pu.vote_id
where pu.ballot_id = b.id
  and (pu.vote_round is null or pu.vote_round < 1);

alter table pin_uses
  drop constraint if exists pin_uses_pin_id_ballot_id_key;

alter table pin_uses
  drop constraint if exists pin_uses_pin_id_ballot_id_vote_round_key;

alter table pin_uses
  add constraint pin_uses_pin_id_ballot_id_vote_round_key unique (pin_id, ballot_id, vote_round);

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

  select b.id, b.event_id, b.status, b.opens_at, b.closes_at, b.vote_round
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

  insert into votes (ballot_id, choice_id, vote_round)
  values (v_ballot.id, p_choice_id, v_ballot.vote_round)
  returning id into v_vote_id;

  insert into pin_uses (pin_id, ballot_id, vote_round, used_at, device_fingerprint_hash, vote_id)
  values (v_pin.id, v_ballot.id, v_ballot.vote_round, v_now, p_device_fingerprint_hash, v_vote_id);

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
