import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// Fix required to read from env properly if npx tsx doesn't load it contextually
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl) {
    console.error("Missing SUPABASE URL in env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyze() {
    const { data: shifts } = await supabase.from('shifts').select('id, branch_id, status, created_at');
    console.log("Shifts found:", shifts?.length);
    shifts?.forEach(s => console.log(s.id, s.status, s.created_at));

    const { data: shift_data } = await supabase.from('shift_data').select('id, created_at');
    console.log("\nShift Data rows:", shift_data?.length);
}

analyze();
