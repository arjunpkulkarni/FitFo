-- Freemium rollout: users can enter the app on a server-backed Free tier.

alter table public.profiles
  add column if not exists free_access_started_at timestamptz null;

comment on column public.profiles.free_access_started_at is
  'Set when a user skips the initial Pro paywall and starts the Free tier.';

create table if not exists public.ai_coach_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_key text not null,
  message_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ai_coach_usage_user_session_key unique (user_id, session_key)
);

create index if not exists ai_coach_usage_user_id_idx
  on public.ai_coach_usage (user_id, updated_at desc);

drop trigger if exists ai_coach_usage_set_updated_at on public.ai_coach_usage;
create trigger ai_coach_usage_set_updated_at
before update on public.ai_coach_usage
for each row
execute function public.set_workout_records_updated_at();

alter table public.ai_coach_usage enable row level security;
