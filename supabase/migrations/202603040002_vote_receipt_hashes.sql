-- Tamper-evident vote receipts.
-- Secret-ballot safe: receipt values do not encode PIN or choice.

alter table public.votes
  add column if not exists receipt_hash text null,
  add column if not exists receipt_code text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'votes_receipt_hash_unique'
      and conrelid = 'public.votes'::regclass
  ) then
    alter table public.votes
      add constraint votes_receipt_hash_unique unique (receipt_hash);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'votes_receipt_code_unique'
      and conrelid = 'public.votes'::regclass
  ) then
    alter table public.votes
      add constraint votes_receipt_code_unique unique (receipt_code);
  end if;
end $$;

create index if not exists votes_receipt_code_idx on public.votes (receipt_code);
