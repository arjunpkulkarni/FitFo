-- Profile photos: public HTTPS URL persisted on profiles row; binaries live in storage.

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is 'Public Supabase Storage URL for the user avatar (JPEG/PNG/WebP).';

-- Public bucket so <Image uri=…> can load without signed URLs from the mobile app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  2621440,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
