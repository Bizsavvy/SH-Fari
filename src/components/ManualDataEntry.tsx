import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Trash2, Plus, AlertCircle, CheckCircle2, Loader2, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { submitManualShiftData, getBranches } from '../lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '../lib/utils'; // Assuming this exists or I'll just use a tiny helper

const expenseSchema = z.object({
    description: z.string().min(1, "Required"),
    amount: z.number().min(0, "Must be ≥ 0") // Fix: Allow 0 instead of strict positive if they type 0, but min 0 protects negatives
});

const formSchema = z.object({
    branch_id: z.string().min(1, "Branch required"),
    attendant_name: z.string().min(1, "Name required"),
    pump_number: z.string().min(1, "Pump required"),
    product_type: z.enum(["PMS", "AGO"]),
    price_per_liter: z.number().min(1, "Price required"),
    opening_meter: z.number().min(0, "Opening meter required"),
    closing_meter: z.number().min(0, "Closing meter required"),
    cash_remitted: z.number().min(0, "Must be ≥ 0"),
    pos_remitted: z.number().min(0, "Must be ≥ 0"),
    expenses: z.array(expenseSchema).optional()
}).refine(data => data.closing_meter >= data.opening_meter, {
    message: "Closing meter must be ≥ Opening meter",
    path: ["closing_meter"]
});

type FormValues = z.infer<typeof formSchema>;

const formatNaira = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2
    }).format(amount);
};

