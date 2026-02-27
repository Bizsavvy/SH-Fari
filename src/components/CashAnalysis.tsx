import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatNaira, cn } from '../lib/utils';
import { Save, Loader2, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

interface DenominationCount {
    [key: number]: number;
}

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5];

export default function CashAnalysis() {
    const queryClient = useQueryClient();
    const [counts, setCounts] = useState<DenominationCount>(DENOMINATIONS.reduce((acc, curr) => ({ ...acc, [curr]: 0 }), {}));
    const [form, setForm] = useState({
        branch_id: '',
        attendant_name: '',
        pump_number: 1,
        product_type: 'PMS',
        shift_date: new Date().toISOString().split('T')[0],
        shift_time: 'Morning'
    });
    const [expenses, setExpenses] = useState<{ description: string; amount: number }[]>([]);

    const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: api.getBranches });

    // Pull live ledger data to compare remitted totals
    const { data: globalMatrix } = useQuery({ queryKey: ['global_overview'], queryFn: api.getGlobalOverview });

    const submitMutation = useMutation({
        mutationFn: api.submitCashAnalysis,
        onSuccess: () => {
            alert('Cash Analysis Sheet Locked Successfully!');
            setCounts(DENOMINATIONS.reduce((acc, curr) => ({ ...acc, [curr]: 0 }), {}));
            setForm({ ...form, attendant_name: '', pump_number: 1 });
            setExpenses([]);
            queryClient.invalidateQueries({ queryKey: ['global_overview'] });
        },
        onError: (err: any) => alert('Save failed: ' + err.message)
    });

    const handleCountChange = (denomination: number, value: string) => {
        const numValue = parseInt(value, 10);
        setCounts(prev => ({
            ...prev,
            [denomination]: isNaN(numValue) ? 0 : Math.max(0, numValue)
        }));
    };

    const subtotals = useMemo(() => {
        return DENOMINATIONS.reduce((acc, curr) => {
            acc[curr] = curr * (counts[curr] || 0);
            return acc;
        }, {} as DenominationCount);
    }, [counts]);

    const totalCash = useMemo(() => {
        return Object.values(subtotals).reduce((sum: number, current: number) => sum + current, 0);
    }, [subtotals]);

    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Find the attendant's ledger remitted total for the selected branch
    const attendantRemitted = useMemo(() => {
        if (!form.branch_id || !form.attendant_name || !globalMatrix) return null;
        const branchRow = globalMatrix.find((r: any) => r.branch.id === form.branch_id);
        if (!branchRow) return null;
        const matchingItems = branchRow.items.filter((item: any) =>
            item.attendant_name?.toLowerCase() === form.attendant_name.toLowerCase()
        );
        if (matchingItems.length === 0) return null;
        const totalRemitted = matchingItems.reduce((sum: number, item: any) => sum + item.cash_remitted + item.pos_remitted, 0);
        return totalRemitted;
    }, [form.branch_id, form.attendant_name, globalMatrix]);

    const cashPlusExpenses = totalCash + totalExpenses;
    const isMatched = attendantRemitted !== null && Math.abs(cashPlusExpenses - attendantRemitted) < 1;
    const hasMismatch = attendantRemitted !== null && Math.abs(cashPlusExpenses - attendantRemitted) >= 1;

    return (
        <div className="max-w-4xl space-y-8 pb-32">
            <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div>
                    <h2>Cash Analysis</h2>
                    <p className="text-sm text-zinc-500 mt-1">Reconcile physical cash counts by denomination.</p>
                </div>

                <div className="flex gap-4 flex-wrap">
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Branch</label>
                        <select
                            value={form.branch_id}
                            onChange={e => setForm({ ...form, branch_id: e.target.value })}
                            className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-900"
                        >
                            <option value="">Select Branch</option>
                            {branches?.map((b: any) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Attendant Name</label>
                        <input
                            type="text"
                            placeholder="e.g John Doe"
                            value={form.attendant_name}
                            onChange={e => setForm({ ...form, attendant_name: e.target.value })}
                            className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-900 w-40"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Pump No.</label>
                        <select
                            value={form.pump_number}
                            onChange={e => setForm({ ...form, pump_number: Number(e.target.value) })}
                            className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-900 w-20"
                        >
                            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Product</label>
                        <select
                            value={form.product_type}
                            onChange={e => setForm({ ...form, product_type: e.target.value })}
                            className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-900 w-20"
                        >
                            <option value="PMS">PMS</option>
                            <option value="AGO">AGO</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Shift Date</label>
                        <input
                            type="date"
                            value={form.shift_date}
                            onChange={e => setForm({ ...form, shift_date: e.target.value })}
                            className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-900 w-36"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Time</label>
                        <select
                            value={form.shift_time}
                            onChange={e => setForm({ ...form, shift_time: e.target.value })}
                            className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-900 w-28"
                        >
                            <option value="Morning">Morning</option>
                            <option value="Evening">Evening</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-zinc-200">
                <div className="flex items-center justify-between p-4 border-b border-zinc-200 bg-[#FAFAFA]">
                    <h3 className="uppercase tracking-widest text-xs font-bold text-zinc-400">Denomination Spread</h3>
                    <span className="text-xs font-bold bg-zinc-900 text-white px-2 py-0.5 rounded-sm">Current Shift</span>
                </div>

                <div className="p-0">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#FAFAFA] border-b border-zinc-200">
                                <th className="py-3 px-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest w-1/4">Note Value</th>
                                <th className="py-3 px-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest w-1/4">Pieces Count</th>
                                <th className="py-3 px-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Computed Extension</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {DENOMINATIONS.map((note) => (
                                <motion.tr
                                    key={note}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="hover:bg-zinc-50 transition-colors group"
                                >
                                    <td className="py-3 px-6">
                                        <span className="font-mono text-sm font-bold text-zinc-900">{formatNaira(note)}</span>
                                    </td>
                                    <td className="py-3 px-6">
                                        <div className="flex items-center gap-2 max-w-[120px]">
                                            <span className="text-zinc-300 group-hover:text-zinc-500 font-mono text-xs">x</span>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full bg-zinc-100 border border-zinc-200 px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-zinc-900 focus:bg-white transition-colors"
                                                value={counts[note] || ''}
                                                onChange={(e) => handleCountChange(note, e.target.value)}
                                                placeholder="0"
                                            />
                                        </div>
                                    </td>
                                    <td className="py-3 px-6 text-right">
                                        <span className={cn(
                                            "font-mono text-sm font-bold",
                                            subtotals[note] > 0 ? "text-emerald-600" : "text-zinc-400"
                                        )}>
                                            {formatNaira(subtotals[note])}
                                        </span>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-zinc-900 text-white">
                                <td colSpan={2} className="py-6 px-6">
                                    <span className="uppercase tracking-widest text-xs font-bold opacity-80">Total Vault Physical Cash</span>
                                </td>
                                <td className="py-6 px-6 text-right">
                                    <span className="font-mono text-2xl font-bold tracking-tight text-emerald-400">
                                        {formatNaira(totalCash)}
                                    </span>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Deducted Shift Expenses */}
            <div className="bg-white border border-zinc-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="uppercase tracking-widest text-xs font-bold text-zinc-400">Deducted Shift Expenses</h3>
                    <button
                        type="button"
                        onClick={() => setExpenses([...expenses, { description: '', amount: 0 }])}
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 transition-colors"
                    >
                        <Plus size={14} /> Add Expense
                    </button>
                </div>

                {expenses.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-zinc-200 rounded bg-zinc-50">
                        <p className="text-xs text-zinc-400 font-mono uppercase tracking-widest">No expenses claimed</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence>
                            {expenses.map((exp, index) => (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    key={index}
                                    className="flex items-start gap-4"
                                >
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            placeholder="Expense Description (e.g. Generator Fuel)"
                                            value={exp.description}
                                            onChange={e => {
                                                const next = [...expenses];
                                                next[index].description = e.target.value;
                                                setExpenses(next);
                                            }}
                                            className="w-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-900"
                                        />
                                    </div>
                                    <div className="w-40 relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-sm">₦</span>
                                        <input
                                            type="number"
                                            placeholder="Amount"
                                            value={exp.amount || ''}
                                            onChange={e => {
                                                const next = [...expenses];
                                                next[index].amount = Number(e.target.value) || 0;
                                                setExpenses(next);
                                            }}
                                            className="w-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-mono text-right pl-8 focus:outline-none focus:border-zinc-900"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setExpenses(expenses.filter((_, i) => i !== index))}
                                        className="p-2 text-red-400 hover:text-red-600 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        <div className="flex justify-between items-center pt-3 border-t border-zinc-100 mt-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total Expenses</span>
                            <span className="font-mono text-sm font-bold text-zinc-900">{formatNaira(totalExpenses)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Reconciliation Flag */}
            {attendantRemitted !== null && (
                <div className={cn(
                    "border p-6 flex flex-col md:flex-row md:items-center justify-between gap-4",
                    isMatched ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"
                )}>
                    <div className="flex items-center gap-3">
                        {isMatched ? (
                            <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                        ) : (
                            <AlertTriangle size={24} className="text-red-600 shrink-0" />
                        )}
                        <div>
                            <p className={cn("font-bold text-sm", isMatched ? "text-emerald-800" : "text-red-800")}>
                                {isMatched ? "CASH RECONCILIATION MATCHED" : "CASH RECONCILIATION MISMATCH"}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                Physical Cash + Expenses = <span className="font-mono font-bold">{formatNaira(cashPlusExpenses)}</span>
                                {' '} vs Ledger Remitted = <span className="font-mono font-bold">{formatNaira(attendantRemitted)}</span>
                            </p>
                        </div>
                    </div>
                    {hasMismatch && (
                        <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1">Difference</p>
                            <p className="font-mono text-xl font-bold text-red-600">{formatNaira(cashPlusExpenses - attendantRemitted)}</p>
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-end pt-4">
                <button
                    onClick={() => {
                        if (!form.branch_id || !form.attendant_name) return alert('Branch and Attendant Name required');
                        submitMutation.mutate({ ...form, denominations: counts, total_cash: totalCash });
                    }}
                    disabled={submitMutation.isPending}
                    className="bg-zinc-900 text-white px-8 py-3 text-sm font-bold flex items-center gap-2 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                    {submitMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {submitMutation.isPending ? 'Saving Analysis...' : 'Lock Cash Sheet'}
                </button>
            </div>
        </div>
    );
}
