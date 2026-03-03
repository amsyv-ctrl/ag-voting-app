-- Add explicit audit fields to aggregated event export payload.
-- This preserves secret-ballot protections while improving defensibility.

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
    select id, title, incumbent_name, slug, majority_rule, status, opens_at, closes_at
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
        'majority_rule_applied', b.majority_rule,
        'total_votes', total_votes,
        'votes_per_choice', counts,
        'election_reached_at', election_reached_at,
        'timestamp_of_close', b.closes_at,
        'opened_at', b.opens_at,
        'winner_choice_id', winner_choice_id,
        'winner_label', winner_label,
        'status', b.status
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
