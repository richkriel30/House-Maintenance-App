-- Ad hoc tasks can be kept inactive with no planned date, then activated when needed.
-- Run once in Supabase → SQL Editor (already included in schema.sql for new setups).
alter table public.tasks alter column due_date drop not null;

alter table public.tasks drop constraint if exists due_date_required_when_active;
alter table public.tasks add constraint due_date_required_when_active
  check (due_date is not null or (kind = 'adhoc' and not is_active));
