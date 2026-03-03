do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'ballot_status'::regtype
      and enumlabel = 'MANUAL_FALLBACK'
  ) then
    alter type ballot_status add value 'MANUAL_FALLBACK';
  end if;
end;
$$;

create table if not exists manual_round_result_batches (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references ballots(id) on delete cascade,
  vote_round integer not null check (vote_round > 0),
  notes text,
  closed_at timestamptz not null,
  recorded_by uuid not null default auth.uid() references auth.users(id),
  recorded_at timestamptz not null default now()
);

create table if not exists manual_round_result_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references manual_round_result_batches(id) on delete cascade,
  choice_id uuid not null references choices(id) on delete cascade,
  votes bigint not null check (votes >= 0),
  unique (batch_id, choice_id)
);

create index if not exists idx_manual_batches_ballot_round
  on manual_round_result_batches(ballot_id, vote_round, recorded_at desc);

create index if not exists idx_manual_rows_batch
  on manual_round_result_rows(batch_id);

alter table manual_round_result_batches enable row level security;
alter table manual_round_result_rows enable row level security;

drop policy if exists manual_batches_admin_select on manual_round_result_batches;
create policy manual_batches_admin_select on manual_round_result_batches
for select to authenticated
using (
  exists (
    select 1
    from ballots b
    join events e on e.id = b.event_id
    where b.id = manual_round_result_batches.ballot_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists manual_batches_admin_insert on manual_round_result_batches;
create policy manual_batches_admin_insert on manual_round_result_batches
for insert to authenticated
with check (
  exists (
    select 1
    from ballots b
    join events e on e.id = b.event_id
    where b.id = manual_round_result_batches.ballot_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists manual_rows_admin_select on manual_round_result_rows;
create policy manual_rows_admin_select on manual_round_result_rows
for select to authenticated
using (
  exists (
    select 1
    from manual_round_result_batches mb
    join ballots b on b.id = mb.ballot_id
    join events e on e.id = b.event_id
    where mb.id = manual_round_result_rows.batch_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists manual_rows_admin_insert on manual_round_result_rows;
create policy manual_rows_admin_insert on manual_round_result_rows
for insert to authenticated
with check (
  exists (
    select 1
    from manual_round_result_batches mb
    join ballots b on b.id = mb.ballot_id
    join events e on e.id = b.event_id
    where mb.id = manual_round_result_rows.batch_id
      and e.created_by = auth.uid()
  )
);

create or replace function record_manual_round_result(
  p_ballot_id uuid,
  p_counts jsonb,
  p_notes text default null,
  p_closed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ballot record;
  v_batch_id uuid;
  v_expected int;
  v_inserted int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select b.id, b.vote_round, b.status
  into v_ballot
  from ballots b
  join events e on e.id = b.event_id
  where b.id = p_ballot_id
    and e.created_by = auth.uid()
  limit 1;

  if not found then
    raise exception 'Not authorized' using errcode = 'P0001';
  end if;

  if v_ballot.status <> 'MANUAL_FALLBACK' then
    raise exception 'Ballot is not in manual fallback mode' using errcode = 'P0001';
  end if;

  insert into manual_round_result_batches (ballot_id, vote_round, notes, closed_at)
  values (v_ballot.id, v_ballot.vote_round, p_notes, coalesce(p_closed_at, now()))
  returning id into v_batch_id;

  with payload as (
    select
      (row_data->>'choice_id')::uuid as choice_id,
      greatest(0, coalesce((row_data->>'votes')::bigint, 0)) as votes
    from jsonb_array_elements(coalesce(p_counts, '[]'::jsonb)) as row_data
  ),
  valid_payload as (
    select p.choice_id, p.votes
    from payload p
    join choices c on c.id = p.choice_id
    where c.ballot_id = v_ballot.id
      and coalesce(c.is_withdrawn, false) = false
  )
  insert into manual_round_result_rows (batch_id, choice_id, votes)
  select v_batch_id, choice_id, votes
  from valid_payload;

  select count(*)
  into v_expected
  from choices c
  where c.ballot_id = v_ballot.id
    and coalesce(c.is_withdrawn, false) = false;

  select count(*)
  into v_inserted
  from manual_round_result_rows mr
  where mr.batch_id = v_batch_id;

  if v_inserted <> v_expected then
    raise exception 'Manual counts must include every active choice exactly once' using errcode = 'P0001';
  end if;

  update ballots
  set status = 'CLOSED',
      closes_at = coalesce(p_closed_at, now())
  where id = v_ballot.id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'ballot_id', v_ballot.id,
    'vote_round', v_ballot.vote_round,
    'recorded_at', now()
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
  v_manual_batch_id uuid;
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

  select mb.id
  into v_manual_batch_id
  from manual_round_result_batches mb
  where mb.ballot_id = v_ballot.id
    and mb.vote_round = v_ballot.vote_round
  order by mb.recorded_at desc
  limit 1;

  if v_manual_batch_id is not null then
    select coalesce(sum(mr.votes), 0)::bigint
    into v_total
    from manual_round_result_rows mr
    where mr.batch_id = v_manual_batch_id;

    with counts as (
      select
        c.id as choice_id,
        c.label,
        coalesce(mr.votes, 0)::bigint as votes,
        c.sort_order
      from choices c
      left join manual_round_result_rows mr
        on mr.choice_id = c.id
        and mr.batch_id = v_manual_batch_id
      where c.ballot_id = v_ballot.id
        and coalesce(c.is_withdrawn, false) = false
      order by coalesce(mr.votes, 0) desc, c.sort_order asc
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
  else
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
  end if;

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
    select distinct v.vote_round from votes v where v.ballot_id = p_ballot_id
    union
    select distinct mb.vote_round from manual_round_result_batches mb where mb.ballot_id = p_ballot_id
    union
    select v_current_round
  ),
  latest_manual as (
    select r.vote_round,
      (
        select mb.id
        from manual_round_result_batches mb
        where mb.ballot_id = p_ballot_id
          and mb.vote_round = r.vote_round
        order by mb.recorded_at desc
        limit 1
      ) as batch_id
    from rounds r
  ),
  round_choice_counts as (
    select
      r.vote_round,
      c.id as choice_id,
      c.label,
      c.sort_order,
      coalesce(c.is_withdrawn, false) as is_withdrawn,
      case
        when lm.batch_id is not null then coalesce(mr.votes, 0)::bigint
        else count(v.id)::bigint
      end as votes
    from rounds r
    join choices c on c.ballot_id = p_ballot_id
    left join latest_manual lm on lm.vote_round = r.vote_round
    left join manual_round_result_rows mr
      on mr.batch_id = lm.batch_id
      and mr.choice_id = c.id
    left join votes v
      on lm.batch_id is null
      and v.ballot_id = p_ballot_id
      and v.vote_round = r.vote_round
      and v.choice_id = c.id
    group by r.vote_round, c.id, c.label, c.sort_order, c.is_withdrawn, lm.batch_id, mr.votes
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
  v_manual_batch_id uuid;
  v_result_mode text;
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
      with rounds as (
        select distinct v.vote_round as vote_round
        from votes v
        where v.ballot_id = b.id
        union
        select distinct mb.vote_round as vote_round
        from manual_round_result_batches mb
        where mb.ballot_id = b.id
      )
      select vote_round from rounds order by vote_round asc
    loop
      select mb.id
      into v_manual_batch_id
      from manual_round_result_batches mb
      where mb.ballot_id = b.id
        and mb.vote_round = r.vote_round
      order by mb.recorded_at desc
      limit 1;

      if v_manual_batch_id is not null then
        v_result_mode := 'MANUAL';

        select coalesce(sum(mr.votes), 0)::bigint
        into total_votes
        from manual_round_result_rows mr
        where mr.batch_id = v_manual_batch_id;

        counts := '[]'::jsonb;
        for c in
          select
            ch.id as choice_id,
            ch.label,
            ch.sort_order,
            coalesce(ch.is_withdrawn, false) as is_withdrawn,
            coalesce(mr.votes, 0)::bigint as votes
          from choices ch
          left join manual_round_result_rows mr
            on mr.choice_id = ch.id
            and mr.batch_id = v_manual_batch_id
          where ch.ballot_id = b.id
          order by coalesce(mr.votes, 0) desc, ch.sort_order asc
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
            coalesce(mr.votes, 0)::bigint as votes
          from choices ch
          left join manual_round_result_rows mr
            on mr.choice_id = ch.id
            and mr.batch_id = v_manual_batch_id
          where ch.ballot_id = b.id
          order by coalesce(mr.votes, 0) desc, ch.label asc
          limit 1
        ) t;

        select coalesce(max(vs.votes), 0)::bigint
        into second_votes
        from (
          select coalesce(mr.votes, 0)::bigint as votes
          from choices ch
          left join manual_round_result_rows mr
            on mr.choice_id = ch.id
            and mr.batch_id = v_manual_batch_id
          where ch.ballot_id = b.id
          order by coalesce(mr.votes, 0) desc
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
      else
        v_result_mode := 'NORMAL';

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
      end if;

      round_summaries := round_summaries || jsonb_build_object(
        'ballot_id', b.id,
        'ballot_title', b.title,
        'incumbent_name', b.incumbent_name,
        'ballot_slug', b.slug,
        'vote_round', r.vote_round,
        'majority_rule', b.majority_rule,
        'majority_rule_applied', b.majority_rule,
        'result_mode', v_result_mode,
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
