require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { error } = await supabase.from('cash_analysis_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log(error || 'Cleaned successfully');
}
run();
