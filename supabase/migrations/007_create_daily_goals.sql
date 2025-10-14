create table if not exists daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  calories integer not null,
  protein integer not null,
  carbs integer not null,
  fats integer not null,
  created_at timestamp with time zone default now(),
  unique(user_id, date)
);

alter table daily_goals enable row level security;

create policy "Users can view own daily goals"
  on daily_goals for select
  using (auth.uid() = user_id);

create policy "Users can insert own daily goals"
  on daily_goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update own daily goals"
  on daily_goals for update
  using (auth.uid() = user_id);
