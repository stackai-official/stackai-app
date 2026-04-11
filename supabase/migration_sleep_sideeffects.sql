-- Sleep logs table
create table if not exists public.sleep_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  bedtime           text,
  wake_time         text,
  duration_minutes  integer,
  quality           integer check (quality >= 1 and quality <= 5),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists sleep_logs_user_date_idx on public.sleep_logs(user_id, date);

create or replace trigger sleep_logs_updated_at
  before update on public.sleep_logs
  for each row execute function public.set_updated_at();

alter table public.sleep_logs enable row level security;

create policy "Users can view their own sleep logs"
  on public.sleep_logs for select using (auth.uid() = user_id);
create policy "Users can insert their own sleep logs"
  on public.sleep_logs for insert with check (auth.uid() = user_id);
create policy "Users can update their own sleep logs"
  on public.sleep_logs for update using (auth.uid() = user_id);
create policy "Users can delete their own sleep logs"
  on public.sleep_logs for delete using (auth.uid() = user_id);

create index if not exists sleep_logs_user_id_idx on public.sleep_logs(user_id);

-- Side effect logs table
create table if not exists public.side_effect_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  compound    text not null,
  symptom     text not null,
  severity    integer not null default 1 check (severity >= 1 and severity <= 5),
  notes       text,
  logged_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.side_effect_logs enable row level security;

create policy "Users can view their own side effects"
  on public.side_effect_logs for select using (auth.uid() = user_id);
create policy "Users can insert their own side effects"
  on public.side_effect_logs for insert with check (auth.uid() = user_id);
create policy "Users can delete their own side effects"
  on public.side_effect_logs for delete using (auth.uid() = user_id);

create index if not exists side_effect_logs_user_id_idx on public.side_effect_logs(user_id);
create index if not exists side_effect_logs_compound_idx on public.side_effect_logs(user_id, compound);
