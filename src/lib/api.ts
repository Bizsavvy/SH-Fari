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

export async function getTrendData(days: number = 30) {
    const historicalDate = new Date();
    historicalDate.setDate(historicalDate.getDate() - days);

    // Fetch shift_data joined with shifts within date range
    const { data: shiftItems, error } = await supabase
        .from('shift_data')
        .select(`
            expected_amount,
            cash_remitted,
            pos_remitted,
            variance,
            shifts!inner(shift_date, shift_time)
        `)
        .gte('shifts.shift_date', historicalDate.toISOString().split('T')[0]);

    if (error) throw error;

    // Aggregate by day
    const aggregated = (shiftItems || []).reduce((acc: any, item: any) => {
        const dateObj = new Date(item.shifts.shift_date);
        const dateStr = dateObj.toISOString().split('T')[0];
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        if (!acc[dateStr]) {
            acc[dateStr] = { date: dateStr, name: dayName, variance: 0, claimed: 0, actual: 0 };
        }

        acc[dateStr].variance += item.variance || 0;

        // "Claimed POS" is loosely modeled here as what the system expected minus physical cash
        const expectedPos = Math.max(0, (item.expected_amount || 0) - (item.cash_remitted || 0));
        acc[dateStr].claimed += expectedPos;
        acc[dateStr].actual += item.pos_remitted || 0;

        return acc;
    }, {});

    // Ensure we send back an array sorted by Date
    return Object.values(aggregated).sort((a: any, b: any) => a.date.localeCompare(b.date));
}

