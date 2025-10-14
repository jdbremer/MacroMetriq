import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  const migrationPath = path.join(__dirname, '../supabase/migrations/002_add_base_nutrition.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  // Split by semicolon and run each statement
  const statements = sql.split(';').filter(s => s.trim());
  
  for (const statement of statements) {
    if (statement.trim()) {
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      if (error) {
        console.error('Migration error:', error);
      } else {
        console.log('Executed:', statement.substring(0, 50) + '...');
      }
    }
  }
  
  console.log('Migration complete!');
}

runMigration();
