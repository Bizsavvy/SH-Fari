import React, { useState, useMemo, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AlertCircle, CheckCircle2, Loader2, Save, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as api from '../lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn, formatNaira } from '../lib/utils';

const formSchema = z.object({
    branch_id: z.string().min(1, "Branch required"),
    attendant_name: z.string().min(1, "Name required"),
    pump_number: z.string().min(1, "Pump required"),
    product_type: z.enum(["PMS", "AGO"]),
    shift_date: z.string().min(1, "Date required"),
    shift_time: z.enum(["Morning", "Evening"]),
    price_per_liter: z.number().min(1, "Price required"),
    opening_meter: z.number().min(0, "Opening meter required"),
    closing_meter: z.number().min(0, "Closing meter required"),
    cash_remitted: z.number().min(0, "Must be ≥ 0"),
    pos_remitted: z.number().min(0, "Must be ≥ 0"),
}).refine(data => data.closing_meter >= data.opening_meter, {
    message: "Closing meter must be ≥ Opening meter",
    path: ["closing_meter"]
});

type FormValues = z.infer<typeof formSchema>;

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5];

export default function ManualDataEntry() {
    const queryClient = useQueryClient();
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    // Cash Analysis state
    const [denomCounts, setDenomCounts] = useState<Record<number, number>>(
        DENOMINATIONS.reduce((acc, curr) => ({ ...acc, [curr]: 0 }), {})
    );
    const [expenses, setExpenses] = useState<{ description: string; amount: number }[]>([]);

    const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: api.getBranches });
    const { data: globalMatrix } = useQuery({ queryKey: ['global_overview'], queryFn: api.getGlobalOverview });

    const {
        register,
        control,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting }
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            branch_id: '',
            attendant_name: '',
            pump_number: 'Pump 1',
            product_type: 'PMS',
            shift_date: new Date().toISOString().split('T')[0],
            shift_time: 'Morning',
            price_per_liter: 880,
            opening_meter: 0,
            closing_meter: 0,
            cash_remitted: 0,
            pos_remitted: 0,
        }
    });

    // Real-time watchers for meter calculations
    const watchAll = useWatch({ control }) as FormValues;
    const openingMeter = Number(watchAll.opening_meter) || 0;
    const closingMeter = Number(watchAll.closing_meter) || 0;
    const price = Number(watchAll.price_per_liter) || 0;
    const cash = Number(watchAll.cash_remitted) || 0;
    const pos = Number(watchAll.pos_remitted) || 0;

    const litersSold = Math.max(0, closingMeter - openingMeter);
    const expectedRevenue = litersSold * price;
    const totalRemitted = cash + pos;
    const trueVariance = totalRemitted - expectedRevenue;

    // Cash analysis calculations
    const subtotals = useMemo(() => {
        return DENOMINATIONS.reduce((acc, curr) => {
            acc[curr] = curr * (denomCounts[curr] || 0);
            return acc;
        }, {} as Record<number, number>);
    }, [denomCounts]);

    const totalCash = useMemo(() => Object.values(subtotals).reduce((sum: number, v: number) => sum + v, 0), [subtotals]);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Reconciliation: compare physical cash + expenses vs ledger total remitted
    const branchId = watchAll.branch_id;
    const attendantName = watchAll.attendant_name;
    const attendantRemitted = useMemo(() => {
        if (!branchId || !attendantName || !globalMatrix) return null;
        const branchRow = globalMatrix.find((r: any) => r.branch.id === branchId);
        if (!branchRow) return null;
        const matchingItems = branchRow.items.filter((item: any) =>
            item.attendant_name?.toLowerCase() === attendantName.toLowerCase()
        );
        if (matchingItems.length === 0) return null;
        return matchingItems.reduce((sum: number, item: any) => sum + item.cash_remitted + item.pos_remitted, 0);
    }, [branchId, attendantName, globalMatrix]);

    const cashPlusExpensesPlusPOS = totalCash + totalExpenses + pos;
    const isMatched = attendantRemitted !== null && Math.abs(cashPlusExpensesPlusPOS - attendantRemitted) < 1;
    const hasMismatch = attendantRemitted !== null && Math.abs(cashPlusExpensesPlusPOS - attendantRemitted) >= 1;

    // Mutations
    const shiftMutation = useMutation({
        mutationFn: api.submitManualShiftData,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global_overview'] });
        },
        onError: (err: any) => {
            setToast({ message: err.message || 'Failed to save shift data.', type: 'error' });
            setTimeout(() => setToast(null), 4000);
        }
    });

    const cashMutation = useMutation({
        mutationFn: api.submitCashAnalysis,
        onError: (err: any) => {
            setToast({ message: 'Cash analysis save failed: ' + err.message, type: 'error' });
            setTimeout(() => setToast(null), 4000);
        }
    });

    const onSubmit = async (data: FormValues) => {
        // Submit shift data (meter readings + cash/POS + expenses)
        const validExpenses = expenses.filter(e => e.description && e.amount > 0);
        await shiftMutation.mutateAsync({ ...data, expenses: validExpenses });

        // Submit cash analysis if any denominations were entered
        const hasAnyCounts = Object.values(denomCounts).some((c: number) => c > 0);
        if (hasAnyCounts) {
            const pumpNum = parseInt(data.pump_number.replace(/[^0-9]/g, ''), 10) || 1;
            await cashMutation.mutateAsync({
                branch_id: data.branch_id,
                attendant_name: data.attendant_name,
                pump_number: pumpNum,
                product_type: data.product_type,
                denominations: denomCounts,
                total_cash: totalCash,
                shift_date: data.shift_date,
                shift_time: data.shift_time
            });
        }

        setToast({ message: 'Shift data + cash analysis saved successfully.', type: 'success' });
        setTimeout(() => setToast(null), 3000);
        reset();
        setDenomCounts(DENOMINATIONS.reduce((acc, curr) => ({ ...acc, [curr]: 0 }), {}));
        setExpenses([]);
        queryClient.invalidateQueries({ queryKey: ['global_overview'] });
    };

    const isBusy = isSubmitting || shiftMutation.isPending || cashMutation.isPending;

    const inputClass = "w-full bg-zinc-950/50 border border-zinc-800 rounded-md px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 focus:border-zinc-600 transition-colors";
    const labelClass = "block text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2";

    return (
        <div className="w-full max-w-4xl mx-auto pb-12">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded text-sm font-bold flex items-center gap-2 shadow-2xl ${toast.type === 'success' ? 'bg-[#18181A] text-white border border-zinc-800' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                    {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {toast.message}
                </div>
            )}

            <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight text-zinc-900 leading-tight">Shift Close-Out</h2>
                <p className="text-sm text-zinc-500 mt-1 font-medium">Inject raw metrics + cash analysis into the Active Shift Ledger.</p>
            </div>

            <div className="bg-[#0A0A0B] text-zinc-50 rounded-xl overflow-hidden border border-zinc-800/60 shadow-2xl flex flex-col relative">
                <form onSubmit={handleSubmit(onSubmit)} className="p-8 lg:p-10 space-y-10 flex-1">

                    {/* Section 1: Global Shift & Attendant Details */}
                    <section>
                        <h3 className="text-zinc-100 text-lg font-bold mb-6 flex items-center gap-3">
                            <span className="w-6 h-6 rounded bg-zinc-900 flex items-center justify-center text-xs font-mono text-zinc-500">1</span>
                            Shift & Attendant Details
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className={labelClass}>Branch Location</label>
                                <select {...register("branch_id")} className={cn(inputClass, "appearance-none")}>
                                    <option value="">Select Branch...</option>
                                    {branches?.map((b: any) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                                {errors.branch_id && <span className="text-red-400 text-xs mt-1 block">{errors.branch_id.message}</span>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Shift Date</label>
                                    <input {...register("shift_date")} type="date" className={inputClass} />
                                    {errors.shift_date && <span className="text-red-400 text-xs mt-1 block">{errors.shift_date.message}</span>}
                                </div>
                                <div>
                                    <label className={labelClass}>Shift Time</label>
                                    <select {...register("shift_time")} className={cn(inputClass, "appearance-none")}>
                                        <option value="Morning">Morning</option>
                                        <option value="Evening">Evening</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className={labelClass}>Attendant Name</label>
                                <input {...register("attendant_name")} type="text" placeholder="e.g. John Doe" className={inputClass} />
                                {errors.attendant_name && <span className="text-red-400 text-xs mt-1 block">{errors.attendant_name.message}</span>}
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className={labelClass}>Product</label>
                                    <select {...register("product_type")} className={cn(inputClass, "appearance-none")}>
                                        <option value="PMS">PMS</option>
                                        <option value="AGO">AGO</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Pump</label>
                                    <select {...register("pump_number")} className={cn(inputClass, "appearance-none")}>
                                        <option value="Pump 1">Pump 1</option>
                                        <option value="Pump 2">Pump 2</option>
                                        <option value="Pump 3">Pump 3</option>
                                        <option value="Pump 4">Pump 4</option>
                                        <option value="Pump 5">Pump 5</option>
                                        <option value="Pump 6">Pump 6</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Price/L (₦)</label>
                                    <input {...register("price_per_liter", { valueAsNumber: true })} type="number" step="0.01" className={inputClass} />
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="h-px bg-zinc-800/50" />

                    {/* Section 2: Meter Readings */}
                    <section>
                        <h3 className="text-zinc-100 text-lg font-bold mb-6 flex items-center gap-3">
                            <span className="w-6 h-6 rounded bg-zinc-900 flex items-center justify-center text-xs font-mono text-zinc-500">2</span>
                            The Meter (Expected)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                            <div className="space-y-6">
                                <div>
                                    <label className={labelClass}>Opening Meter</label>
                                    <input {...register("opening_meter", { valueAsNumber: true })} type="number" step="0.01" className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Closing Meter</label>
                                    <input {...register("closing_meter", { valueAsNumber: true })} type="number" step="0.01" className={cn(inputClass, errors.closing_meter && "border-red-500/50")} />
                                    {errors.closing_meter && <span className="text-red-400 text-xs mt-1 block">{errors.closing_meter.message}</span>}
                                </div>
                            </div>
                            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-6 flex flex-col h-full justify-center">
                                <div className="space-y-6">
                                    <div>
                                        <p className="text-zinc-500 text-sm font-medium mb-1">Calculated Liters Sold</p>
                                        <p className="text-2xl font-mono text-zinc-100">{litersSold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L</p>
                                    </div>
                                    <div>
                                        <p className="text-zinc-500 text-sm font-medium mb-1 flex justify-between">
                                            Expected Revenue <span>{litersSold} × ₦{price.toLocaleString()}</span>
                                        </p>
                                        <p className="text-3xl font-mono font-bold text-emerald-400 tracking-tight">{formatNaira(expectedRevenue)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="h-px bg-zinc-800/50" />

                    {/* Section 3: Actual Collections */}
                    <section>
                        <h3 className="text-zinc-100 text-lg font-bold mb-6 flex items-center gap-3">
                            <span className="w-6 h-6 rounded bg-zinc-900 flex items-center justify-center text-xs font-mono text-zinc-500">3</span>
                            Actual Collections (Remittance)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className={labelClass}>Total Physical Cash (₦)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono">₦</span>
                                    <input {...register("cash_remitted", { valueAsNumber: true })} type="number" step="0.01" className={cn(inputClass, "pl-10")} />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Total POS Claimed (₦)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono">₦</span>
                                    <input {...register("pos_remitted", { valueAsNumber: true })} type="number" step="0.01" className={cn(inputClass, "pl-10")} />
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="h-px bg-zinc-800/50" />

                    {/* Section 4: Cash Analysis — Denomination Spread */}
                    <section>
                        <h3 className="text-zinc-100 text-lg font-bold mb-6 flex items-center gap-3">
                            <span className="w-6 h-6 rounded bg-zinc-900 flex items-center justify-center text-xs font-mono text-zinc-500">4</span>
                            Cash Analysis (Denomination Breakdown)
                        </h3>

                        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-zinc-700/50">
                                        <th className="py-3 px-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest w-1/4">Note Value</th>
                                        <th className="py-3 px-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest w-1/4">Pieces Count</th>
                                        <th className="py-3 px-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                    {DENOMINATIONS.map(note => (
                                        <tr key={note} className="hover:bg-zinc-800/30 transition-colors group">
                                            <td className="py-2.5 px-6">
                                                <span className="font-mono text-sm font-bold text-zinc-300">₦{note.toLocaleString()}</span>
                                            </td>
                                            <td className="py-2.5 px-6">
                                                <div className="flex items-center gap-2 max-w-[120px]">
                                                    <span className="text-zinc-600 group-hover:text-zinc-400 font-mono text-xs">×</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={denomCounts[note] || ''}
                                                        onChange={e => {
                                                            const v = parseInt(e.target.value, 10);
                                                            setDenomCounts(prev => ({ ...prev, [note]: isNaN(v) ? 0 : Math.max(0, v) }));
                                                        }}
                                                        placeholder="0"
                                                        className="w-full bg-zinc-800/50 border border-zinc-700 px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors"
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-6 text-right">
                                                <span className={cn("font-mono text-sm font-bold", subtotals[note] > 0 ? "text-emerald-400" : "text-zinc-600")}>
                                                    {formatNaira(subtotals[note])}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-zinc-800/60 border-t border-zinc-700">
                                        <td colSpan={2} className="py-4 px-6">
                                            <span className="uppercase tracking-widest text-xs font-bold text-zinc-400">Physical Vault Total</span>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <span className="font-mono text-xl font-bold tracking-tight text-emerald-400">{formatNaira(totalCash)}</span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Expenses sub-section */}
                        <div className="mt-6 bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="uppercase tracking-widest text-[10px] font-bold text-zinc-400">Deducted Shift Expenses</h4>
                                <button
                                    type="button"
                                    onClick={() => setExpenses([...expenses, { description: '', amount: 0 }])}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors"
                                >
                                    <Plus size={14} /> Add Expense
                                </button>
                            </div>

                            {expenses.length === 0 ? (
                                <div className="text-center py-4 border border-dashed border-zinc-700 rounded bg-zinc-800/30">
                                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">No expenses claimed</p>
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
                                                className="flex items-start gap-3"
                                            >
                                                <input
                                                    type="text"
                                                    placeholder="Expense description..."
                                                    value={exp.description}
                                                    onChange={e => {
                                                        const next = [...expenses];
                                                        next[index].description = e.target.value;
                                                        setExpenses(next);
                                                    }}
                                                    className="flex-1 bg-zinc-800/50 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                                                />
                                                <div className="w-36 relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-sm">₦</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Amount"
                                                        value={exp.amount || ''}
                                                        onChange={e => {
                                                            const next = [...expenses];
                                                            next[index].amount = Number(e.target.value) || 0;
                                                            setExpenses(next);
                                                        }}
                                                        className="w-full bg-zinc-800/50 border border-zinc-700 px-3 py-1.5 text-sm font-mono text-zinc-100 text-right pl-8 focus:outline-none focus:border-zinc-500"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setExpenses(expenses.filter((_, i) => i !== index))}
                                                    className="p-2 text-red-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    <div className="flex justify-between items-center pt-3 border-t border-zinc-700 mt-3">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Total Expenses</span>
                                        <span className="font-mono text-sm font-bold text-zinc-200">{formatNaira(totalExpenses)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Reconciliation Flag */}
                        {attendantRemitted !== null && (
                            <div className={cn(
                                "mt-6 border rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4",
                                isMatched ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"
                            )}>
                                <div className="flex items-center gap-3">
                                    {isMatched ? (
                                        <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
                                    ) : (
                                        <AlertTriangle size={22} className="text-red-400 shrink-0" />
                                    )}
                                    <div>
                                        <p className={cn("font-bold text-sm", isMatched ? "text-emerald-300" : "text-red-300")}>
                                            {isMatched ? "CASH RECONCILIATION MATCHED" : "CASH RECONCILIATION MISMATCH"}
                                        </p>
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                            Physical Cash + Expenses + POS = <span className="font-mono font-bold text-zinc-200">{formatNaira(cashPlusExpensesPlusPOS)}</span>
                                            {' '} vs Ledger Remitted = <span className="font-mono font-bold text-zinc-200">{formatNaira(attendantRemitted)}</span>
                                        </p>
                                    </div>
                                </div>
                                {hasMismatch && (
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">Difference</p>
                                        <p className="font-mono text-xl font-bold text-red-400">{formatNaira(cashPlusExpensesPlusPOS - attendantRemitted)}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    <div className="h-12" />

                </form>

                {/* Sticky Reconciliation Footer */}
                <div className="bg-zinc-950 border-t border-zinc-800 p-6 sticky bottom-0 z-10 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.5)]">
                    <div className="flex flex-col md:flex-row items-center gap-8 w-full lg:w-auto">
                        <div className="flex flex-col w-full md:w-auto text-center md:text-left">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Total Remitted</span>
                            <span className="text-2xl font-mono text-zinc-300">
                                {formatNaira(totalRemitted)}
                            </span>
                        </div>

                        <div className="hidden md:block w-px h-10 bg-zinc-800" />

                        <div className="flex flex-col w-full md:w-auto text-center md:text-left">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">True Variance</span>
                            <div className="flex items-center gap-3 justify-center md:justify-start">
                                <span className={cn(
                                    "text-3xl font-mono font-bold tracking-tight",
                                    trueVariance >= 0 ? "text-emerald-400" : "text-red-500"
                                )}>
                                    {formatNaira(trueVariance)}
                                </span>
                                {trueVariance < 0 && (
                                    <div className="bg-red-500/10 text-red-500 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                                        <AlertCircle size={14} /> Shortage
                                    </div>
                                )}
                                {trueVariance >= 0 && (
                                    <div className="bg-emerald-400/10 text-emerald-400 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                                        <CheckCircle2 size={14} /> Balanced
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSubmit(onSubmit)}
                        disabled={isBusy}
                        className="w-full lg:w-auto bg-white text-black hover:bg-zinc-200 px-8 py-3.5 rounded-md font-bold text-sm tracking-wide transition-colors flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isBusy ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Saving All Data...
                            </>
                        ) : (
                            <>
                                <Save size={16} />
                                Submit Shift + Cash Analysis
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
