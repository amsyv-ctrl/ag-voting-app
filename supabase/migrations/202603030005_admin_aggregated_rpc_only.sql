-- Aggregated admin RPCs to reduce raw vote-log visibility in the client.

create or replace function get_ballot_round_history_admin(p_ballot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_round integer;
  v_rounds jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from ballots b
    join events e on e.id = b.event_id
    where b.id = p_ballot_id
      and e.created_by = auth.uid()
  ) then
    raise exception 'Not authorized' using errcode = 'P0001';
  end if;

  select b.vote_round into v_current_round
  from ballots b
  where b.id = p_ballot_id;

  with rounds as (
    select distinct v.vote_round
    from votes v
    where v.ballot_id = p_ballot_id
    union
    select v_current_round
  ),
  round_choice_counts as (
    select
      r.vote_round,
      c.id as choice_id,
      c.label,
      c.sort_order,
      coalesce(c.is_withdrawn, false) as is_withdrawn,
      count(v.id)::bigint as votes
    from rounds r
    join choices c on c.ballot_id = p_ballot_id
    left join votes v
      on v.ballot_id = p_ballot_id
      and v.vote_round = r.vote_round
      and v.choice_id = c.id
    group by r.vote_round, c.id, c.label, c.sort_order, c.is_withdrawn
  ),
  round_totals as (
    select vote_round, sum(votes)::bigint as total_votes
    from round_choice_counts
    group by vote_round
  ),
  rows_per_round as (
    select
      rc.vote_round,
      rt.total_votes,
      jsonb_agg(
        jsonb_build_object(
          'choice_id', rc.choice_id,
          'label', rc.label,
          'votes', rc.votes,
          'pct', case when rt.total_votes = 0 then 0 else rc.votes::numeric / rt.total_votes::numeric end,
          'is_withdrawn', rc.is_withdrawn
        )
        order by rc.votes desc, rc.sort_order asc
      ) as rows
    from round_choice_counts rc
    join round_totals rt on rt.vote_round = rc.vote_round
    group by rc.vote_round, rt.total_votes
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'vote_round', vote_round,
        'total_votes', total_votes,
        'rows', rows
      )
      order by vote_round desc
    ),
    '[]'::jsonb
  )
  into v_rounds
  from rows_per_round;

  return jsonb_build_object(
    'ballot_id', p_ballot_id,
    'current_vote_round', v_current_round,
    'rounds', v_rounds
  );
end;
$$;

create or replace function export_event_results_admin(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  r record;
  c record;
  v record;
  v_event record;
  counts jsonb;
  round_summaries jsonb := '[]'::jsonb;
  winner_choice_id uuid;
  winner_label text;
  winner_votes bigint;
  second_votes bigint;
  total_votes bigint;
  winner_pct numeric;
  election_reached_at timestamptz;
  running_total integer;
  running_winner integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select e.id, e.name, e.date, e.location, e.voting_staff_names
  into v_event
  from events e
  where e.id = p_event_id
    and e.created_by = auth.uid();

  if not found then
    raise exception 'Not authorized' using errcode = 'P0001';
  end if;

  for b in
    select id, title, incumbent_name, slug, majority_rule, status
    from ballots
    where event_id = p_event_id
    order by created_at asc
  loop
    for r in
      select distinct v.vote_round
      from votes v
      where v.ballot_id = b.id
      order by v.vote_round asc
    loop
      select count(*)::bigint
      into total_votes
      from votes v
      where v.ballot_id = b.id and v.vote_round = r.vote_round;

      counts := '[]'::jsonb;
      for c in
        select
          ch.id as choice_id,
          ch.label,
          ch.sort_order,
          coalesce(ch.is_withdrawn, false) as is_withdrawn,
          count(v.id)::bigint as votes
        from choices ch
        left join votes v
          on v.choice_id = ch.id
          and v.ballot_id = b.id
          and v.vote_round = r.vote_round
        where ch.ballot_id = b.id
        group by ch.id, ch.label, ch.sort_order, ch.is_withdrawn
        order by votes desc, ch.sort_order asc
      loop
        counts := counts || jsonb_build_object(
          'choice_id', c.choice_id,
          'label', c.label,
          'votes', c.votes,
          'pct', case when total_votes = 0 then 0 else c.votes::numeric / total_votes::numeric end,
          'is_withdrawn', c.is_withdrawn
        );
      end loop;

      select t.choice_id, t.label, t.votes
      into winner_choice_id, winner_label, winner_votes
      from (
        select
          ch.id as choice_id,
          ch.label,
          count(v.id)::bigint as votes
        from choices ch
        left join votes v
          on v.choice_id = ch.id
          and v.ballot_id = b.id
          and v.vote_round = r.vote_round
        where ch.ballot_id = b.id
        group by ch.id, ch.label
        order by votes desc, ch.label asc
        limit 1
      ) t;

      select coalesce(max(vs.votes), 0)::bigint
      into second_votes
      from (
        select count(v.id)::bigint as votes
        from choices ch
        left join votes v
          on v.choice_id = ch.id
          and v.ballot_id = b.id
          and v.vote_round = r.vote_round
        where ch.ballot_id = b.id
        group by ch.id
        order by votes desc
        offset 1
      ) vs;

      winner_pct := case when total_votes = 0 then 0 else winner_votes::numeric / total_votes::numeric end;

      if total_votes = 0 or winner_votes = second_votes then
        winner_choice_id := null;
        winner_label := null;
      elsif b.majority_rule = 'SIMPLE' and winner_pct <= 0.5 then
        winner_choice_id := null;
        winner_label := null;
      elsif b.majority_rule = 'TWO_THIRDS' and winner_pct < (2::numeric / 3::numeric) then
        winner_choice_id := null;
        winner_label := null;
      end if;

      election_reached_at := null;
      if winner_choice_id is not null then
        running_total := 0;
        running_winner := 0;
        for v in
          select created_at, choice_id
          from votes
          where ballot_id = b.id and vote_round = r.vote_round
          order by created_at asc, id asc
        loop
          running_total := running_total + 1;
          if v.choice_id = winner_choice_id then
            running_winner := running_winner + 1;
          end if;

          if b.majority_rule = 'SIMPLE' and (running_winner::numeric / running_total::numeric) > 0.5 then
            election_reached_at := v.created_at;
            exit;
          elsif b.majority_rule = 'TWO_THIRDS' and (running_winner::numeric / running_total::numeric) >= (2::numeric / 3::numeric) then
            election_reached_at := v.created_at;
            exit;
          end if;
        end loop;
      end if;

      round_summaries := round_summaries || jsonb_build_object(
        'ballot_id', b.id,
        'ballot_title', b.title,
        'incumbent_name', b.incumbent_name,
        'ballot_slug', b.slug,
        'vote_round', r.vote_round,
        'majority_rule', b.majority_rule,
        'total_votes', total_votes,
        'election_reached_at', election_reached_at,
        'winner_choice_id', winner_choice_id,
        'winner_label', winner_label,
        'status', b.status,
        'counts', counts
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'exported_at', now(),
    'event', jsonb_build_object(
      'id', v_event.id,
      'name', v_event.name,
      'date', v_event.date,
      'location', v_event.location,
      'voting_staff_names', v_event.voting_staff_names
    ),
    'summaries', round_summaries
  );
end;
$$;
