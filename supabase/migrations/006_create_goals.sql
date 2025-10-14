create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  calories integer not null default 2000,
  protein integer not null default 150,
  carbs integer not null default 200,
  fats integer not null default 65,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id)
);

alter table goals enable row level security;

create policy "Users can view own goals"
  on goals for select
  using (auth.uid() = user_id);

create policy "Users can insert own goals"
  on goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update own goals"
  on goals for update
  using (auth.uid() = user_id);
