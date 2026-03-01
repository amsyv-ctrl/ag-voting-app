alter table ballots
  add column if not exists results_visibility text;

alter table ballots
  drop constraint if exists ballots_results_visibility_check;

alter table ballots
  add constraint ballots_results_visibility_check
  check (results_visibility in ('LIVE', 'CLOSED_ONLY') or results_visibility is null);

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
  end if;

  select count(*) into v_total
  from votes v
  where v.ballot_id = v_ballot.id
    and v.vote_round = v_ballot.vote_round;

  with counts as (
    select c.id as choice_id, c.label, count(v.id)::bigint as votes
    from choices c
    left join votes v
      on v.choice_id = c.id
      and v.ballot_id = v_ballot.id
      and v.vote_round = v_ballot.vote_round
    where c.ballot_id = v_ballot.id
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
