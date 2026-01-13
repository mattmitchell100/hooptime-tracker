-- Supabase schema for Hooptime Tracker

create table if not exists public.user_teams (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  completed_at timestamptz not null,
  entry jsonb not null,
  primary key (user_id, id)
);

create index if not exists game_history_user_completed_idx
  on public.game_history (user_id, completed_at desc);

alter table public.user_teams enable row level security;
alter table public.game_history enable row level security;

create policy "user_teams read/write" on public.user_teams
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "game_history read/write" on public.game_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
