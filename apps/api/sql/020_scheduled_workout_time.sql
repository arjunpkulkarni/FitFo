-- Local workout time (minutes from midnight) for reminders and recommendations.
alter table public.scheduled_workouts
  add column if not exists scheduled_time_minutes smallint;

alter table public.scheduled_workouts
  drop constraint if exists scheduled_workouts_time_minutes_check;

alter table public.scheduled_workouts
  add constraint scheduled_workouts_time_minutes_check
  check (
    scheduled_time_minutes is null
    or (scheduled_time_minutes >= 0 and scheduled_time_minutes <= 1439)
  );
