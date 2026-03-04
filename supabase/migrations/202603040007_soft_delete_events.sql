alter table public.events
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id) on delete set null;

create index if not exists events_org_archived_idx
  on public.events(org_id, archived_at);
