create extension if not exists pgcrypto;

create or replace function public.set_workout_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles (id) on delete cascade,
  source_url text not null,
  status text not null default 'pending',
  error text null,
  provider_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ingestion_jobs_status_check
    check (status in (
      'pending',
      'fetching',
      'transcribing',
      'parsing',
      'review_pending',
      'complete',
      'failed'
    ))
);

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ingestion_jobs (id) on delete cascade,
  text text not null,
  segments jsonb null,
  language text null,
  model text null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid null references public.ingestion_jobs (id) on delete set null,
  user_id uuid null references public.profiles (id) on delete cascade,
  title text null,
  plan jsonb not null,
  parser_model text null,
  schema_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.ingestion_jobs
  add column if not exists user_id uuid;

alter table if exists public.workouts
  add column if not exists user_id uuid;

do $$
declare
  constraint_name text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'ingestion_jobs' and column_name = 'user_id'
  ) then
    -- Repair older installs where ingestion_jobs.user_id still points at a legacy users table.
    for constraint_name in
      select tc.constraint_name
      from information_schema.table_constraints as tc
      join information_schema.key_column_usage as kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'ingestion_jobs'
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'user_id'
    loop
      execute format(
        'alter table public.ingestion_jobs drop constraint if exists %I',
        constraint_name
      );
    end loop;

    update public.ingestion_jobs as jobs
    set user_id = null
    where user_id is not null
      and not exists (
        select 1
        from public.profiles as profiles
        where profiles.id = jobs.user_id
      );

    execute '
      alter table public.ingestion_jobs
      add constraint ingestion_jobs_user_id_fkey
      foreign key (user_id) references public.profiles (id) on delete cascade
    ';
  end if;
end;
$$;

do $$
declare
  constraint_name text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts' and column_name = 'user_id'
  ) then
    for constraint_name in
      select tc.constraint_name
      from information_schema.table_constraints as tc
      join information_schema.key_column_usage as kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'workouts'
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'user_id'
    loop
      execute format(
        'alter table public.workouts drop constraint if exists %I',
        constraint_name
      );
    end loop;

    -- Prefer preserving ownership by copying it from the related ingestion job when possible.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'ingestion_jobs' and column_name = 'user_id'
    ) then
      update public.workouts as workouts
      set user_id = jobs.user_id
      from public.ingestion_jobs as jobs
      where workouts.job_id = jobs.id
        and jobs.user_id is not null
        and (
          workouts.user_id is null
          or not exists (
            select 1
            from public.profiles as profiles
            where profiles.id = workouts.user_id
          )
        );
    end if;

    update public.workouts as workouts
    set user_id = null
    where user_id is not null
      and not exists (
        select 1
        from public.profiles as profiles
        where profiles.id = workouts.user_id
      );

    execute '
      alter table public.workouts
      add constraint workouts_user_id_fkey
      foreign key (user_id) references public.profiles (id) on delete cascade
    ';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'ingestion_jobs'
  ) then
    create index if not exists ingestion_jobs_user_id_idx
      on public.ingestion_jobs (user_id, created_at desc);
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'workouts'
  ) then
    create index if not exists workouts_user_id_idx
      on public.workouts (user_id, created_at desc);
  end if;
end;
$$;

create index if not exists transcripts_job_id_idx
  on public.transcripts (job_id);

drop trigger if exists ingestion_jobs_set_updated_at on public.ingestion_jobs;
create trigger ingestion_jobs_set_updated_at
before update on public.ingestion_jobs
for each row
execute function public.set_workout_records_updated_at();

drop trigger if exists workouts_set_updated_at on public.workouts;
create trigger workouts_set_updated_at
before update on public.workouts
for each row
execute function public.set_workout_records_updated_at();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'ingestion_jobs' and column_name = 'user_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts' and column_name = 'user_id'
  ) then
    update public.workouts as workouts
    set user_id = jobs.user_id
    from public.ingestion_jobs as jobs
    where workouts.job_id = jobs.id
      and workouts.user_id is null;
  end if;
end;
$$;

create table if not exists public.saved_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_id uuid null references public.workouts (id) on delete set null,
  job_id uuid null references public.ingestion_jobs (id) on delete set null,
  source_url text null,
  title text not null,
  description text null,
  meta_left text null,
  meta_right text null,
  badge_label text null,
  workout_plan jsonb null,
  saved_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists saved_workouts_user_id_idx
  on public.saved_workouts (user_id, saved_at desc);

create unique index if not exists saved_workouts_user_workout_uidx
  on public.saved_workouts (user_id, workout_id)
  where workout_id is not null;

drop trigger if exists saved_workouts_set_updated_at on public.saved_workouts;
create trigger saved_workouts_set_updated_at
before update on public.saved_workouts
for each row
execute function public.set_workout_records_updated_at();

create table if not exists public.completed_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_id uuid null references public.workouts (id) on delete set null,
  job_id uuid null references public.ingestion_jobs (id) on delete set null,
  source_url text null,
  title text not null,
  description text null,
  summary text null,
  exercises jsonb not null default '[]'::jsonb,
  workout_plan jsonb null,
  notes text null,
  calories integer null,
  difficulty text null,
  tags jsonb not null default '[]'::jsonb,
  average_rest_seconds integer null,
  started_at timestamptz null,
  completed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists completed_workouts_user_id_idx
  on public.completed_workouts (user_id, completed_at desc);

drop trigger if exists completed_workouts_set_updated_at on public.completed_workouts;
create trigger completed_workouts_set_updated_at
before update on public.completed_workouts
for each row
execute function public.set_workout_records_updated_at();

alter table if exists public.ingestion_jobs enable row level security;
alter table if exists public.workouts enable row level security;
alter table public.saved_workouts enable row level security;
alter table public.completed_workouts enable row level security;

drop policy if exists "ingestion_jobs_select_own" on public.ingestion_jobs;
create policy "ingestion_jobs_select_own"
on public.ingestion_jobs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "ingestion_jobs_insert_own" on public.ingestion_jobs;
create policy "ingestion_jobs_insert_own"
on public.ingestion_jobs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "ingestion_jobs_update_own" on public.ingestion_jobs;
create policy "ingestion_jobs_update_own"
on public.ingestion_jobs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "workouts_select_own" on public.workouts;
create policy "workouts_select_own"
on public.workouts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "workouts_insert_own" on public.workouts;
create policy "workouts_insert_own"
on public.workouts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "workouts_update_own" on public.workouts;
create policy "workouts_update_own"
on public.workouts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "saved_workouts_select_own" on public.saved_workouts;
create policy "saved_workouts_select_own"
on public.saved_workouts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "saved_workouts_insert_own" on public.saved_workouts;
create policy "saved_workouts_insert_own"
on public.saved_workouts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "saved_workouts_update_own" on public.saved_workouts;
create policy "saved_workouts_update_own"
on public.saved_workouts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "saved_workouts_delete_own" on public.saved_workouts;
create policy "saved_workouts_delete_own"
on public.saved_workouts
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "completed_workouts_select_own" on public.completed_workouts;
create policy "completed_workouts_select_own"
on public.completed_workouts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "completed_workouts_insert_own" on public.completed_workouts;
create policy "completed_workouts_insert_own"
on public.completed_workouts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "completed_workouts_update_own" on public.completed_workouts;
create policy "completed_workouts_update_own"
on public.completed_workouts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "completed_workouts_delete_own" on public.completed_workouts;
create policy "completed_workouts_delete_own"
on public.completed_workouts
for delete
to authenticated
using (auth.uid() = user_id);
