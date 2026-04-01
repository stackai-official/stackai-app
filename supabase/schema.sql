-- StackAI Database Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ─── Enable UUID extension (already on in most Supabase projects) ─────────────
create extension if not exists "uuid-ossp";

-- ─── stacks ───────────────────────────────────────────────────────────────────
create table if not exists public.stacks (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  compound    text not null,
  dose        numeric,
  unit        text,
  frequency   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── lab_results ──────────────────────────────────────────────────────────────
create table if not exists public.lab_results (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  test_name   text not null,
  value       numeric not null,
  unit        text,
  tested_at   timestamptz not null default now(),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── cycles ───────────────────────────────────────────────────────────────────
create table if not exists public.cycles (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  compounds   jsonb not null default '[]',
  start_date  date not null,
  end_date    date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger stacks_updated_at
  before update on public.stacks
  for each row execute function public.set_updated_at();

create or replace trigger lab_results_updated_at
  before update on public.lab_results
  for each row execute function public.set_updated_at();

create or replace trigger cycles_updated_at
  before update on public.cycles
  for each row execute function public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.stacks enable row level security;
alter table public.lab_results enable row level security;
alter table public.cycles enable row level security;

-- stacks policies
create policy "Users can view their own stacks"
  on public.stacks for select using (auth.uid() = user_id);

create policy "Users can insert their own stacks"
  on public.stacks for insert with check (auth.uid() = user_id);

create policy "Users can update their own stacks"
  on public.stacks for update using (auth.uid() = user_id);

create policy "Users can delete their own stacks"
  on public.stacks for delete using (auth.uid() = user_id);

-- lab_results policies
create policy "Users can view their own lab results"
  on public.lab_results for select using (auth.uid() = user_id);

create policy "Users can insert their own lab results"
  on public.lab_results for insert with check (auth.uid() = user_id);

create policy "Users can update their own lab results"
  on public.lab_results for update using (auth.uid() = user_id);

create policy "Users can delete their own lab results"
  on public.lab_results for delete using (auth.uid() = user_id);

-- cycles policies
create policy "Users can view their own cycles"
  on public.cycles for select using (auth.uid() = user_id);

create policy "Users can insert their own cycles"
  on public.cycles for insert with check (auth.uid() = user_id);

create policy "Users can update their own cycles"
  on public.cycles for update using (auth.uid() = user_id);

create policy "Users can delete their own cycles"
  on public.cycles for delete using (auth.uid() = user_id);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists stacks_user_id_idx on public.stacks(user_id);
create index if not exists lab_results_user_id_idx on public.lab_results(user_id);
create index if not exists cycles_user_id_idx on public.cycles(user_id);
