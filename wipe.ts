import { createClient } from '@supabase/supabase-js';

const url = 'https://jsytmshwyglrwxxovypp.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzeXRtc2h3eWdscnd4eG92eXBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODA2NzksImV4cCI6MjA4NzI1NjY3OX0.EwlzMVgHpc6USacwgZcMGDQtGoP-0pI-ZPYrPC--RuU';
const supabase = createClient(url, key);

async function clean(table) {
    const res = await supabase.from(table).select('id');
    if (!res.data) return;
    const idsToDelete = res.data.filter(r => String(r.id).length < 30 || String(r.id).startsWith('sd-') || String(r.id).startsWith('shift-') || String(r.id).startsWith('att-')).map(r => r.id);

    if (idsToDelete.length > 0) {
        const del = await supabase.from(table).delete().in('id', idsToDelete);
        console.log(`Deleted ${idsToDelete.length} dummy rows from ${table} ->`, del.error ? del.error : 'Success');
    } else {
        console.log(`No dummy rows found in ${table}`);
    }
}

async function run() {
    await clean('expenses');
    await clean('shift_data');
    await clean('shifts');
    await clean('attendants');
    console.log('Dummy Data Wipe Complete!');
}
run();
