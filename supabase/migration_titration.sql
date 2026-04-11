-- Titration schedules table
-- Tracks GLP-1 (and other) compound dose titration/taper schedules

create table if not exists public.titration_schedules (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  stack_id                uuid references public.stacks(id) on delete set null,
  compound                text not null,
  starting_dose           numeric not null,
  target_dose             numeric not null,
  unit                    text not null default 'mg',
  increase_amount         numeric,
  increase_interval_weeks integer not null default 4,
  phases                  jsonb not null default '[]',
  current_phase_index     integer not null default 0,
  status                  text not null default 'active', -- active, paused, completed
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Unique constraint: one active titration per compound per user
create unique index if not exists titration_user_compound_idx
  on public.titration_schedules(user_id, compound);

-- Updated_at trigger
create or replace trigger titration_schedules_updated_at
  before update on public.titration_schedules
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.titration_schedules enable row level security;

create policy "Users can view their own titrations"
  on public.titration_schedules for select using (auth.uid() = user_id);

create policy "Users can insert their own titrations"
  on public.titration_schedules for insert with check (auth.uid() = user_id);

create policy "Users can update their own titrations"
  on public.titration_schedules for update using (auth.uid() = user_id);

create policy "Users can delete their own titrations"
  on public.titration_schedules for delete using (auth.uid() = user_id);

-- Index
create index if not exists titration_schedules_user_id_idx on public.titration_schedules(user_id);
