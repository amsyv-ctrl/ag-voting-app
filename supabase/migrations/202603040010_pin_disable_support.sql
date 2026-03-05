alter table public.pins
  add column if not exists disabled_at timestamptz null,
  add column if not exists disabled_by uuid null references auth.users(id) on delete set null;

create index if not exists idx_pins_event_code on public.pins(event_id, code);
create index if not exists idx_pins_event_disabled_at on public.pins(event_id, disabled_at);
