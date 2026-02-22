import { supabase } from './supabase';

export async function getBranches() {
    const { data, error } = await supabase.from('branches').select('*');
    if (error) throw error;
    return data || [];
}

export async function getActiveShift(branchId: string) {
    const { data: shift, error: shiftError } = await supabase
        .from('shifts')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'OPEN')
        .single();

    if (shiftError || !shift) return { shift: null, data: [] };

    const { data: shiftDataItems, error: dataError } = await supabase
        .from('shift_data')
        .select('*, attendants(name)')
        .eq('shift_id', shift.id);

    if (dataError) throw dataError;

    // Flatten attendant_name to match the SQLite structure expected by the UI
    const formattedData: any[] = (shiftDataItems || []).map(item => ({
        ...item,
        attendant_name: (item.attendants as any)?.name
    }));

    return { shift, data: formattedData };
}

export async function getPendingExpenses() {
    const { data, error } = await supabase
        .from('expenses')
        .select('*, shift_data(shift_id, attendants(name))')
        .eq('status', 'PENDING');

    if (error) throw error;

    const formattedData: any[] = (data || []).map(item => ({
        ...item,
        shift_id: (item.shift_data as any)?.shift_id,
        attendant_name: (item.shift_data as any)?.attendants?.name
    }));

    return formattedData;
}

export async function approveExpense(id: string) {
    const { error } = await supabase
        .from('expenses')
        .update({ status: 'APPROVED' })
        .eq('id', id);

    if (error) throw error;
    return { success: true };
}

export async function rejectExpense(id: string) {
    const { error } = await supabase
        .from('expenses')
        .update({ status: 'REJECTED' })
        .eq('id', id);

    if (error) throw error;
    return { success: true };
}

export async function getTrendData() {
    // Use mock for trend data as originally handled by dummy server.ts endpoint
    return [
        { date: '2024-02-15', variance: -5000 },
        { date: '2024-02-16', variance: -2000 },
        { date: '2024-02-17', variance: 0 },
        { date: '2024-02-18', variance: -12000 },
        { date: '2024-02-19', variance: -3000 },
        { date: '2024-02-20', variance: -1000 },
        { date: '2024-02-21', variance: -18000 },
    ];
}

export async function getGlobalOverview() {
    const { data: branches } = await supabase.from('branches').select('*');
    const { data: shifts } = await supabase.from('shifts').select('*').eq('status', 'OPEN');

    const shiftIds = shifts?.map(s => s.id) || [];
    let shiftDataItems: any[] = [];
    if (shiftIds.length > 0) {
        const { data: sd } = await supabase.from('shift_data').select('*, attendants(name)').in('shift_id', shiftIds);
        shiftDataItems = sd?.map(item => ({ ...item, attendant_name: (item.attendants as any)?.name })) || [];
    }

    let pendingExpenses: any[] = [];
    const sdIds = shiftDataItems.map(sd => sd.id);
    if (sdIds.length > 0) {
        const { data: pe } = await supabase.from('expenses').select('*, shift_data(shift_id, attendants(name))').in('shift_data_id', sdIds).eq('status', 'PENDING');
        pendingExpenses = pe?.map(item => ({
            ...item,
            shift_id: (item.shift_data as any)?.shift_id,
            attendant_name: (item.shift_data as any)?.attendants?.name
        })) || [];
    }

    const matrix = (branches || []).map(branch => {
        const shift = shifts?.find(s => s.branch_id === branch.id);
        const items = shift ? shiftDataItems.filter(sd => sd.shift_id === shift.id) : [];
        const expenses = items.length > 0 ? pendingExpenses.filter(e => items.find(sd => sd.id === e.shift_data_id)) : [];

        const totalExpected = items.reduce((sum, item) => sum + item.expected_amount, 0);
        const totalCash = items.reduce((sum, item) => sum + item.cash_remitted, 0);
        const totalPos = items.reduce((sum, item) => sum + item.pos_remitted, 0);
        const pendingExpenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
        const totalVariance = items.reduce((sum, item) => sum + item.variance, 0);

        return {
            branch,
            shift,
            items,
            pendingExpenses: expenses,
            totalExpected,
            totalCash,
            totalPos,
            pendingExpenseTotal,
            totalVariance
        };
    });

    return matrix;
}

