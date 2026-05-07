-- Server-side mirror of RevenueCat subscription / trial state, plus an
-- idempotent log of lifecycle push notifications we have already sent.
--
-- Source of truth = RevenueCat webhook (services/revenuecat_webhook.py). Mobile
-- never writes to these tables. The 15-minute notification scheduler reads
-- subscription_state to fire 48-hour pre-charge reminders + conversion
-- confirmations, and writes notification_log rows so the same push never goes
-- out twice.
--
-- Both tables are written only by the API service role and have RLS enabled
-- with no policies, matching the rest of this schema.

create table if not exists public.subscription_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- RevenueCat identifiers. `revenuecat_app_user_id` is the SDK appUserID we
  -- set in mobile/src/lib/revenueCat.ts (= profiles.id). `original_app_user_id`
  -- is what RC reports as the original purchaser, useful for detecting Family
  -- Sharing leakage where the recipient differs from the buyer.
  revenuecat_app_user_id text,
  original_app_user_id text,

  -- The latest product the user is on. Stored as raw RC product id (e.g.
  -- "fitfo_premium_monthly"). entitlement_id is the RC entitlement (e.g. "pro").
  product_id text,
  entitlement_id text,

  -- Lifecycle status the scheduler keys off of:
  --   trialing | active | in_grace_period | cancelled | expired | unknown
  -- "cancelled" means the user opted out but the period hasn't ended yet —
  -- they still have access until current_period_end_at, but we must NOT fire
  -- the 48h pre-charge reminder for them.
  status text not null default 'unknown',

  -- "trial" while period_type is the introductory free trial.
  -- "normal" after first paid renewal. "intro" for paid intro offers.
  period_type text,

  -- Trial window. Set on TRIAL_STARTED / INITIAL_PURCHASE with trial period.
  -- trial_end_at is what we compare to now() for the 48h reminder.
  trial_start_at timestamptz,
  trial_end_at timestamptz,

  -- Most-recent paid period window (after trial converts).
  current_period_start_at timestamptz,
  current_period_end_at timestamptz,

  -- Amount the user will be charged at trial end / next renewal, in the
  -- currency RC reports. Used directly in push copy so we never hardcode.
  next_charge_amount_micros bigint, -- micros = price * 1_000_000 (Apple convention)
  next_charge_currency text,        -- ISO 4217, e.g. "USD"

  -- Family Sharing flag from RC payload. We block Family Sharing at the
  -- product level in App Store Connect, but if a user slips through we still
  -- record it so the scheduler can ignore them.
  is_family_share boolean not null default false,

  -- Cancellation telemetry (only set when status='cancelled').
  cancel_reason text,
  cancelled_at timestamptz,

  -- Last RC event we processed. Used for idempotency — the webhook handler
  -- skips events with id <= last_event_id to handle Apple/RC retries safely.
  last_event_id text,
  last_event_type text,
  last_event_at timestamptz,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- One row per user per RC original_app_user_id transaction lineage. Trial
  -- restarts / re-subscribes after expiration get a NEW row (different
  -- original_app_user_id from RC).
  constraint subscription_state_user_original_key
    unique (user_id, original_app_user_id)
);

create index if not exists subscription_state_user_id_idx
  on public.subscription_state (user_id);

-- Hot path for the scheduler tick: "find trials whose end time falls in the
-- 47–49h window from now, that aren't cancelled". Index keys by trial_end_at
-- with status filter inline.
create index if not exists subscription_state_trial_end_idx
  on public.subscription_state (trial_end_at)
  where period_type = 'trial' and status in ('trialing', 'active');

-- Hot path for conversion-confirmation tick: "find rows whose period_type
-- just flipped to 'normal' (post-trial) after the latest webhook update."
create index if not exists subscription_state_period_type_idx
  on public.subscription_state (period_type, updated_at);

alter table public.subscription_state enable row level security;


-- Idempotent log of every lifecycle push we sent. Unique (user_id, kind,
-- subscription_state_id) prevents double-sends across scheduler restarts.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subscription_state_id uuid references public.subscription_state (id) on delete cascade,

  -- Stable identifier for the notification class. Add a new value per copy
  -- variant if we A/B test, so suppression is per-variant.
  --   trial_pre_charge_48h | trial_converted | trial_extended | manual
  kind text not null,

  -- Free-form payload of what we sent (title/body/data) and Expo's response,
  -- so we can debug delivery without re-running the scheduler.
  sent_payload jsonb,
  expo_response jsonb,

  sent_at timestamptz not null default timezone('utc', now()),

  constraint notification_log_user_kind_state_key
    unique (user_id, kind, subscription_state_id)
);

create index if not exists notification_log_user_id_idx
  on public.notification_log (user_id);

create index if not exists notification_log_kind_idx
  on public.notification_log (kind, sent_at);

alter table public.notification_log enable row level security;
