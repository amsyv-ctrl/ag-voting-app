alter table public.organizations
  add column if not exists internal_notes text null;

comment on column public.organizations.internal_notes is 'Private super-admin notes for support and billing operations.';
