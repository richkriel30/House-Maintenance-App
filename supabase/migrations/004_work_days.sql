-- Per-person working days. Daily routine tasks assigned to someone only fall on their days.
-- Days are ISO weekdays: 1 = Monday … 7 = Sunday. Null or empty = every day.
-- Run once in Supabase → SQL Editor (already included in schema.sql for new setups).

alter table public.profiles add column if not exists work_days smallint[];

-- First date on or after d that falls on one of the person's working days.
create or replace function public.next_work_day(d date, person uuid)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  days smallint[];
  i int;
begin
  if d is null or person is null then
    return d;
  end if;
  select work_days into days from public.profiles where id = person;
  if days is null or cardinality(days) = 0 or cardinality(days) = 7 then
    return d;
  end if;
  for i in 0..6 loop
    if extract(isodow from d + i)::smallint = any(days) then
      return d + i;
    end if;
  end loop;
  return d;
end;
$$;

-- Keep daily tasks on the assignee's working days, whichever way the date was set
-- (adding, editing, activating, or rolling forward after being ticked off).
create or replace function public.tasks_snap_to_work_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'routine' and new.repeat_unit = 'day' and new.assigned_to is not null and new.due_date is not null then
    new.due_date := public.next_work_day(new.due_date, new.assigned_to);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_snap_to_work_day on public.tasks;
create trigger tasks_snap_to_work_day
  before insert or update on public.tasks
  for each row execute function public.tasks_snap_to_work_day();

-- Only admins may change roles or working days (people can still edit their own name).
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and (
       new.role is distinct from old.role
       or new.work_days is distinct from old.work_days) then
    raise exception 'Only an admin can change this';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- When someone's days change, move their upcoming daily tasks onto a working day.
create or replace function public.profiles_resnap_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.work_days is distinct from old.work_days then
    update public.tasks
       set updated_at = now()   -- the tasks trigger re-snaps due_date
     where assigned_to = new.id
       and kind = 'routine' and repeat_unit = 'day'
       and not is_done;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_resnap_tasks on public.profiles;
create trigger profiles_resnap_tasks
  after update on public.profiles
  for each row execute function public.profiles_resnap_tasks();
