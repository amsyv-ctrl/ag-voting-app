-- Step 5: entitlement-based server-side gating for admin mutations.
-- This migration updates RLS so browser-side Supabase writes are still enforced by access rules.

create or replace function public.is_org_paid_active_for_user(p_org_id uuid, p_user_id uuid default auth.uid())
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
      and o.mode = 'PAID'
      and o.is_active = true
  );
$$;

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

create or replace function public.can_read_event_for_user(p_event_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    join public.org_members om on om.org_id = e.org_id
    where e.id = p_event_id
      and om.user_id = p_user_id
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

grant execute on function public.is_org_paid_active_for_user(uuid, uuid) to authenticated;
grant execute on function public.can_create_events_in_org_for_user(uuid, uuid) to authenticated;
grant execute on function public.can_read_event_for_user(uuid, uuid) to authenticated;
grant execute on function public.can_operate_event_for_user(uuid, uuid) to authenticated;

-- Events policies
drop policy if exists "events_org_select" on public.events;
drop policy if exists "events_org_insert" on public.events;
drop policy if exists "events_org_update" on public.events;
drop policy if exists "events_org_delete" on public.events;

create policy "events_org_select" on public.events
for select to authenticated
using (public.can_read_event_for_user(id, auth.uid()));

create policy "events_org_insert" on public.events
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.can_create_events_in_org_for_user(org_id, auth.uid())
);

create policy "events_org_update" on public.events
for update to authenticated
using (public.can_operate_event_for_user(id, auth.uid()))
with check (public.can_operate_event_for_user(id, auth.uid()));

create policy "events_org_delete" on public.events
for delete to authenticated
using (public.is_org_paid_active_for_user(org_id, auth.uid()));

-- Ballots policies
drop policy if exists "ballots_admin_all" on public.ballots;
drop policy if exists "ballots_select_by_event_access" on public.ballots;
drop policy if exists "ballots_mutation_by_event_operate_access" on public.ballots;

create policy "ballots_select_by_event_access" on public.ballots
for select to authenticated
using (public.can_read_event_for_user(event_id, auth.uid()));

create policy "ballots_mutation_by_event_operate_access" on public.ballots
for all to authenticated
using (public.can_operate_event_for_user(event_id, auth.uid()))
with check (public.can_operate_event_for_user(event_id, auth.uid()));

-- Choices policies
drop policy if exists "choices_admin_all" on public.choices;
drop policy if exists "choices_select_by_event_access" on public.choices;
drop policy if exists "choices_mutation_by_event_operate_access" on public.choices;

create policy "choices_select_by_event_access" on public.choices
for select to authenticated
using (
  exists (
    select 1
    from public.ballots b
    where b.id = choices.ballot_id
      and public.can_read_event_for_user(b.event_id, auth.uid())
  )
);

create policy "choices_mutation_by_event_operate_access" on public.choices
for all to authenticated
using (
  exists (
    select 1
    from public.ballots b
    where b.id = choices.ballot_id
      and public.can_operate_event_for_user(b.event_id, auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.ballots b
    where b.id = choices.ballot_id
      and public.can_operate_event_for_user(b.event_id, auth.uid())
  )
);

-- Pins policies
drop policy if exists "pins_admin_select" on public.pins;
drop policy if exists "pins_admin_delete" on public.pins;
drop policy if exists "pins_select_by_event_access" on public.pins;
drop policy if exists "pins_delete_by_event_operate_access" on public.pins;

create policy "pins_select_by_event_access" on public.pins
for select to authenticated
using (public.can_read_event_for_user(event_id, auth.uid()));

create policy "pins_delete_by_event_operate_access" on public.pins
for delete to authenticated
using (public.can_operate_event_for_user(event_id, auth.uid()));

-- Admin read policies for vote + pin usage history.
drop policy if exists "pin_uses_admin_select" on public.pin_uses;
drop policy if exists "votes_admin_select" on public.votes;
drop policy if exists "pin_uses_select_by_event_access" on public.pin_uses;
drop policy if exists "votes_select_by_event_access" on public.votes;

create policy "pin_uses_select_by_event_access" on public.pin_uses
for select to authenticated
using (
  exists (
    select 1
    from public.ballots b
    where b.id = pin_uses.ballot_id
      and public.can_read_event_for_user(b.event_id, auth.uid())
  )
);

create policy "votes_select_by_event_access" on public.votes
for select to authenticated
using (
  exists (
    select 1
    from public.ballots b
    where b.id = votes.ballot_id
      and public.can_read_event_for_user(b.event_id, auth.uid())
  )
);

