import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.existsSync('.env.local') ? '.env.local' : '.env';
const env = fs.readFileSync(envFile, 'utf-8');
const getEnv = (k) => env.split('\n').find(l => l.startsWith(k))?.split('=')[1]?.replace(/"/g, '')?.trim();

const url = getEnv('VITE_SUPABASE_URL');
const key = getEnv('VITE_SUPABASE_ANON_KEY');

const supabase = createClient(url, key);

async function wipe() {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    console.log('Deleting records created before:', oneHourAgo);

    let d1 = await supabase.from('expenses').delete().lt('created_at', oneHourAgo);
    console.log('Expenses deleted:', d1.error || 'Success');

    let d2 = await supabase.from('shift_data').delete().lt('created_at', oneHourAgo);
    console.log('ShiftData deleted:', d2.error || 'Success');

    let d3 = await supabase.from('shifts').delete().lt('created_at', oneHourAgo);
    console.log('Shifts deleted:', d3.error || 'Success');

    let d4 = await supabase.from('attendants').delete().lt('created_at', oneHourAgo);
    console.log('Attendants deleted:', d4.error || 'Success');

    console.log('Wipe complete.');
}
wipe();
