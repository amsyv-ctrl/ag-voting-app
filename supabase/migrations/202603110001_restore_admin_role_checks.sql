-- Restore OWNER/ADMIN role enforcement for admin mutations.
-- Step 5 entitlement gating accidentally widened event operation access to any org member.
-- This migration reintroduces role checks in the helper functions used by browser-side RLS.

create or replace function public.can_create_events_in_org_for_user(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    join public.org_members om on om.org_id = o.id
    where o.id = p_org_id
      and om.user_id = p_user_id
      and om.role in ('OWNER', 'ADMIN')
      and (
        (o.mode = 'PAID' and o.is_active = true)
        or (
          o.mode = 'TRIAL'
          and o.trial_event_id is null
          and o.trial_votes_used < o.trial_votes_limit
        )
      )
  );
$$;

create or replace function public.can_operate_event_for_user(p_event_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    join public.organizations o on o.id = e.org_id
    join public.org_members om on om.org_id = e.org_id
    where e.id = p_event_id
      and om.user_id = p_user_id
      and om.role in ('OWNER', 'ADMIN')
      and (
        (o.mode = 'PAID' and o.is_active = true)
        or (
          o.mode = 'TRIAL'
          and e.is_trial_event = true
          and o.trial_event_id = e.id
          and o.trial_votes_used < o.trial_votes_limit
        )
      )
  );
$$;

grant execute on function public.can_create_events_in_org_for_user(uuid, uuid) to authenticated;
grant execute on function public.can_operate_event_for_user(uuid, uuid) to authenticated;
