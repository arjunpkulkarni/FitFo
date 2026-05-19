-- Optional Instagram handle collected during onboarding (after auth).
alter table public.profiles
  add column if not exists instagram_handle text;

alter table public.profiles
  drop constraint if exists profiles_instagram_handle_format_check;

alter table public.profiles
  add constraint profiles_instagram_handle_format_check
  check (
    instagram_handle is null
    or instagram_handle ~ '^[a-z0-9]([a-z0-9._]{0,28}[a-z0-9])?$'
  );

create unique index if not exists profiles_instagram_handle_lower_key
  on public.profiles (lower(instagram_handle))
  where instagram_handle is not null;
