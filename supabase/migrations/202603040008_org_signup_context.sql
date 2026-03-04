alter table public.organizations
  add column if not exists signup_role text null,
  add column if not exists estimated_voting_size text null,
  add column if not exists organization_type text null,
  add column if not exists country text null,
  add column if not exists address_line1 text null,
  add column if not exists address_line2 text null,
  add column if not exists city text null,
  add column if not exists state_region text null,
  add column if not exists postal_code text null;

comment on column public.organizations.signup_role is 'Signup context: role selected by the account owner.';
comment on column public.organizations.estimated_voting_size is 'Signup context: expected voting volume bucket.';
comment on column public.organizations.organization_type is 'Signup context: organization category.';
