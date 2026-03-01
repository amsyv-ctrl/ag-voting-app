create table if not exists admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  network text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table admin_profiles enable row level security;

revoke all on table admin_profiles from anon;
grant select, insert, update on table admin_profiles to authenticated;

drop policy if exists "profiles_self_select" on admin_profiles;
create policy "profiles_self_select" on admin_profiles
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "profiles_self_insert" on admin_profiles;
create policy "profiles_self_insert" on admin_profiles
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profiles_self_update" on admin_profiles;
create policy "profiles_self_update" on admin_profiles
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.sync_admin_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_profiles (
    user_id,
    first_name,
    last_name,
    network,
    address,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'network', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    now(),
    now()
  )
  on conflict (user_id) do update
  set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    network = excluded.network,
    address = excluded.address,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_sync_profile on auth.users;
create trigger on_auth_user_created_sync_profile
after insert on auth.users
for each row execute procedure public.sync_admin_profile_from_auth();
