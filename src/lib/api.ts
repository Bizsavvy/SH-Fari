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
