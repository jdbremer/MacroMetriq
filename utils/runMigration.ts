import { supabase } from './supabase';

export async function runBaseMigration() {
  const statements = [
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_calories NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_protein NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_carbs NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_fiber NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_sugars NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_total_fat NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_saturated_fat NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_trans_fat NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS base_unsaturated_fat NUMERIC(10,1)',
    'ALTER TABLE meals ADD COLUMN IF NOT EXISTS serving_multiplier NUMERIC(10,2) DEFAULT 1',
  ];
  
  for (const sql of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) console.error('Migration error:', error);
  }
  
  // Update existing rows
  const { error: updateError } = await supabase.rpc('exec_sql', {
    sql: `UPDATE meals SET base_calories = calories, base_protein = protein, base_carbs = carbs, 
          base_fiber = fiber, base_sugars = sugars, base_total_fat = total_fat, 
          base_saturated_fat = saturated_fat, base_trans_fat = trans_fat, 
          base_unsaturated_fat = unsaturated_fat, serving_multiplier = 1 
          WHERE base_calories IS NULL`
  });
  
  if (updateError) console.error('Update error:', updateError);
}
