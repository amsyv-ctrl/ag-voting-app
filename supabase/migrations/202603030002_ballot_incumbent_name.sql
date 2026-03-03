alter table ballots
  add column if not exists incumbent_name text;

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
  where c.ballot_id = v_ballot.id;

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
