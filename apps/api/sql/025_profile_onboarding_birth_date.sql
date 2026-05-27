-- Store the athlete's birth date from onboarding; age remains denormalized for
-- quick reads but is derived from birth_date on save when provided.

alter table if exists public.profile_onboarding
  add column if not exists birth_date date null;

comment on column public.profile_onboarding.birth_date is
  'Calendar birth date collected during onboarding (YYYY-MM-DD).';
