-- Soft delete ballots instead of hard deleting them.

alter table public.ballots
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null;

create index if not exists ballots_event_deleted_idx on public.ballots(event_id, deleted_at);
create index if not exists ballots_slug_deleted_idx on public.ballots(slug, deleted_at);
