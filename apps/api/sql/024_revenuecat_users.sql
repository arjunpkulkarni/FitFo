-- Lightweight mapping of Supabase profile id → RevenueCat app_user_id, plus a
-- thin mirror of the latest webhook-driven subscription status.
--
-- We deliberately set RevenueCat's appUserID = profiles.id at sign-in
-- (mobile/src/lib/revenueCat.ts → Purchases.logIn). This table is the
-- server-side record of that linkage so background jobs and webhook handlers
-- can resolve the mapping without depending on the mobile client.
--
-- Distinct from subscription_state (017): that table carries the full
-- trial-conversion lifecycle used by the notification scheduler. This table
-- is the simple mapping plus a coarse status snapshot, so internal services
-- have a single row per user with the latest RC event applied.
--
-- Writes only happen from the API service role (RLS on, no policies).

create extension if not exists pgcrypto;

create table if not exists public.revenuecat_users (
  id uuid primary key default gen_random_uuid(),

  -- The Supabase-issued user id (profiles.id). We treat profiles.id as the
  -- "Supabase auth user id" — historically the JWT subject for this app.
  supabase_user_id uuid not null unique
    references public.profiles (id) on delete cascade,

  -- Identical to supabase_user_id today (we set the RC SDK appUserID to
  -- profiles.id), kept as its own column so we can re-resolve users from
  -- webhook payloads without re-deriving the value.
  revenuecat_app_user_id text not null unique,

  -- Snapshots of the identity fields used to set up the RC user. Nullable
  -- because phone-only accounts have no Apple id and vice versa.
  phone_number text,
  apple_provider_id text,

  -- Coarse status mirrored from the latest webhook:
  --   trialing | active | cancelled | expired | unknown
  subscription_status text not null default 'unknown',

  -- Latest RC product the user is on (e.g. fitfo_premium_annual).
  product_id text,

  -- Webhook-driven timestamps. We only persist what we need to react to a
  -- user's state; the raw RC payload is intentionally NOT stored.
  trial_started_at timestamptz,
  expires_at timestamptz,
  last_event_type text,
  last_event_at timestamptz,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists revenuecat_users_rc_app_user_id_idx
  on public.revenuecat_users (revenuecat_app_user_id);

create index if not exists revenuecat_users_phone_idx
  on public.revenuecat_users (phone_number)
  where phone_number is not null;

create index if not exists revenuecat_users_apple_idx
  on public.revenuecat_users (apple_provider_id)
  where apple_provider_id is not null;

create or replace function public.set_revenuecat_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists revenuecat_users_set_updated_at on public.revenuecat_users;

create trigger revenuecat_users_set_updated_at
before update on public.revenuecat_users
for each row
execute function public.set_revenuecat_users_updated_at();

alter table public.revenuecat_users enable row level security;