export async function getGlobalOverview() {
    const { data: branches } = await supabase.from('branches').select('*');
    // Fetch ALL shifts (not just OPEN) so date filters work across full ledger history
    const { data: shifts } = await supabase.from('shifts').select('*').order('shift_date', { ascending: false });

    const shiftIds = shifts?.map(s => s.id) || [];
    let shiftDataItems: any[] = [];
    if (shiftIds.length > 0) {
        const { data: sd } = await supabase.from('shift_data').select('*, attendants(name)').in('shift_id', shiftIds);
        // Build a quick lookup: shift_id -> { shift_date, shift_time, status }
        const shiftLookup = new Map<string, any>();
        shifts?.forEach(s => shiftLookup.set(s.id, s));

        shiftDataItems = sd?.map(item => {
            const parentShift = shiftLookup.get(item.shift_id);
            return {
                ...item,
                attendant_name: (item.attendants as any)?.name,
                shift_date: parentShift?.shift_date || null,
                shift_time: parentShift?.shift_time || null,
                shift_status: parentShift?.status || 'OPEN'
            };
        }) || [];
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
        // Collect ALL open shifts for this branch (there can be multiple per date/time)
        const branchShifts = shifts?.filter(s => s.branch_id === branch.id) || [];
        const branchShiftIds = branchShifts.map(s => s.id);
        // Use the most recent shift as the "representative" shift for UI display
        const shift = branchShifts.length > 0 ? branchShifts[0] : undefined; // sorted desc by shift_date
        const items = shiftDataItems.filter(sd => branchShiftIds.includes(sd.shift_id));
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

        const rawDate = row.date || row.Date || row.shift_date;
        const shift_date = rawDate ? new Date(rawDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const shift_time = row.time || row.Time || row.shift_time || 'Morning';

        const groupKey = `${validBranchId}_${shift_date}_${shift_time}`;

        if (!acc[groupKey]) acc[groupKey] = { branch_id: validBranchId, shift_date, shift_time, rows: [] };
        acc[groupKey].rows.push(row);
        return acc;
    }, {});

    let totalInserted = 0;

    for (const [groupKey, groupData] of Object.entries(branchGroups)) {
        const { branch_id, shift_date, shift_time, rows } = groupData as any;

        // Ensure there is an open shift for this branch/date/time
        let { data: shift } = await supabase
            .from('shifts')
            .select('id')
            .eq('branch_id', branch_id)
            .eq('shift_date', shift_date)
            .eq('shift_time', shift_time)
            .eq('status', 'OPEN')
            .single();

        if (!shift) {
            const { data: newShift, error } = await supabase
                .from('shifts')
                .insert({
                    id: crypto.randomUUID(),
                    branch_id,
                    shift_date,
                    shift_time,
                    status: 'OPEN'
                })
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
    const { branch_id, attendant_name, pump_number, product_type, price_per_liter, opening_meter, closing_meter, cash_remitted, pos_remitted, expenses, shift_date, shift_time } = payload;

    // 1. Ensure Open Shift
    let { data: shift } = await supabase
        .from('shifts')
        .select('id')
        .eq('branch_id', branch_id)
        .eq('shift_date', shift_date)
        .eq('shift_time', shift_time)
        .eq('status', 'OPEN')
        .single();

    if (!shift) {
        const { data: newShift, error } = await supabase
            .from('shifts')
            .insert({
                id: crypto.randomUUID(),
                branch_id,
                shift_date,
                shift_time,
                status: 'OPEN'
            })
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

export async function updateShiftDataRecord(id: string, updates: { expected_amount: number, cash_remitted: number, pos_remitted: number, shift_date?: string }) {
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

    // Update shift_date on parent shift if provided
    if (updates.shift_date && data?.shift_id) {
        await supabase.from('shifts').update({ shift_date: updates.shift_date }).eq('id', data.shift_id);
    }

    return data;
}

export async function submitCashAnalysis(payload: {
    branch_id: string;
    attendant_name: string;
    pump_number: number;
    product_type: string;
    denominations: any;
    total_cash: number;
    shift_date: string;
    shift_time: string;
}) {
    const { error } = await supabase
        .from('cash_analysis_reports')
        .insert([{
            id: crypto.randomUUID(),
            branch_id: payload.branch_id,
            attendant_name: payload.attendant_name,
            pump_number: payload.pump_number,
            product_type: payload.product_type,
            denominations: payload.denominations,
            total_cash: payload.total_cash,
            shift_date: payload.shift_date,
            shift_time: payload.shift_time
        }]);

    if (error) throw error;
    return { success: true };
}

export async function getHistoricalReports(days: number = 30) {
    const historicalDate = new Date();
    historicalDate.setDate(historicalDate.getDate() - days);

    const { data, error } = await supabase
        .from('cash_analysis_reports')
        .select(`
            id,
            created_at,
            attendant_name,
            pump_number,
            product_type,
            total_cash,
            shift_date,
            shift_time,
            branches ( name )
        `)
        .gte('shift_date', historicalDate.toISOString().split('T')[0])
        .order('shift_date', { ascending: false })
        .order('shift_time', { ascending: false });

    if (error) throw error;

    return (data || []).map((item: any) => ({
        id: item.id,
        date: new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        branch: item.branches?.name || 'Unknown Branch',
        attendant: item.attendant_name,
        product: `${item.product_type} - Pump ${item.pump_number}`,
        total_cash: item.total_cash,
        shift_date: item.shift_date,
        shift_time: item.shift_time
    }));
}

export async function deleteOpenShiftByBranch(branchId: string) {
    // 1. Fetch the OPEN shift for the branch
    const { data: shift, error: fetchErr } = await supabase
        .from('shifts')
        .select('id')
        .eq('branch_id', branchId)
        .eq('status', 'OPEN')
        .single();

    if (fetchErr || !shift) return { success: false, message: 'No open shift found to delete.' };

    // cascade deletion: shift_data and expenses (assume if cascade is strict we just need to delete shift_data)
    // To be safe, we explicitly find them
    const { data: shiftDataItems } = await supabase
        .from('shift_data')
        .select('id')
        .eq('shift_id', shift.id);

    const shiftDataIds = shiftDataItems?.map(sd => sd.id) || [];

    if (shiftDataIds.length > 0) {
        // Purge expenses safely
        await supabase.from('expenses').delete().in('shift_data_id', shiftDataIds);
        // Purge shift data
        await supabase.from('shift_data').delete().in('id', shiftDataIds);
    }

    // Finally, delete the shift itself
    const { error: deleteShiftErr } = await supabase.from('shifts').delete().eq('id', shift.id);
    if (deleteShiftErr) throw deleteShiftErr;

    return { success: true };
}

export async function getAttendantDrillDown(branchId: string, attendantName: string, shiftDate: string, shiftTime: string) {
    // Phase 1: Try to locate latest Cash Analysis for this exact shift profile
    const { data: cashReports } = await supabase
        .from('cash_analysis_reports')
        .select('*')
        .eq('branch_id', branchId)
        .ilike('attendant_name', attendantName)
        .eq('shift_date', shiftDate)
        .eq('shift_time', shiftTime)
        .order('created_at', { ascending: false })
        .limit(1);

    const cashReport = cashReports && cashReports.length > 0 ? cashReports[0] : null;

    // Phase 2: Pull expenses explicitly tracking this user in the active shift
    // We locate the exact shift_data rows first
    const { data: shift } = await supabase
        .from('shifts')
        .select('id')
        .eq('branch_id', branchId)
        .eq('shift_date', shiftDate)
        .eq('shift_time', shiftTime)
        .eq('status', 'OPEN')
        .single();

    let expenses: any[] = [];
    if (shift) {
        const { data: attendants } = await supabase
            .from('attendants')
            .select('id')
            .eq('branch_id', branchId)
            .ilike('name', attendantName)
            .single();

        if (attendants) {
            const { data: shiftDataRows } = await supabase
                .from('shift_data')
                .select('id')
                .eq('shift_id', shift.id)
                .eq('attendant_id', attendants.id);

            const sdIds = shiftDataRows?.map(r => r.id) || [];
            if (sdIds.length > 0) {
                const { data: exps } = await supabase
                    .from('expenses')
                    .select('*')
                    .in('shift_data_id', sdIds);
                expenses = exps || [];
            }
        }
    }

    return { cashReport, expenses };
}