export async function uploadShiftDataBatch(csvRows: any[]) {
    // Fetch mapping dependencies
    const { data: allBranches } = await supabase.from('branches').select('id, name');
    const branchMap = new Map();
    allBranches?.forEach(b => {
        branchMap.set(String(b.id), b.id); // Fixed strict String conversion
        if (b.name) {
            branchMap.set(String(b.name).toLowerCase().trim(), b.id);
        }
    });

    // 1. Group rows by branch_id intelligently
    const branchGroups = csvRows.reduce((acc: any, row: any) => {
        const branchInput = String(row.branch_id || row.branch || row.branch_name || row.Branch || '').trim();
        if (!branchInput) return acc;

        const validBranchId = branchMap.get(branchInput) || branchMap.get(branchInput.toLowerCase());
        if (!validBranchId) return acc;

        if (!acc[validBranchId]) acc[validBranchId] = [];
        acc[validBranchId].push(row);
        return acc;
    }, {});

    let totalInserted = 0;

    for (const [branch_id, rows] of Object.entries(branchGroups)) {
        // Ensure there is an open shift for this branch
        let { data: shift } = await supabase
            .from('shifts')
            .select('id')
            .eq('branch_id', branch_id)
            .eq('status', 'OPEN')
            .single();

        if (!shift) {
            const { data: newShift, error } = await supabase
                .from('shifts')
                .insert({ id: crypto.randomUUID(), branch_id, status: 'OPEN' })
                .select()
                .single();
            if (error) throw error;
            shift = newShift;
        }

        // Handle attendants (Get existing or create)
        const { data: existingAttendants } = await supabase
            .from('attendants')
            .select('id, name')
            .eq('branch_id', branch_id);

        const attendantMap = new Map();
        existingAttendants?.forEach(a => attendantMap.set(a.name.toLowerCase().trim(), a.id));

        const insertPayloads = [];

        for (const row of (rows as any[])) {
            const rowAttendantName = String(row.attendant_name || row.attendant || row.Attendant || row.Name || row.name || '').trim();
            if (!rowAttendantName) continue;

            let attendant_id = attendantMap.get(rowAttendantName.toLowerCase());

            if (!attendant_id) {
                // Create new attendant
                const { data: newAtt, error: attErr } = await supabase
                    .from('attendants')
                    .insert({ id: crypto.randomUUID(), branch_id, name: rowAttendantName })
                    .select()
                    .single();

                if (attErr) {
                    throw new Error(`Failed to create highly specific Attendant Record for ${rowAttendantName}: ${attErr.message}`);
                }

                if (newAtt) {
                    attendant_id = newAtt.id;
                    attendantMap.set(rowAttendantName.toLowerCase(), attendant_id);
                }
            }

            const expected = parseFloat(row.expected_amount || row.Expected || row.expected || row.expected_sales || 0);
            const cash = parseFloat(row.cash_remitted || row.Cash || row.cash || row.cash_sales || 0);
            const pos = parseFloat(row.pos_remitted || row.POS || row.pos || row.pos_sales || 0);

            // Skip invalid rows
            if (!attendant_id || expected === 0) continue;

            insertPayloads.push({
                id: crypto.randomUUID(),
                shift_id: shift!.id,
                attendant_id: attendant_id,
                pump_product: row.pump_product || row.Product || row.product || row.Pump || 'General',
                expected_amount: expected,
                cash_remitted: cash,
                pos_remitted: pos,
                variance: (cash + pos) - expected,
            });
        }

        if (insertPayloads.length > 0) {
            const { error } = await supabase.from('shift_data').insert(insertPayloads);
            if (error) throw error;
            totalInserted += insertPayloads.length;
        }
    }

    if (totalInserted === 0) {
        throw new Error('No valid rows inserted. Ensure columns for "Branch", "Attendant", "Expected", and "Cash" exist.');
    }

    return { success: true, count: totalInserted };
}

export async function submitManualShiftData(payload: any) {
    const { branch_id, attendant_name, pump_number, product_type, price_per_liter, opening_meter, closing_meter, cash_remitted, pos_remitted, expenses } = payload;

    // 1. Ensure Open Shift
    let { data: shift } = await supabase
        .from('shifts')
        .select('id')
        .eq('branch_id', branch_id)
        .eq('status', 'OPEN')
        .single();

    if (!shift) {
        const { data: newShift, error } = await supabase
            .from('shifts')
            .insert({ id: crypto.randomUUID(), branch_id, status: 'OPEN' })
            .select()
            .single();
        if (error) throw error;
        shift = newShift;
    }

    // 2. Resolve Attendant
    // Since we can't easily ILIKE without knowing config, we'll fetch all and find
    const { data: allAtt } = await supabase.from('attendants').select('id, name').eq('branch_id', branch_id);
    let attendant_id = allAtt?.find(a => a.name.toLowerCase() === attendant_name.toLowerCase())?.id;

    if (!attendant_id) {
        const { data: newAtt, error: attErr } = await supabase
            .from('attendants')
            .insert({ id: crypto.randomUUID(), branch_id, name: attendant_name })
            .select()
            .single();
        if (attErr) throw attErr;
        attendant_id = newAtt.id;
    }

    // 3. Insert Shift Data
    const liters_sold = closing_meter - opening_meter;
    const expected_amount = liters_sold * price_per_liter;
    const raw_variance = (cash_remitted + pos_remitted) - expected_amount;
    const shiftDataId = crypto.randomUUID();

    const { error: sdErr } = await supabase
        .from('shift_data')
        .insert({
            id: shiftDataId,
            shift_id: shift.id,
            attendant_id,
            pump_product: `${product_type} - ${pump_number}`,
            expected_amount,
            cash_remitted,
            pos_remitted,
            variance: raw_variance
        });
    if (sdErr) throw sdErr;

    // 4. Insert Expenses
    if (expenses && expenses.length > 0) {
        const expensePayloads = expenses.map((e: any) => ({
            id: crypto.randomUUID(),
            shift_data_id: shiftDataId,
            description: e.description,
            amount: e.amount,
            status: 'PENDING'
        }));
        const { error: expErr } = await supabase.from('expenses').insert(expensePayloads);
        if (expErr) throw expErr;
    }

    return { success: true };
}

export async function updateShiftDataRecord(id: string, updates: { expected_amount: number, cash_remitted: number, pos_remitted: number }) {
    const variance = (updates.cash_remitted + updates.pos_remitted) - updates.expected_amount;
    const { data, error } = await supabase
        .from('shift_data')
        .update({
            expected_amount: updates.expected_amount,
            cash_remitted: updates.cash_remitted,
            pos_remitted: updates.pos_remitted,
            variance: variance
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}
