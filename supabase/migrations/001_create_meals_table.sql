-- Create meals table
CREATE TABLE meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  calories NUMERIC(10,1) DEFAULT 0,
  protein NUMERIC(10,1) DEFAULT 0,
  carbs NUMERIC(10,1) DEFAULT 0,
  fiber NUMERIC(10,1) DEFAULT 0,
  sugars NUMERIC(10,1) DEFAULT 0,
  total_fat NUMERIC(10,1) DEFAULT 0,
  saturated_fat NUMERIC(10,1) DEFAULT 0,
  trans_fat NUMERIC(10,1) DEFAULT 0,
  unsaturated_fat NUMERIC(10,1) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own meals
CREATE POLICY "Users can view own meals" ON meals
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy: Users can insert their own meals
CREATE POLICY "Users can insert own meals" ON meals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own meals
CREATE POLICY "Users can update own meals" ON meals
  FOR UPDATE USING (auth.uid() = user_id);

-- Create policy: Users can delete their own meals
CREATE POLICY "Users can delete own meals" ON meals
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX meals_user_date_idx ON meals(user_id, date);
CREATE INDEX meals_user_date_hour_idx ON meals(user_id, date, hour);
