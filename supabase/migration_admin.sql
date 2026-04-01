-- StackAI Admin Migration
-- Run this in your Supabase SQL editor AFTER schema.sql

-- ─── profiles table ───────────────────────────────────────────────────────────
-- Stores app-level flags that must not be user-editable (e.g. is_admin).
-- user_metadata in auth.users is writable by the client, so it is NOT safe
-- for privilege flags.

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ─── Auto-create a profile row whenever a new user signs up ──────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── RLS on profiles ──────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Users can read their own profile (so the app can check is_admin client-side)
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

-- Only the service-role key (used by the backend) can write profiles.
-- No client-facing INSERT/UPDATE/DELETE policies are created intentionally.

-- ─── Index ────────────────────────────────────────────────────────────────────
create index if not exists profiles_id_idx on public.profiles(id);

-- ─── Create the admin account ─────────────────────────────────────────────────
-- Step 1: Create the Supabase Auth user via Dashboard or run this block.
--   Dashboard → Authentication → Users → Add user
--   Email:    admin@stackai.app
--   Password: (set a strong password — store it in your password manager)
--
-- Step 2: After the user is created, promote it to admin by running:
--
--   update public.profiles
--   set is_admin = true
--   where id = (
--     select id from auth.users where email = 'admin@stackai.app'
--   );
--
-- We do NOT embed the admin password in SQL for security reasons.
