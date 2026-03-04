-- Minimal election audit log for operational and integrity events.

create table if not exists public.election_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid null references public.events(id) on delete set null,
  ballot_id uuid null references public.ballots(id) on delete set null,
  action text not null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists election_audit_log_org_created_idx
  on public.election_audit_log(org_id, created_at desc);

alter table public.election_audit_log enable row level security;

grant select on public.election_audit_log to authenticated;

drop policy if exists election_audit_log_org_admin_select on public.election_audit_log;
create policy election_audit_log_org_admin_select on public.election_audit_log
for select to authenticated
using (
  exists (
    select 1
    from public.org_members m
    where m.org_id = election_audit_log.org_id
      and m.user_id = auth.uid()
      and m.role in ('OWNER', 'ADMIN')
  )
);
