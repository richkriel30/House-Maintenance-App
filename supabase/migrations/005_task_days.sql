-- Days of the week now live on each daily task instead of on each person.
-- Undoes 004_work_days.sql and adds tasks.days.
-- Run once in Supabase → SQL Editor (already included in schema.sql for new setups).

-- Remove the per-person version
drop trigger if exists profiles_resnap_tasks on public.profiles;
drop function if exists public.profiles_resnap_tasks();
drop trigger if exists profiles_guard on public.profiles;
drop function if exists public.profiles_guard();
drop trigger if exists tasks_snap_to_work_day on public.tasks;
drop function if exists public.tasks_snap_to_work_day();
drop function if exists public.next_work_day(date, uuid);
alter table public.profiles drop column if exists work_days;

-- Days a daily task comes up on. ISO weekdays: 1 = Monday … 7 = Sunday. Null = every day.
alter table public.tasks add column if not exists days smallint[];

-- Keep a daily task's date on one of its ticked days, whichever way the date was set
-- (adding, editing, activating, or rolling forward after being ticked off).
create or replace function public.tasks_snap_to_days()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  i int;
begin
  if new.kind = 'routine' and new.repeat_unit = 'day' and new.due_date is not null
     and new.days is not null and cardinality(new.days) between 1 and 6 then
    for i in 0..6 loop
      if extract(isodow from new.due_date + i)::smallint = any(new.days) then
        new.due_date := new.due_date + i;
        exit;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_snap_to_days on public.tasks;
create trigger tasks_snap_to_days
  before insert or update on public.tasks
  for each row execute function public.tasks_snap_to_days();
