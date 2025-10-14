-- Add base nutrition fields to track original serving size
ALTER TABLE meals ADD COLUMN base_calories NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN base_protein NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN base_carbs NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN base_fiber NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN base_sugars NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN base_total_fat NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN base_saturated_fat NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN base_trans_fat NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN base_unsaturated_fat NUMERIC(10,1);
ALTER TABLE meals ADD COLUMN serving_multiplier NUMERIC(10,2) DEFAULT 1;

-- Update existing rows to have base values equal to current values
UPDATE meals 
SET base_calories = calories,
    base_protein = protein,
    base_carbs = carbs,
    base_fiber = fiber,
    base_sugars = sugars,
    base_total_fat = total_fat,
    base_saturated_fat = saturated_fat,
    base_trans_fat = trans_fat,
    base_unsaturated_fat = unsaturated_fat,
    serving_multiplier = 1
WHERE base_calories IS NULL;
