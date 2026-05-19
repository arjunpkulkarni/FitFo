-- Usernames are required by the mobile app before billing access.
-- Existing users remain nullable at the DB layer so they can be prompted
-- in-app on next launch; uniqueness prevents copying another user's handle.
alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (
    username is null
    or username ~ '^[a-z0-9]([a-z0-9_]{1,18})[a-z0-9]$'
  );

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null;
