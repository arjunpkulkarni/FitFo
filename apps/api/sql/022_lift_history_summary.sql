-- Enrich the lift history snapshot with exercise-level last-session and PR data.
-- The base lift_set_logs table from 018 already persists every completed set.

create index if not exists lift_set_logs_user_key_weight_idx
  on public.lift_set_logs (user_id, exercise_key, weight_lbs desc, recorded_at desc)
  where weight_lbs is not null;

-- Backfill completed workouts that predate the lift_set_logs trigger.
-- Skip workouts that already have any lift logs so this migration is idempotent.
with workout_sets as (
  select
    cw.id as completed_workout_id,
    cw.user_id,
    cw.completed_at,
    trim(coalesce(exercise_elem->>'name', '')) as exercise_name,
    lower(regexp_replace(trim(coalesce(exercise_elem->>'name', '')), '\s+', ' ', 'g')) as exercise_key,
    set_ord::integer as set_position,
    set_elem,
    (set_elem->'targetDurationSec') is not null
      and jsonb_typeof(set_elem->'targetDurationSec') <> 'null' as is_timed
  from public.completed_workouts cw
  cross join lateral jsonb_array_elements(coalesce(cw.exercises, '[]'::jsonb)) as exercise_elem
  cross join lateral jsonb_array_elements(coalesce(exercise_elem->'sets', '[]'::jsonb))
    with ordinality as set_rows(set_elem, set_ord)
  where not exists (
    select 1
    from public.lift_set_logs existing
    where existing.completed_workout_id = cw.id
  )
    and trim(coalesce(exercise_elem->>'name', '')) <> ''
    and coalesce((set_elem->>'completed')::boolean, false)
),
normalized_sets as (
  select
    completed_workout_id,
    user_id,
    completed_at,
    exercise_name,
    exercise_key,
    set_position,
    is_timed,
    trim(coalesce(set_elem->>'loggedWeight', '')) as weight_txt,
    trim(coalesce(set_elem->>'loggedReps', '')) as reps_txt
  from workout_sets
)
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
)
select
  user_id,
  completed_workout_id,
  exercise_name,
  exercise_key,
  set_position,
  case
    when weight_txt ~ '^[0-9]+\.?[0-9]*$' and weight_txt::numeric > 0
      then weight_txt::numeric
    else null
  end as weight_lbs,
  case
    when not is_timed and reps_txt ~ '^[0-9]+$'
      then reps_txt::integer
    else null
  end as reps,
  case
    when is_timed and reps_txt ~ '^[0-9]+$'
      then reps_txt::integer
    else null
  end as duration_sec,
  completed_at
from normalized_sets
where (
    is_timed
    and reps_txt ~ '^[0-9]+$'
    and reps_txt::integer >= 0
  )
  or (
    not is_timed
    and weight_txt ~ '^[0-9]+\.?[0-9]*$'
    and weight_txt::numeric > 0
  );

create or replace function public.lift_set_logs_latest_snapshot(p_user_id uuid)
returns table (
  exercise_key text,
  exercise_name text,
  set_position integer,
  weight_lbs numeric,
  reps integer,
  duration_sec integer,
  recorded_at timestamptz,
  last_session_recorded_at timestamptz,
  personal_record_weight_lbs numeric,
  personal_record_reps integer,
  personal_record_recorded_at timestamptz
)
language sql
stable
as $$
  with latest_set as (
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
    order by l.exercise_key asc, l.set_position asc, l.recorded_at desc
  ),
  latest_session as (
    select
      l.exercise_key,
      max(l.recorded_at) as last_session_recorded_at
    from public.lift_set_logs l
    where l.user_id = p_user_id
    group by l.exercise_key
  ),
  personal_record as (
    select distinct on (l.exercise_key)
      l.exercise_key,
      l.weight_lbs as personal_record_weight_lbs,
      l.reps as personal_record_reps,
      l.recorded_at as personal_record_recorded_at
    from public.lift_set_logs l
    where l.user_id = p_user_id
      and l.weight_lbs is not null
    order by
      l.exercise_key asc,
      l.weight_lbs desc,
      coalesce(l.reps, 0) desc,
      l.recorded_at desc
  )
  select
    latest_set.exercise_key,
    latest_set.exercise_name,
    latest_set.set_position,
    latest_set.weight_lbs,
    latest_set.reps,
    latest_set.duration_sec,
    latest_set.recorded_at,
    latest_session.last_session_recorded_at,
    personal_record.personal_record_weight_lbs,
    personal_record.personal_record_reps,
    personal_record.personal_record_recorded_at
  from latest_set
  left join latest_session using (exercise_key)
  left join personal_record using (exercise_key)
  order by latest_set.exercise_key asc, latest_set.set_position asc;
$$;

revoke all on function public.lift_set_logs_latest_snapshot(uuid) from public;
grant execute on function public.lift_set_logs_latest_snapshot(uuid) to service_role;
