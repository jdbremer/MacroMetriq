-- Create recent_foods table to store most recent serving size per food
CREATE TABLE recent_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories NUMERIC(10,1) NOT NULL,
  protein NUMERIC(10,1) NOT NULL,
  carbs NUMERIC(10,1) NOT NULL,
  fiber NUMERIC(10,1) NOT NULL,
  sugars NUMERIC(10,1) NOT NULL,
  total_fat NUMERIC(10,1) NOT NULL,
  saturated_fat NUMERIC(10,1) NOT NULL,
  trans_fat NUMERIC(10,1) NOT NULL,
  unsaturated_fat NUMERIC(10,1) NOT NULL,
  serving_multiplier NUMERIC(10,2) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE recent_foods ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own recent foods
CREATE POLICY "Users can view own recent foods"
  ON recent_foods FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own recent foods
CREATE POLICY "Users can insert own recent foods"
  ON recent_foods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own recent foods
CREATE POLICY "Users can update own recent foods"
  ON recent_foods FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own recent foods
CREATE POLICY "Users can delete own recent foods"
  ON recent_foods FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_recent_foods_user_id ON recent_foods(user_id);
CREATE INDEX idx_recent_foods_updated_at ON recent_foods(updated_at DESC);
