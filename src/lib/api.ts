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
            branch_id,
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
        shift_time: item.shift_time,
        branch_id: item.branch_id
    }));
}

export async function deleteIndividualShiftRecord(id: string) {
    // 1. Fetch the data to find matching cash_analysis_reports
    const { data: shiftData } = await supabase
        .from('shift_data')
        .select(`
            shifts!inner ( branch_id, shift_date, shift_time ),
            attendants!inner ( name )
        `)
        .eq('id', id)
        .single();

    // 2. Delete associated expenses first to prevent foreign key errors
    await supabase.from('expenses').delete().eq('shift_data_id', id);

    // 3. Delete the shift data record
    const { error } = await supabase.from('shift_data').delete().eq('id', id);
    if (error) throw error;

    // 4. Delete the associated cash analysis report if it exists
    if (shiftData) {
        const branchId = (shiftData.shifts as any).branch_id;
        const shiftDate = (shiftData.shifts as any).shift_date;
        const shiftTime = (shiftData.shifts as any).shift_time;
        const attendantName = (shiftData.attendants as any).name;

        await supabase.from('cash_analysis_reports').delete()
            .eq('branch_id', branchId)
            .eq('shift_date', shiftDate)
            .eq('shift_time', shiftTime)
            .ilike('attendant_name', attendantName);
    }

    return { success: true };
}

export async function deleteMultipleShiftRecords(ids: string[]) {
    if (!ids || ids.length === 0) return { success: true };

    // 1. Fetch data for all records to be deleted
    const { data: shiftDatas } = await supabase
        .from('shift_data')
        .select(`
            shifts!inner ( branch_id, shift_date, shift_time ),
            attendants!inner ( name )
        `)
        .in('id', ids);

    // 2. Delete associated expenses
    await supabase.from('expenses').delete().in('shift_data_id', ids);

    // 3. Delete the shift data records
    const { error } = await supabase.from('shift_data').delete().in('id', ids);
    if (error) throw error;

    // 4. Delete associated cash analysis reports
    if (shiftDatas && shiftDatas.length > 0) {
        for (const sd of shiftDatas) {
            const branchId = (sd.shifts as any).branch_id;
            const shiftDate = (sd.shifts as any).shift_date;
            const shiftTime = (sd.shifts as any).shift_time;
            const attendantName = (sd.attendants as any).name;

            await supabase.from('cash_analysis_reports').delete()
                .eq('branch_id', branchId)
                .eq('shift_date', shiftDate)
                .eq('shift_time', shiftTime)
                .ilike('attendant_name', attendantName);
        }
    }

    return { success: true };
}

export async function deleteOpenShiftByBranch(branchId: string) {
    // 1. Fetch the OPEN shift for the branch
    const { data: shift, error: fetchErr } = await supabase
        .from('shifts')
        .select('id, shift_date, shift_time')
        .eq('branch_id', branchId)
        .eq('status', 'OPEN')
        .single();

    if (fetchErr || !shift) return { success: false, message: 'No open shift found to delete.' };

    // cascade deletion: shift_data and expenses
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

    // Purge associated cash analysis reports for this exact shift segment
    await supabase.from('cash_analysis_reports').delete()
        .eq('branch_id', branchId)
        .eq('shift_date', shift.shift_date)
        .eq('shift_time', shift.shift_time);

    // Finally, delete the shift itself
    const { error: deleteShiftErr } = await supabase.from('shifts').delete().eq('id', shift.id);
    if (deleteShiftErr) throw deleteShiftErr;

    return { success: true };
}

export async function getAttendantDrillDown(branchId: string, attendantName: string, shiftDate: string, shiftTime: string) {
    // Phase 1: Cash Analysis report
    const { data: cashReports } = await supabase
        .from('cash_analysis_reports')
        .select('*')
        .eq('branch_id', branchId)
        .ilike('attendant_name', attendantName)
        .eq('shift_date', shiftDate)
        .eq('shift_time', shiftTime)
        .limit(1);

    const cashReport = cashReports && cashReports.length > 0 ? cashReports[0] : null;

    // Phase 2: Find shift_data directly via shift + attendant join
    const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('id')
        .eq('branch_id', branchId)
        .eq('shift_date', shiftDate)
        .eq('shift_time', shiftTime)
        .limit(1);

    if (shiftsError) {
        console.error('getAttendantDrillDown shifts lookup error:', shiftsError);
    }

    const shift = shifts && shifts.length > 0 ? shifts[0] : null;

    let expenses: any[] = [];
    let posTotal = 0;
    let cashTotal = 0;

    if (shift) {
        // Resolve attendant ID via safe lookup instead of inner join to avoid 400 Bad Request
        const { data: attendants } = await supabase
            .from('attendants')
            .select('id')
            .eq('branch_id', branchId)
            .ilike('name', attendantName);

        if (attendants && attendants.length > 0) {
            const attendantIds = attendants.map(a => a.id);
            const { data: shiftDataRows } = await supabase
                .from('shift_data')
                .select('id, pos_remitted, cash_remitted, attendant_id')
                .eq('shift_id', shift.id)
                .in('attendant_id', attendantIds);

            if (shiftDataRows && shiftDataRows.length > 0) {
                posTotal = shiftDataRows.reduce((sum, r) => sum + (r.pos_remitted || 0), 0);
                cashTotal = shiftDataRows.reduce((sum, r) => sum + (r.cash_remitted || 0), 0);

                const sdIds = shiftDataRows.map(r => r.id);
                if (sdIds.length > 0) {
                    const { data: exps } = await supabase
                        .from('expenses')
                        .select('*')
                        .in('shift_data_id', sdIds);
                    expenses = exps || [];
                }
            }
        }
    }

    return { cashReport, expenses, posTotal, cashTotal };
}