export default function ManualDataEntry() {
    const queryClient = useQueryClient();
    const [branches, setBranches] = useState<any[]>([]);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        getBranches().then(setBranches).catch(console.error);
    }, []);

    const {
        register,
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting }
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            branch_id: '',
            attendant_name: '',
            pump_number: 'Pump 1',
            product_type: 'PMS',
            price_per_liter: 880,
            opening_meter: 0,
            closing_meter: 0,
            cash_remitted: 0,
            pos_remitted: 0,
            expenses: []
        }
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "expenses"
    });

    // Real-time watchers
    const watchAll = useWatch({ control }) as FormValues;
    const openingMeter = Number(watchAll.opening_meter) || 0;
    const closingMeter = Number(watchAll.closing_meter) || 0;
    const price = Number(watchAll.price_per_liter) || 0;
    const cash = Number(watchAll.cash_remitted) || 0;
    const pos = Number(watchAll.pos_remitted) || 0;
    const expensesList = watchAll.expenses || [];

    // Auto-Calculations
    const litersSold = Math.max(0, closingMeter - openingMeter);
    const expectedRevenue = litersSold * price;
    const sumOfExpenses = expensesList.reduce((acc, curr) => acc + (Number(curr?.amount) || 0), 0);
    const totalRemitted = cash + pos + sumOfExpenses;
    const trueVariance = totalRemitted - expectedRevenue;

    const mutation = useMutation({
        mutationFn: submitManualShiftData,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['globalData'] });
            setToast({ message: 'Shift data strictly encoded via Truth Engine parameters.', type: 'success' });
            reset(); // Reset form
            setTimeout(() => setToast(null), 3000);
        },
        onError: (err: any) => {
            setToast({ message: err.message || 'Failed to inject shift data.', type: 'error' });
            setTimeout(() => setToast(null), 4000);
        }
    });

    const onSubmit = (data: FormValues) => {
        mutation.mutate(data);
    };

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
                <p className="text-sm text-zinc-500 mt-1 font-medium">Inject raw metrics perfectly straight into the Active Shift Ledger.</p>
            </div>

            <div className="bg-[#0A0A0B] text-zinc-50 rounded-xl overflow-hidden border border-zinc-800/60 shadow-2xl flex flex-col relative">
                <form onSubmit={handleSubmit(onSubmit)} className="p-8 lg:p-10 space-y-10 flex-1">

                    {/* Section 1: Entity Identifiers */}
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
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                                {errors.branch_id && <span className="text-red-400 text-xs mt-1 block">{errors.branch_id.message}</span>}
                            </div>

                            <div>
                                <label className={labelClass}>Attendant Name</label>
                                <input {...register("attendant_name")} type="text" placeholder="e.g. John Doe" className={inputClass} />
                                {errors.attendant_name && <span className="text-red-400 text-xs mt-1 block">{errors.attendant_name.message}</span>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
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
                            </div>

                            <div>
                                <label className={labelClass}>Price per Liter (₦)</label>
                                <input {...register("price_per_liter", { valueAsNumber: true })} type="number" step="0.01" className={inputClass} />
                                {errors.price_per_liter && <span className="text-red-400 text-xs mt-1 block">{errors.price_per_liter.message}</span>}
                            </div>
                        </div>
                    </section>

                    <div className="h-px bg-zinc-800/50" />

                    {/* Section 2: Expected Math */}
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
                                    {errors.opening_meter && <span className="text-red-400 text-xs mt-1 block">{errors.opening_meter.message}</span>}
                                </div>
                                <div>
                                    <label className={labelClass}>Closing Meter</label>
                                    <input {...register("closing_meter", { valueAsNumber: true })} type="number" step="0.01" className={cn(inputClass, errors.closing_meter && "border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50")} />
                                    {errors.closing_meter && <span className="text-red-400 text-xs mt-1 block">{errors.closing_meter.message}</span>}
                                </div>
                            </div>

                            {/* Live Preview Card */}
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

                    {/* Section 3: Returns */}
                    <section>
                        <h3 className="text-zinc-100 text-lg font-bold mb-6 flex items-center gap-3">
                            <span className="w-6 h-6 rounded bg-zinc-900 flex items-center justify-center text-xs font-mono text-zinc-500">3</span>
                            Actual Collections (Remittance)
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div>
                                <label className={labelClass}>Total Physical Cash (₦)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono">₦</span>
                                    <input {...register("cash_remitted", { valueAsNumber: true })} type="number" step="0.01" className={cn(inputClass, "pl-10")} />
                                </div>
                                {errors.cash_remitted && <span className="text-red-400 text-xs mt-1 block">{errors.cash_remitted.message}</span>}
                            </div>
                            <div>
                                <label className={labelClass}>Total POS Claimed (₦)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono">₦</span>
                                    <input {...register("pos_remitted", { valueAsNumber: true })} type="number" step="0.01" className={cn(inputClass, "pl-10")} />
                                </div>
                                {errors.pos_remitted && <span className="text-red-400 text-xs mt-1 block">{errors.pos_remitted.message}</span>}
                            </div>
                        </div>

                        {/* Expenses Array */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-bold text-zinc-300">Deducted Shift Expenses</h4>
                                <button
                                    type="button"
                                    onClick={() => append({ description: '', amount: 0 })}
                                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
                                >
                                    <Plus size={14} /> Add Expense
                                </button>
                            </div>

                            {fields.length === 0 ? (
                                <div className="text-center py-6 border border-dashed border-zinc-800 rounded bg-zinc-950/30">
                                    <p className="text-xs text-zinc-600 font-mono uppercase tracking-widest">No expenses claimed</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <AnimatePresence>
                                        {fields.map((field, index) => (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                key={field.id}
                                                className="flex items-start gap-4"
                                            >
                                                <div className="flex-1">
                                                    <input
                                                        {...register(`expenses.${index}.description` as const)}
                                                        placeholder="Expense Description (e.g. Generator Fuel)"
                                                        className={inputClass}
                                                    />
                                                    {errors.expenses?.[index]?.description && <span className="text-red-400 text-xs mt-1 block">{errors.expenses[index]?.description?.message}</span>}
                                                </div>
                                                <div className="w-48 relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-sm">₦</span>
                                                    <input
                                                        {...register(`expenses.${index}.amount` as const, { valueAsNumber: true })}
                                                        type="number"
                                                        placeholder="Amount"
                                                        className={cn(inputClass, "pl-8 text-right")}
                                                    />
                                                    {errors.expenses?.[index]?.amount && <span className="text-red-400 text-xs mt-1 block">{errors.expenses[index]?.amount?.message}</span>}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => remove(index)}
                                                    className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Spacing for sticky footer */}
                    <div className="h-12" />

                </form>

                {/* Section 4: Sticky Reconciliation Summary */}
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
                        disabled={isSubmitting || mutation.isPending}
                        className="w-full lg:w-auto bg-white text-black hover:bg-zinc-200 px-8 py-3.5 rounded-md font-bold text-sm tracking-wide transition-colors flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {(isSubmitting || mutation.isPending) ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Injecting Record...
                            </>
                        ) : (
                            <>
                                <Save size={16} />
                                Submit Shift Record
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
