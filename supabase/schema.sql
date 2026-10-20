-- =====================================================================
-- House Tasks — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates what is missing.
-- =====================================================================

-- ---------- People ----------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'pending'
              check (role in ('admin', 'member', 'pending', 'disabled')),
  created_at  timestamptz not null default now()
);

-- The very first account to sign up becomes the admin.
-- Everyone after that waits as "pending" until an admin approves them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helpers used by the security rules below.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() = 'admin', false);
$$;

create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() in ('admin', 'member'), false);
$$;

-- ---------- Tasks -----------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  category      text not null check (category in ('cleaning', 'maintenance')),
  kind          text not null check (kind in ('routine', 'adhoc', 'project')),
  area          text not null default '',          -- room / location, e.g. "Kitchen"
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  items         jsonb not null default '[]'::jsonb, -- [{ "name": "Bleach", "qty": "1 bottle" }]
  photos        text[] not null default '{}',       -- storage paths in the task-photos bucket
  assigned_to   uuid references public.profiles(id) on delete set null, -- null = anyone
  -- Routine tasks repeat every <repeat_every> <repeat_unit>
  repeat_every  int check (repeat_every is null or repeat_every > 0),
  repeat_unit   text check (repeat_unit is null or repeat_unit in ('day', 'week', 'month', 'year')),
  -- Next date the task appears on the to-do list (planned date for ad hoc / projects)
  due_date      date not null default current_date,
  is_done       boolean not null default false,    -- ad hoc / projects: finished
  is_active     boolean not null default true,     -- routine: paused when false
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint routine_needs_schedule check (
    kind <> 'routine' or (repeat_every is not null and repeat_unit is not null)
  )
);

create index if not exists tasks_assigned_due_idx on public.tasks (assigned_to, due_date);

-- ---------- Completions (history) -------------------------------------
create table if not exists public.completions (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  completed_by  uuid references public.profiles(id) on delete set null,
  completed_at  timestamptz not null default now(),
  was_due       date,
  note          text not null default '',
  photos        text[] not null default '{}'
);

create index if not exists completions_task_idx on public.completions (task_id, completed_at desc);

-- ---------- Ticking a task off ----------------------------------------
-- Members can't edit tasks directly; they complete them through this function.
-- Routine tasks roll forward to their next date; ad hoc / projects are marked done.
create or replace function public.complete_task(
  p_task_id uuid,
  p_note    text default '',
  p_photos  text[] default '{}',
  p_today   date default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  t      public.tasks;
  today  date := coalesce(p_today, (now() at time zone 'Africa/Johannesburg')::date);
  base   date;
  step   interval;
begin
  if not public.is_active() then
    raise exception 'Your account is not active yet';
  end if;

  select * into t from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;

  if not public.is_admin() and t.assigned_to is not null and t.assigned_to <> auth.uid() then
    raise exception 'This task is assigned to someone else';
  end if;

  insert into public.completions (task_id, completed_by, was_due, note, photos)
  values (t.id, auth.uid(), t.due_date, coalesce(p_note, ''), coalesce(p_photos, '{}'));

  if t.kind = 'routine' then
    -- Done early: keep the original rhythm. Done late: restart from today.
    base := greatest(t.due_date, today);
    step := case t.repeat_unit
              when 'day'   then make_interval(days   => t.repeat_every)
              when 'week'  then make_interval(weeks  => t.repeat_every)
              when 'month' then make_interval(months => t.repeat_every)
              when 'year'  then make_interval(years  => t.repeat_every)
            end;
    update public.tasks
       set due_date = (base + step)::date, updated_at = now()
     where id = t.id
     returning * into t;
  else
    update public.tasks
       set is_done = true, updated_at = now()
     where id = t.id
     returning * into t;
  end if;

  return t;
end;
$$;

-- Admin can undo a mistaken tick (removes the history entry and restores the date).
create or replace function public.undo_completion(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.completions;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can undo';
  end if;
  select * into c from public.completions where id = p_completion_id;
  if not found then
    raise exception 'Not found';
  end if;
  update public.tasks
     set due_date = coalesce(c.was_due, due_date), is_done = false, updated_at = now()
   where id = c.task_id;
  delete from public.completions where id = c.id;
end;
$$;

-- ---------- Security rules (Row Level Security) -----------------------
alter table public.profiles    enable row level security;
alter table public.tasks       enable row level security;
alter table public.completions enable row level security;

drop policy if exists "profiles: read own or if active" on public.profiles;
create policy "profiles: read own or if active" on public.profiles
  for select using (id = auth.uid() or public.is_active());

drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profiles: update own name" on public.profiles;
create policy "profiles: update own name" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role()); -- can't promote yourself

drop policy if exists "tasks: read" on public.tasks;
create policy "tasks: read" on public.tasks
  for select using (
    public.is_admin()
    or (public.is_active() and (assigned_to is null or assigned_to = auth.uid()))
  );

drop policy if exists "tasks: admin writes" on public.tasks;
create policy "tasks: admin writes" on public.tasks
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "completions: read" on public.completions;
create policy "completions: read" on public.completions
  for select using (public.is_admin() or completed_by = auth.uid());

-- ---------- Photo storage ---------------------------------------------
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', false)
on conflict (id) do nothing;

drop policy if exists "photos: active users read" on storage.objects;
create policy "photos: active users read" on storage.objects
  for select using (bucket_id = 'task-photos' and public.is_active());

drop policy if exists "photos: admin uploads task photos" on storage.objects;
create policy "photos: admin uploads task photos" on storage.objects
  for insert with check (
    bucket_id = 'task-photos'
    and (
      (public.is_admin() and (storage.foldername(name))[1] = 'tasks')
      or (public.is_active() and (storage.foldername(name))[1] = 'done')
    )
  );

drop policy if exists "photos: admin deletes" on storage.objects;
create policy "photos: admin deletes" on storage.objects
  for delete using (bucket_id = 'task-photos' and public.is_admin());

-- Table access for signed-in users (rows are still filtered by the rules above)
revoke all on public.profiles, public.tasks, public.completions from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select on public.completions to authenticated;

-- Functions callable by signed-in users only
revoke all on function public.complete_task(uuid, text, text[], date) from public, anon;
grant execute on function public.complete_task(uuid, text, text[], date) to authenticated;
revoke all on function public.undo_completion(uuid) from public, anon;
grant execute on function public.undo_completion(uuid) to authenticated;
