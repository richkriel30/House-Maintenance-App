-- Sub-steps on a task: [{ "text": "Turn off the pump", "photos": ["tasks/….jpg"] }]
-- Run once in Supabase → SQL Editor (already included in schema.sql for new setups).
alter table public.tasks add column if not exists steps jsonb not null default '[]'::jsonb;
