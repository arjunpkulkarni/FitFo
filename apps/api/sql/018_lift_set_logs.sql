-- Per-user lift set history derived from completed workouts (one row per logged set).
-- Populated automatically when a row is inserted into completed_workouts.

create table if not exists public.lift_set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  completed_workout_id uuid not null references public.completed_workouts (id) on delete cascade,
  exercise_name text not null,
  exercise_key text not null,
  set_position integer not null,
  weight_lbs numeric(10, 2),
  reps integer,
  duration_sec integer,
  recorded_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint lift_set_logs_set_position_check check (set_position >= 1),
  constraint lift_set_logs_weight_lbs_check
    check (weight_lbs is null or (weight_lbs > 0 and weight_lbs <= 15000)),
  constraint lift_set_logs_reps_check check (reps is null or reps >= 0),
  constraint lift_set_logs_duration_sec_check check (duration_sec is null or duration_sec >= 0)
);

create index if not exists lift_set_logs_user_key_recorded_idx
  on public.lift_set_logs (user_id, exercise_key, recorded_at desc);

create index if not exists lift_set_logs_completed_workout_idx
  on public.lift_set_logs (completed_workout_id);

-- Mirror mobile JSON shape: exercises[].name, exercises[].sets[].{ completed, loggedWeight,
-- loggedReps, targetDurationSec } (camelCase from the app payload stored in jsonb).
create or replace function public.completed_workouts_propagate_lift_set_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  exercise_elem jsonb;
  set_elem jsonb;
  raw_name text;
  exercise_display text;
  exercise_key text;
  set_ord integer;
  is_timed boolean;
  weight_txt text;
  weight_val numeric;
  reps_txt text;
  reps_val integer;
begin
  for exercise_elem in select jsonb_array_elements(coalesce(new.exercises, '[]'::jsonb))
  loop
    raw_name := trim(coalesce(exercise_elem->>'name', ''));
    if length(raw_name) = 0 then
      continue;
    end if;

    exercise_display := raw_name;
    exercise_key := lower(regexp_replace(raw_name, '\s+', ' ', 'g'));

    set_ord := 0;
    for set_elem in select jsonb_array_elements(coalesce(exercise_elem->'sets', '[]'::jsonb))
    loop
      set_ord := set_ord + 1;

      if not coalesce((set_elem->>'completed')::boolean, false) then
        continue;
      end if;

      is_timed := (set_elem->'targetDurationSec') is not null
        and jsonb_typeof(set_elem->'targetDurationSec') <> 'null';

      if is_timed then
        reps_txt := trim(coalesce(set_elem->>'loggedReps', ''));
        if reps_txt is null or reps_txt !~ '^[0-9]+$' then
          continue;
        end if;
        reps_val := reps_txt::integer;
        if reps_val < 0 then
          continue;
        end if;

        weight_txt := trim(coalesce(set_elem->>'loggedWeight', ''));
        if weight_txt ~ '^[0-9]+\.?[0-9]*$' then
          weight_val := weight_txt::numeric;
          if weight_val <= 0 then
            weight_val := null;
          end if;
        else
          weight_val := null;
        end if;

        insert into public.lift_set_logs (
          user_id,
          completed_workout_id,
          exercise_name,
          exercise_key,
          set_position,
          weight_lbs,
          reps,
          duration_sec,
          recorded_at
        ) values (
          new.user_id,
          new.id,
          exercise_display,
          exercise_key,
          set_ord,
          weight_val,
          null,
          reps_val,
          new.completed_at
        );
      else
        weight_txt := trim(coalesce(set_elem->>'loggedWeight', ''));
        if weight_txt is null or weight_txt !~ '^[0-9]+\.?[0-9]*$' then
          continue;
        end if;
        weight_val := weight_txt::numeric;
        if weight_val <= 0 then
          continue;
        end if;

        reps_txt := trim(coalesce(set_elem->>'loggedReps', ''));
        reps_val := null;
        if reps_txt is not null and reps_txt <> '' and reps_txt ~ '^[0-9]+$' then
          reps_val := reps_txt::integer;
        end if;

        insert into public.lift_set_logs (
          user_id,
          completed_workout_id,
          exercise_name,
          exercise_key,
          set_position,
          weight_lbs,
          reps,
          duration_sec,
          recorded_at
        ) values (
          new.user_id,
          new.id,
          exercise_display,
          exercise_key,
          set_ord,
          weight_val,
          reps_val,
          null,
          new.completed_at
        );
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists completed_workouts_propagate_lift_set_logs on public.completed_workouts;

create trigger completed_workouts_propagate_lift_set_logs
after insert on public.completed_workouts
for each row
execute function public.completed_workouts_propagate_lift_set_logs();

-- Latest logged numbers per normalized exercise name and set slot (for in-session hints).
create or replace function public.lift_set_logs_latest_snapshot(p_user_id uuid)
returns table (
  exercise_key text,
  exercise_name text,
  set_position integer,
  weight_lbs numeric,
  reps integer,
  duration_sec integer,
  recorded_at timestamptz
)
language sql
stable
as $$
  select distinct on (l.exercise_key, l.set_position)
    l.exercise_key,
    l.exercise_name,
    l.set_position,
    l.weight_lbs,
    l.reps,
    l.duration_sec,
    l.recorded_at
  from public.lift_set_logs l
  where l.user_id = p_user_id
  order by l.exercise_key asc, l.set_position asc, l.recorded_at desc;
$$;

revoke all on function public.lift_set_logs_latest_snapshot(uuid) from public;
grant execute on function public.lift_set_logs_latest_snapshot(uuid) to service_role;

alter table public.lift_set_logs enable row level security;

drop policy if exists "lift_set_logs_select_own" on public.lift_set_logs;
create policy "lift_set_logs_select_own"
on public.lift_set_logs
for select
to authenticated
using (auth.uid() = user_id);
