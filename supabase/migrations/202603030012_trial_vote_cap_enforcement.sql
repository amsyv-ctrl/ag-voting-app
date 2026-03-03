-- Step 4: enforce trial vote cap in a concurrency-safe way.
-- increment_trial_vote atomically reserves one trial vote slot.
-- decrement_trial_vote is a compensation helper used when vote insert fails after reservation.

create or replace function public.increment_trial_vote(p_org_id uuid, p_event_id uuid)
returns table(allowed boolean, remaining int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_votes_used int;
  v_trial_votes_limit int;
begin
  if not exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.org_id = p_org_id
      and e.is_trial_event = true
  ) then
    select o.trial_votes_used, o.trial_votes_limit
    into v_trial_votes_used, v_trial_votes_limit
    from public.organizations o
    where o.id = p_org_id;

    return query
    select false, greatest(coalesce(v_trial_votes_limit, 0) - coalesce(v_trial_votes_used, 0), 0);
    return;
  end if;

  update public.organizations o
  set trial_votes_used = o.trial_votes_used + 1
  where o.id = p_org_id
    and o.trial_event_id = p_event_id
    and o.trial_votes_used < o.trial_votes_limit
  returning o.trial_votes_limit - o.trial_votes_used
  into remaining;

  if found then
    return query select true, remaining;
    return;
  end if;

  select o.trial_votes_used, o.trial_votes_limit
  into v_trial_votes_used, v_trial_votes_limit
  from public.organizations o
  where o.id = p_org_id;

  return query
  select false, greatest(coalesce(v_trial_votes_limit, 0) - coalesce(v_trial_votes_used, 0), 0);
end;
$$;

create or replace function public.decrement_trial_vote(p_org_id uuid, p_event_id uuid)
returns table(remaining int)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organizations o
  set trial_votes_used = greatest(o.trial_votes_used - 1, 0)
  where o.id = p_org_id
    and o.trial_event_id = p_event_id
  returning o.trial_votes_limit - o.trial_votes_used
  into remaining;

  if not found then
    remaining := 0;
  end if;

  return query select remaining;
end;
$$;

grant execute on function public.increment_trial_vote(uuid, uuid) to authenticated;
grant execute on function public.decrement_trial_vote(uuid, uuid) to authenticated;

