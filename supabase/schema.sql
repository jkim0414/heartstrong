-- HeartStrong database schema.
-- Run this once in your Supabase project (SQL Editor → paste → Run).
--
-- One row per user holds their entire app state as JSON. Row-Level Security
-- guarantees a signed-in user can only ever read or write their OWN row, so
-- no one (not even another signed-in user) can see anyone else's health data.

create table if not exists public.app_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- A user may read their own row.
create policy "read own state"
  on public.app_state for select
  using (auth.uid() = user_id);

-- A user may create their own row.
create policy "insert own state"
  on public.app_state for insert
  with check (auth.uid() = user_id);

-- A user may update their own row.
create policy "update own state"
  on public.app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
