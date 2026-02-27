import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState, useMemo, useEffect } from 'react';
import * as api from './lib/api';
import ManualDataEntry from './components/ManualDataEntry';

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  LayoutDashboard,
  History,
  Settings,
  MoreHorizontal,
  LogOut,
  Search,
  Upload as UploadIcon,
  CheckCircle2,
  AlertCircle,
  Receipt,
  FileEdit,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  X,
  Trash2,
  Calendar,
  Filter
} from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  ColumnDef
} from '@tanstack/react-table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatNaira } from './lib/utils';

const queryClient = new QueryClient();

// Types
interface Expense {
  id: string;
  shift_data_id: string;
  description: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  attendant_name: string;
}

const VarianceDisplay = ({ val, large = false }: { val: number, large?: boolean }) => (
  <span className={cn(
    "font-mono font-bold tracking-tight",
    val < 0 ? "text-red-600" : val > 0 ? "text-emerald-600" : "text-zinc-900",
    large ? "text-3xl md:text-4xl" : "text-sm"
  )}>
    {formatNaira(val)}
  </span>
);

// --- Feedback & Utilities ---

let globalToastFn: (msg: string) => void = () => { };

const Toaster = () => {
  const [toasts, setToasts] = useState<{ id: string, msg: string }[]>([]);

  useEffect(() => {
    globalToastFn = (msg: string) => {
      const id = Math.random().toString();
      setToasts(prev => [...prev, { id, msg }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
  }, []);

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className="bg-zinc-900 text-white px-5 py-4 flex items-center gap-3 max-w-sm shadow-2xl rounded-sm"
          >
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <p className="text-sm font-medium leading-snug">{t.msg}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const notifyToast = (msg: string) => globalToastFn(msg);

const SkeletonLoader = () => (
  <div className="flex h-screen bg-white text-zinc-900 font-sans">
    <aside className="w-56 bg-[#FAFAFA] border-r border-zinc-200 p-6 flex flex-col shrink-0 z-30 opacity-70">
      <div className="mb-10 w-32 h-6 bg-zinc-200 animate-pulse rounded-sm" />
      <div className="space-y-4 flex-1">
        {[1, 2, 3, 4].map(i => <div key={i} className="w-full h-8 bg-zinc-200 animate-pulse rounded-sm" />)}
      </div>
    </aside>
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <header className="h-14 border-b border-zinc-200 bg-white px-8 flex items-center justify-between shrink-0">
        <div className="w-48 h-6 bg-zinc-100 animate-pulse rounded-sm" />
      </header>
      <div className="bg-white border-b border-zinc-200 px-8 py-8">
        <div className="max-w-6xl mx-auto flex justify-between gap-6">
          <div className="w-48 h-10 bg-zinc-100 animate-pulse rounded-sm" />
          <div className="w-72 h-16 bg-zinc-100 animate-pulse rounded-sm" />
        </div>
      </div>
      <div className="p-8 max-w-6xl mx-auto w-full space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="w-full h-16 bg-zinc-50 animate-pulse rounded-sm" />)}
      </div>
    </div>
  </div>
);

// --- Subordinated UI Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full px-3 py-2 text-sm transition-all duration-200 relative group",
      active ? "text-zinc-900 font-bold" : "text-zinc-500 hover:text-zinc-900 font-medium"
    )}
  >
    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-zinc-900 rounded-r-full" />}
    <Icon size={16} strokeWidth={active ? 2.5 : 2} className={cn(active ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600 transition-colors")} />
    <span>{label}</span>
  </button>
);

// --- Truth Engine Tracking Components ---

const GlobalTracker = ({ matrix, navigateToLevel }: { matrix: any[], navigateToLevel: (level: 'global', branchId?: string) => void }) => {
  const totals = matrix.reduce((acc, curr) => ({
    expected: acc.expected + curr.totalExpected,
    remitted: acc.remitted + curr.totalCash + curr.totalPos,
    variance: acc.variance + curr.totalVariance,
    expenses: acc.expenses + curr.pendingExpenseTotal
  }), { expected: 0, remitted: 0, variance: 0, expenses: 0 });

  return (
    <div className="bg-white border-b border-zinc-200 px-8 py-8 shrink-0 relative z-20">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">

        <div className="cursor-pointer group flex flex-col" onClick={() => navigateToLevel('global')}>
          <h1 className="text-2xl font-black tracking-tight leading-none text-zinc-900 group-hover:text-zinc-600 transition-colors">Global Ledger</h1>
          <p className="text-[10px] text-zinc-400 font-bold tracking-widest uppercase mt-1">Live Math Sequence</p>
        </div>

        <div className="flex items-end gap-12">
          {/* Subordinate data: Expected and Remitted */}
          <div className="hidden md:block text-right">
            <p className="text-[10px] text-zinc-400 font-bold tracking-widest uppercase mb-1">Expected Vol</p>
            <p className="text-lg font-mono text-zinc-600">{formatNaira(totals.expected)}</p>
          </div>
          <div className="hidden md:block text-right">
            <p className="text-[10px] text-zinc-400 font-bold tracking-widest uppercase mb-1">Remitted Vol</p>
            <p className="text-lg font-mono text-zinc-600">{formatNaira(totals.remitted)}</p>
          </div>
          <div className="hidden sm:block text-right border-r border-zinc-200 pr-12">
            <p className="text-[10px] text-zinc-400 font-bold tracking-widest uppercase mb-1">Pending Exp.</p>
            <p className="text-lg font-mono text-zinc-600">{formatNaira(totals.expenses)}</p>
          </div>

          {/* Primary Focus: Net Variance */}
          <div className="flex flex-col items-end">
            <p className="text-[10px] text-zinc-900 font-black tracking-widest uppercase mb-2">Net System Variance</p>
            <VarianceDisplay val={totals.variance} large />
          </div>
        </div>
      </div>
    </div>
  );
};

const BranchOverviewMatrix = ({ matrix, setActiveBranch }: { matrix: any[], setActiveBranch: (id: string) => void }) => {
  return (
    <div className="max-w-6xl mx-auto pt-4">
      <div className="grid grid-cols-1 divide-y divide-zinc-100 border-t border-zinc-100">
        <div className="flex items-center justify-between py-3 px-2">
          <div className="w-1/3"><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Branch</span></div>
          <div className="w-2/3 flex items-center justify-between">
            <div className="w-32 hidden md:block"><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Expected</span></div>
            <div className="w-32 hidden md:block"><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Remitted & Exp.</span></div>
            <div className="w-32 text-right"><span className="text-[10px] font-bold text-zinc-900 uppercase tracking-widest">Variance</span></div>
            <div className="w-6" />
          </div>
        </div>

        {matrix.map((row) => (
          <div
            key={row.branch.id}
            onClick={() => setActiveBranch(row.branch.id)}
            className="group py-4 px-2 cursor-pointer flex flex-col md:flex-row md:items-center justify-between transition-colors hover:bg-zinc-50"
          >
            <div className="flex flex-col gap-1 w-1/3 mb-2 md:mb-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900">{row.branch.name}</h3>
                {row.shift && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Active Shift" />}
              </div>
              {row.shift && <p className="text-xs text-zinc-400 font-medium">{row.items.length} Active Lines</p>}
            </div>

            <div className="flex items-center justify-between w-2/3">
              <div className="hidden md:block w-32">
                <p className="font-mono text-sm text-zinc-500">{formatNaira(row.totalExpected)}</p>
              </div>
              <div className="hidden md:block w-32">
                <p className="font-mono text-sm text-zinc-500">{formatNaira(row.totalCash + row.totalPos + row.pendingExpenseTotal)}</p>
              </div>
              <div className="w-32 text-right">
                <VarianceDisplay val={row.totalVariance} />
              </div>
              <ChevronRight size={16} className="text-zinc-300 group-hover:text-zinc-900 transition-transform group-hover:translate-x-1 ml-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}; const AttendantModal = ({ isOpen, onClose, branchId, attendantName, shiftDate, shiftTime }: any) => {
  const { data, isLoading } = useQuery({
    queryKey: ['attendant_drilldown', branchId, attendantName, shiftDate, shiftTime],
    queryFn: () => api.getAttendantDrillDown(branchId, attendantName, shiftDate, shiftTime),
    enabled: isOpen && !!attendantName
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-white border border-zinc-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div>
            <h3 className="font-black text-xl text-zinc-900 leading-none">{attendantName}</h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1.5">Shift Profile Details</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 transition-colors rounded-sm text-zinc-500 hover:text-zinc-900 hover:scale-105 active:scale-95">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-10">
          {isLoading ? (
            <div className="py-24 flex justify-center text-zinc-400"><Loader2 className="animate-spin" size={24} /></div>
          ) : (
            <>
              {/* Cash Analysis Denominations */}
              <section>
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-200 pb-2 mb-4">Cash Analysis Locker</h4>
                {data?.cashReport ? (() => {
                  const vaultTotal = Object.entries(data.cashReport.denominations).reduce((sum: number, [denom, count]: any) => sum + (Number(denom) * Number(count)), 0);
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(data.cashReport.denominations).sort(([a], [b]) => Number(b) - Number(a)).map(([denom, count]: any) => {
                        if (count === 0) return null;
                        return (
                          <div key={denom} className="bg-zinc-50 p-4 border border-zinc-100 flex flex-col justify-center items-center shadow-sm">
                            <span className="text-sm font-black text-zinc-900">₦{denom}</span>
                            <span className="text-xs text-zinc-500 font-mono font-medium">x {count}</span>
                          </div>
                        );
                      })}
                      <div className="col-span-full mt-4 flex justify-between items-end border-t border-zinc-200 pt-6">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Physical Vault Total:</span>
                        <span className="text-2xl font-mono text-zinc-900 font-black tracking-tight">{formatNaira(vaultTotal)}</span>
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-sm text-zinc-500 font-medium">No physical breakdown logged for this attendant.</p>
                )}
              </section>

              {/* POS Claimed */}
              <section>
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-200 pb-2 mb-4">POS Claimed</h4>
                {(data?.posTotal ?? 0) > 0 ? (
                  <div className="flex justify-between items-center p-4 bg-blue-50 border border-blue-100">
                    <span className="text-sm font-bold text-blue-900">Total POS Amount</span>
                    <span className="font-mono text-xl text-blue-900 font-black tracking-tight">{formatNaira(data?.posTotal || 0)}</span>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 font-medium">No POS transactions recorded for this shift.</p>
                )}
              </section>

              {/* Expenses */}
              <section>
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-200 pb-2 mb-4">Recorded Expense Matrix</h4>
                {data?.expenses && data.expenses.length > 0 ? (
                  <div className="space-y-3">
                    {data.expenses.map((e: any) => (
                      <div key={e.id} className="flex justify-between items-center p-4 border border-zinc-100 bg-white shadow-sm">
                        <div>
                          <p className="font-bold text-zinc-900 text-sm">{e.description}</p>
                          <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 mt-1 inline-block", e.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : e.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}>{e.status}</span>
                        </div>
                        <span className="font-mono text-zinc-900 font-bold tracking-tight">{formatNaira(e.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-3 border-t border-zinc-200 mt-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Total Expenses</span>
                      <span className="font-mono text-sm font-bold text-zinc-900">{formatNaira(data.expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0))}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 font-medium">Zero expenses were deducted during this shift segment.</p>
                )}
              </section>

              {/* Grand Total Summary */}
              <section>
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-200 pb-2 mb-4">Total Remittance Summary</h4>
                {(() => {
                  const vaultTotal = data?.cashReport
                    ? Object.entries(data.cashReport.denominations).reduce((sum: number, [d, c]: any) => sum + (Number(d) * Number(c)), 0)
                    : (data?.cashTotal || 0);
                  const posVal = data?.posTotal || 0;
                  const expVal = data?.expenses?.reduce((s: number, e: any) => s + (e.amount || 0), 0) || 0;
                  const grandTotal = vaultTotal + posVal + expVal;

                  return (
                    <div className="bg-zinc-900 text-white rounded-lg p-5 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Physical Cash</span>
                        <span className="font-mono text-sm font-bold text-zinc-200">{formatNaira(vaultTotal)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">POS</span>
                        <span className="font-mono text-sm font-bold text-zinc-200">{formatNaira(posVal)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Expenses</span>
                        <span className="font-mono text-sm font-bold text-zinc-200">{formatNaira(expVal)}</span>
                      </div>
                      <div className="border-t border-zinc-700 pt-3 mt-2 flex justify-between items-end">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Grand Total</span>
                        <span className="font-mono text-2xl font-black tracking-tight text-emerald-400">{formatNaira(grandTotal)}</span>
                      </div>
                    </div>
                  );
                })()}
              </section>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};


const ActiveShiftLedger = ({ branchData, navigateBack }: { branchData: any, navigateBack: () => void }) => {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [confirmAction, setConfirmAction] = useState<{ id: string, type: 'approve' | 'reject' } | null>(null);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ expected: 0, cash: 0, pos: 0, date: '' });
  const [isSaving, setIsSaving] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedAttendant, setSelectedAttendant] = useState<string | null>(null);

  // Filter state
  const [datePreset, setDatePreset] = useState<'today' | 'this_week' | 'last_week' | 'this_month' | 'custom' | 'all'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'PMS' | 'AGO'>('all');

  // Compute date range from preset
  const getDateRange = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const day = now.getDay(); // 0=Sun
    switch (datePreset) {
      case 'today':
        return { from: todayStr, to: todayStr };
      case 'this_week': {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); // Mon
        return { from: startOfWeek.toISOString().split('T')[0], to: todayStr };
      }
      case 'last_week': {
        const startOfThisWeek = new Date(now);
        startOfThisWeek.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        const endOfLastWeek = new Date(startOfThisWeek);
        endOfLastWeek.setDate(endOfLastWeek.getDate() - 1);
        const startOfLastWeek = new Date(endOfLastWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 6);
        return { from: startOfLastWeek.toISOString().split('T')[0], to: endOfLastWeek.toISOString().split('T')[0] };
      }
      case 'this_month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: startOfMonth.toISOString().split('T')[0], to: todayStr };
      }
      case 'custom':
        return { from: customFrom || '2020-01-01', to: customTo || todayStr };
      default:
        return null; // 'all' — no filter
    }
  }, [datePreset, customFrom, customTo]);

  // Filtered items
  const filteredItems = useMemo(() => {
    let items = branchData.items || [];
    // Date filter
    if (getDateRange) {
      items = items.filter((item: any) => {
        const d = item.shift_date;
        if (!d) return false;
        return d >= getDateRange.from && d <= getDateRange.to;
      });
    }
    // Product filter
    if (productFilter !== 'all') {
      items = items.filter((item: any) =>
        item.pump_product?.toUpperCase().includes(productFilter)
      );
    }
    return items;
  }, [branchData.items, getDateRange, productFilter]);

  const deleteShiftMutation = useMutation({
    mutationFn: () => api.deleteOpenShiftByBranch(branchData.branch.id),
    onSuccess: () => {
      notifyToast(`Purged Station Ledger for ${branchData.branch.name}`);
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
      setIsDeleting(false);
      navigateBack();
    },
    onError: (err: any) => {
      notifyToast(`Failed to purge ledger: ${err.message}`);
      setIsDeleting(false);
    }
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveExpense(id),
    onSuccess: (_, variables) => {
      const expense = branchData.pendingExpenses.find((e: any) => e.id === variables);
      notifyToast(`Approved ${formatNaira(expense?.amount || 0)} for ${expense?.description || 'Expense'}.`);
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectExpense(id),
    onSuccess: (_, variables) => {
      const expense = branchData.pendingExpenses.find((e: any) => e.id === variables);
      notifyToast(`Rejected ${expense?.description || 'Expense'}. Logic recalculated.`);
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
    }
  });

  const updateShiftMutation = useMutation({
    mutationFn: (data: { id: string, expected: number, cash: number, pos: number, date: string }) =>
      api.updateShiftDataRecord(data.id, { expected_amount: data.expected, cash_remitted: data.cash, pos_remitted: data.pos, shift_date: data.date }),
    onSuccess: () => {
      notifyToast("Shift record updated successfully.");
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
      setEditingRowId(null);
    },
    onSettled: () => setIsSaving(false),
    onError: (err: any) => notifyToast(`Update failed: ${err.message}`)
  });

  const handleAction = (id: string, type: 'approve' | 'reject') => setConfirmAction({ id, type });

  const executeAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'approve') approveMutation.mutate(confirmAction.id);
    else rejectMutation.mutate(confirmAction.id);
    setConfirmAction(null);
  };

  const startEditing = (row: any) => {
    setEditingRowId(row.id);
    setEditForm({ expected: row.expected_amount, cash: row.cash_remitted, pos: row.pos_remitted, date: row.shift_date || '' });
  };

  const saveEdit = (id: string) => {
    setIsSaving(true);
    updateShiftMutation.mutate({ id, expected: editForm.expected, cash: editForm.cash, pos: editForm.pos, date: editForm.date });
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'attendant_name',
      header: 'Attendant',
      cell: info => <span onClick={() => setSelectedAttendant(info.getValue() as string)} className="font-bold text-zinc-900 cursor-pointer hover:underline underline-offset-2">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'pump_product',
      header: 'Line',
      cell: info => <span className="text-xs text-zinc-500 font-medium">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'shift_date',
      header: 'Date',
      cell: info => {
        const row = info.row.original;
        if (editingRowId === row.id) return (
          <input
            type="date"
            className="w-32 px-2 py-1 bg-zinc-100 border border-zinc-200 focus:outline-none focus:border-zinc-900 rounded-sm text-xs font-mono text-zinc-900 transition-colors"
            value={editForm.date}
            onChange={e => setEditForm(prev => ({ ...prev, date: e.target.value }))}
          />
        );
        const d = info.getValue() as string;
        if (!d) return <span className="text-xs text-zinc-400">—</span>;
        return <span className="text-xs text-zinc-500 font-mono">{new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>;
      },
    },
    {
      accessorKey: 'expected_amount',
      header: 'Expected',
      cell: info => {
        const row = info.row.original;
        if (editingRowId === row.id) return (
          <input
            type="number"
            className="w-24 px-2 py-1 bg-zinc-100 border border-zinc-200 focus:outline-none focus:border-zinc-900 rounded-sm text-sm font-mono text-zinc-900 transition-colors"
            value={editForm.expected}
            onChange={e => setEditForm(prev => ({ ...prev, expected: Number(e.target.value) }))}
          />
        );
        return <span className="font-mono text-sm">{formatNaira(info.getValue() as number)}</span>;
      },
    },
    {
      header: 'Remitted',
      cell: info => {
        const row = info.row.original;
        if (editingRowId === row.id) return (
          <div className="flex gap-1 items-center">
            <input
              type="number"
              placeholder="Cash"
              className="w-20 px-2 py-1 bg-zinc-100 border border-zinc-200 focus:outline-none focus:border-zinc-900 rounded-sm text-sm font-mono text-zinc-900 transition-colors"
              value={editForm.cash}
              onChange={e => setEditForm(prev => ({ ...prev, cash: Number(e.target.value) }))}
            />
            <span className="text-zinc-400 text-xs font-bold">+</span>
            <input
              type="number"
              placeholder="POS"
              className="w-20 px-2 py-1 bg-zinc-100 border border-zinc-200 focus:outline-none focus:border-zinc-900 rounded-sm text-sm font-mono text-zinc-900 transition-colors"
              value={editForm.pos}
              onChange={e => setEditForm(prev => ({ ...prev, pos: Number(e.target.value) }))}
            />
          </div>
        );
        return <span className="font-mono text-sm text-zinc-700">{formatNaira(row.cash_remitted + row.pos_remitted)}</span>;
      },
    },
    {
      accessorKey: 'variance',
      header: 'Variance',
      cell: info => {
        const row = info.row.original;
        if (editingRowId === row.id) {
          const liveVariance = (editForm.cash + editForm.pos) - editForm.expected;
          return <VarianceDisplay val={liveVariance} />;
        }
        return <VarianceDisplay val={info.getValue() as number} />;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: info => {
        const row = info.row.original;
        if (editingRowId === row.id) return (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => saveEdit(row.id)}
              disabled={isSaving}
              className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              title="Save Changes"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
            </button>
            <button
              onClick={() => setEditingRowId(null)}
              disabled={isSaving}
              className="p-1 rounded bg-zinc-100 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-colors"
              title="Cancel"
            >
              <X size={14} strokeWidth={3} />
            </button>
          </div>
        );
        return (
          <div className="flex items-center justify-end">
            <button
              onClick={() => startEditing(row)}
              className="p-1 text-zinc-300 hover:text-zinc-900 transition-colors"
              title="Edit Record"
            >
              <FileEdit size={14} />
            </button>
          </div>
        );
      }
    }
  ], [editingRowId, editForm, isSaving]);

  const table = useReactTable({
    data: filteredItems,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="max-w-6xl mx-auto pt-2 space-y-8">
      {selectedAttendant && (
        <AttendantModal
          isOpen={!!selectedAttendant}
          onClose={() => setSelectedAttendant(null)}
          branchId={branchData.branch.id}
          attendantName={selectedAttendant}
          shiftDate={branchData.shift?.shift_date || new Date().toISOString().split('T')[0]}
          shiftTime={branchData.shift?.shift_time || 'Morning'}
        />
      )}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={navigateBack} className="text-zinc-400 hover:text-zinc-900 transition-colors flex items-center text-sm font-bold uppercase tracking-widest gap-1">
          <ChevronLeft size={16} /> Back
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
        <div className="xl:col-span-2 space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-200 pb-2 mb-4 gap-4">
            <div>
              <h3 className="font-black text-xl tracking-tight text-zinc-900 leading-none">{branchData.branch.name} Ledger</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1.5">
                {filteredItems.length} {filteredItems.length === 1 ? 'entry' : 'entries'}
                {datePreset !== 'all' && ` — ${datePreset.replace('_', ' ')}`}
                {productFilter !== 'all' && ` — ${productFilter} only`}
              </p>
            </div>

            {isDeleting ? (
              <div className="flex items-center gap-3 bg-red-50/50 border border-red-100 px-3 py-1.5 rounded-sm">
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Delete Entire Shift? / Irreversible</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => deleteShiftMutation.mutate()}
                    disabled={deleteShiftMutation.isPending}
                    className="text-[10px] font-bold bg-red-600 text-white px-3 py-1 hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {deleteShiftMutation.isPending ? 'Purging...' : 'Yes, Purge'}
                  </button>
                  <button
                    onClick={() => setIsDeleting(false)}
                    disabled={deleteShiftMutation.isPending}
                    className="text-[10px] font-bold text-zinc-500 hover:text-zinc-900 px-3 py-1 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsDeleting(true)}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-red-600 transition-colors group"
                title="Clear Station Ledger"
              >
                <Trash2 size={14} className="group-hover:scale-110 transition-transform" /> Clear Station
              </button>
            )}
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 py-3 border-b border-zinc-100">
            <div className="flex items-center gap-1.5 mr-2">
              <Calendar size={13} className="text-zinc-400" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Date:</span>
            </div>
            {([
              ['all', 'All'],
              ['today', 'Today'],
              ['this_week', 'This Week'],
              ['last_week', 'Last Week'],
              ['this_month', 'This Month'],
              ['custom', 'Custom'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDatePreset(key)}
                className={cn(
                  "text-[10px] font-bold px-3 py-1 transition-colors",
                  datePreset === key
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                )}
              >
                {label}
              </button>
            ))}

            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 ml-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="text-[10px] border border-zinc-200 bg-zinc-50 px-2 py-1 focus:outline-none focus:border-zinc-900"
                />
                <span className="text-zinc-300 text-xs">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="text-[10px] border border-zinc-200 bg-zinc-50 px-2 py-1 focus:outline-none focus:border-zinc-900"
                />
              </div>
            )}

            <div className="h-4 w-px bg-zinc-200 mx-2" />

            <div className="flex items-center gap-1.5 mr-1">
              <Filter size={13} className="text-zinc-400" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Product:</span>
            </div>
            {(['all', 'PMS', 'AGO'] as const).map(v => (
              <button
                key={v}
                onClick={() => setProductFilter(v)}
                className={cn(
                  "text-[10px] font-bold px-3 py-1 transition-colors",
                  productFilter === v
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                )}
              >
                {v === 'all' ? 'All' : v}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id} className="border-b border-zinc-200">
                    {hg.headers.map(h => (
                      <th key={h.id} className="py-3 px-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="hover:bg-zinc-50/50 transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="py-4 px-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Required: Expenses (Restrained Design) */}
        <div className="xl:col-span-1 border-l border-zinc-200 pl-8 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-2 mb-4">
            <h3 className="font-black text-zinc-900">Pending Actions</h3>
            {branchData.pendingExpenses.length > 0 && <span className="bg-zinc-900 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">{branchData.pendingExpenses.length} Left</span>}
          </div>

          <div className="space-y-6">
            {branchData.pendingExpenses.length === 0 ? (
              <div className="py-12 text-zinc-400 text-sm">
                <p className="font-bold text-zinc-900">All Math Reconciled</p>
                <p className="mt-1">No pending expenses altering the live variance.</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {branchData.pendingExpenses.map((expense: any) => {
                  const isConfirming = confirmAction?.id === expense.id;
                  const isProcessing = approveMutation.isPending || rejectMutation.isPending;

                  return (
                    <motion.div
                      key={expense.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                      className="space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-sm text-zinc-900 leading-tight">{expense.description}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-0.5">By {expense.attendant_name}</p>
                        </div>
                        <p className="font-mono text-base font-bold text-zinc-900">{formatNaira(expense.amount)}</p>
                      </div>

                      {isConfirming ? (
                        <div className="flex bg-zinc-50 p-2 border border-zinc-200 items-center justify-between">
                          <span className="text-xs font-bold text-zinc-900 uppercase tracking-widest">Are you sure?</span>
                          <div className="flex gap-2">
                            <button
                              onClick={executeAction}
                              disabled={isProcessing}
                              className={cn("text-xs font-bold px-3 py-1 text-white transition-colors", confirmAction.type === 'approve' ? "bg-zinc-900 hover:bg-zinc-800" : "bg-red-600 hover:bg-red-700")}
                            >
                              {isProcessing ? "Processing..." : confirmAction.type === 'approve' ? "Yes, Approve" : "Yes, Reject"}
                            </button>
                            <button onClick={() => setConfirmAction(null)} disabled={isProcessing} className="text-zinc-500 hover:text-zinc-900 font-bold text-xs px-2">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => handleAction(expense.id, 'approve')} className="flex-1 text-zinc-900 font-bold text-xs py-1.5 border border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 transition-colors">
                            Approve
                          </button>
                          <button onClick={() => handleAction(expense.id, 'reject')} className="text-zinc-500 hover:text-red-600 font-bold text-xs py-1.5 px-3 transition-colors">
                            Reject
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


// --- Legacy Components for Tabs ---

const ExpenseAudit = () => {
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<{ id: string, type: 'approve' | 'reject' } | null>(null);

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', 'pending'],
    queryFn: () => api.getPendingExpenses()
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveExpense(id),
    onSuccess: (_, variables) => {
      const expense = expenses?.find(e => e.id === variables);
      notifyToast(`Approved ${formatNaira(expense?.amount || 0)} for ${expense?.description || 'Expense'}.`);
      queryClient.invalidateQueries({ queryKey: ['expenses', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectExpense(id),
    onSuccess: (_, variables) => {
      const expense = expenses?.find(e => e.id === variables);
      notifyToast(`Rejected ${expense?.description || 'Expense'}. Logic recalculated.`);
      queryClient.invalidateQueries({ queryKey: ['expenses', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
    }
  });

  const handleAction = (id: string, type: 'approve' | 'reject') => setConfirmAction({ id, type });
  const executeAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'approve') approveMutation.mutate(confirmAction.id);
    else rejectMutation.mutate(confirmAction.id);
    setConfirmAction(null);
  };

  if (isLoading) return <div className="p-8 text-zinc-400 text-sm">Loading expenses...</div>;
  if (!expenses || expenses.length === 0) return (
    <div className="py-12">
      <p className="text-zinc-500 font-medium text-sm">No pending expenses to audit.</p>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <AnimatePresence mode="popLayout">
        {expenses.map(expense => {
          const isConfirming = confirmAction?.id === expense.id;
          const isProcessing = approveMutation.isPending || rejectMutation.isPending;

          return (
            <motion.div
              layout
              key={expense.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="border-b border-zinc-100 pb-6 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div>
                  <h4 className="font-bold text-zinc-900 text-sm">{expense.description}</h4>
                  <p className="text-xs text-zinc-500 mt-1">Claimed by <span className="font-bold text-zinc-700">{expense.attendant_name}</span></p>
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-base font-mono font-bold text-zinc-900">{formatNaira(expense.amount)}</p>
                  <button className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-900 transition-colors">
                    View Receipt
                  </button>
                </div>

                {isConfirming ? (
                  <div className="flex bg-zinc-50 p-2 border border-zinc-200 items-center justify-between min-w-[200px]">
                    <span className="text-xs font-bold text-zinc-900 uppercase tracking-widest pl-2">Are you sure?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={executeAction}
                        disabled={isProcessing}
                        className={cn("text-xs font-bold px-3 py-1.5 text-white transition-colors", confirmAction.type === 'approve' ? "bg-zinc-900 hover:bg-zinc-800" : "bg-red-600 hover:bg-red-700")}
                      >
                        {isProcessing ? "Processing..." : confirmAction.type === 'approve' ? "Yes" : "Yes"}
                      </button>
                      <button onClick={() => setConfirmAction(null)} disabled={isProcessing} className="text-zinc-500 hover:text-zinc-900 font-bold text-xs px-2">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAction(expense.id, 'approve')}
                      className="px-4 py-2 border border-zinc-200 text-zinc-900 font-bold text-xs hover:border-zinc-900 transition-colors hover:bg-zinc-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(expense.id, 'reject')}
                      className="px-4 py-2 text-zinc-500 hover:text-red-600 font-bold text-xs transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};


const CsvImporter = () => {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: api.getBranches
  });

  const uploadMutation = useMutation({
    mutationFn: api.uploadShiftDataBatch,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
      notifyToast(`Imported ${data.count} shift records successfully`);
      setFile(null);
      setPreview([]);
      setParsedData(null);
    },
    onError: (err: any) => {
      notifyToast(`Upload failed: ${err.message}`);
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedBranchId) {
      notifyToast('Please select a Target Branch before uploading.');
      return;
    }
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);

    const fileExt = selected.name.split('.').pop()?.toLowerCase();

    if (fileExt === 'csv') {
      Papa.parse(selected, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
          const mapped = results.data.map((r: any) => ({ ...r, branch_id: selectedBranchId }));
          setParsedData(mapped);
          setPreview(mapped.slice(0, 5));
        }
      });
    } else if (fileExt === 'xlsx' || fileExt === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        // ============================================================
        // SHEET 1: METRE — meter readings & sales data
        // ============================================================
        const metreSheetName = wb.SheetNames.find(n => n.toUpperCase().includes('METRE') || n.toUpperCase().includes('METER')) || wb.SheetNames[0];
        const metreSheet = wb.Sheets[metreSheetName];
        const metreRows = XLSX.utils.sheet_to_json(metreSheet, { header: 1 }) as any[][];
        const extractedData: any[] = [];
        let currentProduct = 'PMS';

        // Parse date + shift time from row 1 (e.g. "16/02/2026 MORNING SHIFT")
        let parsedShiftDate = '';
        let parsedShiftTime = 'Morning';
        if (metreRows[0]) {
          const headerText = metreRows[0].map((c: any) => String(c || '')).join(' ').toUpperCase();
          if (headerText.includes('EVENING')) parsedShiftTime = 'Evening';
          const dateMatch = headerText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (dateMatch) {
            parsedShiftDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
          }
        }

        let amountIdx = 8;
        let receiptIdx = 9;

        for (let r = 0; r < Math.min(metreRows.length, 30); r++) {
          if (!metreRows[r]) continue;
          const firstCol = String(metreRows[r][0] || '').toUpperCase().trim();
          if (firstCol === 'NAME') {
            const foundAmount = metreRows[r].findIndex((c: any) => String(c).toUpperCase().includes('AMOUNT'));
            const foundReceipt = metreRows[r].findIndex((c: any) => String(c).toUpperCase().includes('RECEIPT'));
            if (foundAmount !== -1) amountIdx = foundAmount;
            if (foundReceipt !== -1) receiptIdx = foundReceipt;
            break;
          }
        }

        for (let r = 0; r < metreRows.length; r++) {
          const row = metreRows[r];
          if (!row || row.length === 0) continue;
          const col0 = String(row[0] || '').trim();
          const col1 = String(row[1] || '').trim();

          if (col0.toUpperCase().includes('AGO') || col1.toUpperCase().includes('AGO')) { currentProduct = 'AGO'; continue; }
          if (col0.toUpperCase().includes('PMS') || col1.toUpperCase().includes('PMS')) { currentProduct = 'PMS'; continue; }
          if (!col0 || col0 === 'NAME' || col0 === 'TOTAL' || col0 === 'SUMMARY' || col0 === 'TANKS' || col0 === 'PMS' || col0.includes('AGO') || col0.includes('SHIFT') || col1 === '1ST DIPPING') continue;

          const amount = parseFloat(String(row[amountIdx] || '').replace(/,/g, ''));
          const receipt = parseFloat(String(row[receiptIdx] || '').replace(/,/g, ''));

          if (!isNaN(amount) && amount > 0) {
            extractedData.push({
              branch_id: selectedBranchId,
              attendant_name: col0,
              pump_product: `${currentProduct} - Pump ${col1 || '1'}`,
              expected_amount: amount,
              cash_remitted: !isNaN(receipt) ? receipt : 0,
              pos_remitted: 0,
              shift_date: parsedShiftDate,
              shift_time: parsedShiftTime
            });
          }
        }

        // ============================================================
        // SHEET 2: CASH ANALYSIS — denomination counts per attendant
        // Horizontal layout: each attendant = 3-column group
        // Row 0: shift time (MORNING / EVENING)
        // Row 1: Name | Pump # | Date
        // Rows 2-9: Denomination value | Count | Subtotal
        // Then: CASH total, Expense rows, POS row, TOTAL row
        // ============================================================
        const cashSheetName = wb.SheetNames.find(n => n.toUpperCase().includes('CASH'));
        const cashAnalysisEntries: any[] = [];

        if (cashSheetName) {
          const cashSheet = wb.Sheets[cashSheetName];
          const cashRows = XLSX.utils.sheet_to_json(cashSheet, { header: 1 }) as any[][];

          if (cashRows.length >= 2) {
            const headerRow = cashRows[1] || [];
            const attendantBlocks: { col: number; name: string; pump: string; date: string; shiftTime: string }[] = [];

            for (let c = 0; c < headerRow.length; c++) {
              const cellVal = String(headerRow[c] || '').trim();
              if (cellVal && isNaN(Number(cellVal)) && !cellVal.toUpperCase().includes('PUMP') && !cellVal.match(/^\d{1,2}[\/\-]/)) {
                const pumpStr = String(headerRow[c + 1] || '').trim();
                const dateStr = String(headerRow[c + 2] || '').trim();
                const timeStr = String((cashRows[0] || [])[c] || '').trim().toUpperCase();
                const pumpNum = pumpStr.replace(/[^0-9]/g, '') || '1';
                let blockDate = parsedShiftDate;
                const dMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                if (dMatch) blockDate = `${dMatch[3]}-${dMatch[2].padStart(2, '0')}-${dMatch[1].padStart(2, '0')}`;
                attendantBlocks.push({ col: c, name: cellVal, pump: pumpNum, date: blockDate, shiftTime: timeStr.includes('EVENING') ? 'Evening' : 'Morning' });
              }
            }

            const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5];

            for (const block of attendantBlocks) {
              const denomCounts: Record<number, number> = {};
              let totalCash = 0;
              const blockExpenses: { description: string; amount: number }[] = [];
              let posAmount = 0;

              for (let d = 0; d < DENOMS.length; d++) {
                const rowIdx = 2 + d;
                if (rowIdx >= cashRows.length) break;
                const countCell = cashRows[rowIdx]?.[block.col + 1];
                denomCounts[DENOMS[d]] = parseInt(String(countCell || '0').replace(/,/g, ''), 10) || 0;
              }

              for (let r = 2 + DENOMS.length; r < cashRows.length; r++) {
                const rawC0 = cashRows[r]?.[block.col];
                const rawC1 = cashRows[r]?.[block.col + 1];
                const rawC2 = cashRows[r]?.[block.col + 2];
                const c0 = String(rawC0 || '').trim().toUpperCase();
                const c1 = String(rawC1 || '').trim();
                const c1Up = c1.toUpperCase();
                const c2 = String(rawC2 || '').trim().toUpperCase();
                // Parse numbers — handle negatives from red-formatted Excel cells
                const c0Num = parseFloat(String(rawC0 || '0').replace(/[^0-9.-]/g, '')) || 0;
                const c1Num = parseFloat(String(rawC1 || '0').replace(/[^0-9.-]/g, '')) || 0;

                if (c0 === 'CASH' || c0.includes('CASH')) {
                  totalCash = c1Num || parseFloat(String(rawC2 || '0').replace(/[^0-9.-]/g, '')) || 0;
                } else if (c1Up.includes('POS') || c0.includes('POS') || c2.includes('POS')) {
                  // POS row: amount is in col0, label "POS" in col1 or col2
                  posAmount = Math.abs(c0Num) || Math.abs(c1Num) || 0;
                } else if (c0 === 'TOTAL' || c1Up === 'TOTAL' || c2.includes('TOTAL')) {
                  break;
                } else if (Math.abs(c0Num) > 0 && c1 && !c1.match(/^[\d,.]+$/) && c1Up !== 'CASH') {
                  // Expense row: amount in col0 (may be negative/red), description in col1
                  blockExpenses.push({ description: c1, amount: Math.abs(c0Num) });
                }
              }

              // Enrich the matching metre entry with POS
              const matchEntry = extractedData.find(e => e.attendant_name.toUpperCase() === block.name.toUpperCase());
              if (matchEntry) matchEntry.pos_remitted = posAmount;

              cashAnalysisEntries.push({
                branch_id: selectedBranchId,
                attendant_name: block.name,
                pump_number: parseInt(block.pump, 10) || 1,
                product_type: currentProduct,
                denominations: denomCounts,
                total_cash: totalCash || Object.entries(denomCounts).reduce((s, [d, c]) => s + Number(d) * c, 0),
                shift_date: block.date,
                shift_time: block.shiftTime,
                expenses: blockExpenses
              });
            }
          }
        }

        // Attach cash analysis entries for grouped upload
        (extractedData as any).__cashAnalysis = cashAnalysisEntries;

        setParsedData(extractedData);
        setPreview(extractedData.slice(0, 5));
      };
      reader.readAsBinaryString(selected);
    } else {
      notifyToast('Unsupported format. Please select CSV or Excel.');
      setFile(null);
    }
  };

  const executeImport = async () => {
    if (!parsedData || parsedData.length === 0) return;
    setIsProcessing(true);
    try {
      await uploadMutation.mutateAsync(parsedData);

      // Submit Cash Analysis entries from Sheet 2 if present
      const cashEntries = (parsedData as any).__cashAnalysis as any[] | undefined;
      if (cashEntries && cashEntries.length > 0) {
        let cashCount = 0;
        let expenseCount = 0;
        for (const entry of cashEntries) {
          try {
            await api.submitCashAnalysis({
              branch_id: entry.branch_id,
              attendant_name: entry.attendant_name,
              pump_number: entry.pump_number,
              product_type: entry.product_type,
              denominations: entry.denominations,
              total_cash: entry.total_cash,
              shift_date: entry.shift_date,
              shift_time: entry.shift_time
            });
            cashCount++;

            // Insert expenses from this attendant's block
            if (entry.expenses && entry.expenses.length > 0) {
              try {
                const result = await api.insertExpensesFromImport(
                  entry.branch_id, entry.attendant_name, entry.shift_date, entry.shift_time, entry.expenses
                );
                expenseCount += result.count;
              } catch (e) {
                console.error('Expense insert failed for', entry.attendant_name, e);
              }
            }
          } catch (e) {
            console.error('Cash analysis entry failed:', entry.attendant_name, e);
          }
        }
        const parts = [];
        if (cashCount > 0) parts.push(`${cashCount} cash analysis`);
        if (expenseCount > 0) parts.push(`${expenseCount} expenses`);
        if (parts.length > 0) notifyToast(`Sheet 2: imported ${parts.join(' + ')}.`);
      }
    } catch (e) {
      // uploadMutation handles its own error toast
    }
    setIsProcessing(false);
  };

  return (
    <div className="border border-zinc-200 bg-white p-8">
      <div className="mb-6">
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Target Branch</label>
        <select
          value={selectedBranchId}
          onChange={(e) => setSelectedBranchId(e.target.value)}
          className="w-full text-sm font-medium border border-zinc-200 outline-none focus:border-zinc-500 bg-[#FAFAFA] p-3 transition-colors text-zinc-900"
        >
          <option value="">-- Select a Target Branch to assign this Sheet to --</option>
          {branches?.map((b: any) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div className={`flex flex-col items-center justify-center p-12 border-2 border-dashed border-zinc-200 hover:border-zinc-400 transition-colors ${selectedBranchId ? 'bg-[#FAFAFA]' : 'bg-zinc-50 opacity-50'} relative overflow-hidden group`}>
        <input
          type="file"
          accept=".csv, .xlsx, .xls"
          onChange={handleFileUpload}
          disabled={!selectedBranchId}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
        />
        <UploadIcon size={32} className="text-zinc-300 group-hover:text-zinc-900 transition-colors mb-4" />
        <p className="font-bold text-sm text-zinc-900">{file ? file.name : 'Drag & Drop your Fari Shift Report (Excel)'}</p>
        <p className="text-xs text-zinc-500 mt-1">{file ? 'Ready for import preview' : 'We will automatically extract multiple shifts, products and attendants'}</p>
      </div>

      {preview.length > 0 && (
        <div className="mt-8">
          <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-900 mb-4">Extracted Data Preview</h4>
          <div className="border border-zinc-200 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  {Object.keys(preview[0]).filter(key => key !== 'branch_id').map((key) => (
                    <th key={key} className="py-2 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-200 bg-[#FAFAFA]">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {preview.map((row: any, i: number) => (
                  <tr key={i}>
                    {Object.keys(row).filter(key => key !== 'branch_id').map((key: string, j: number) => (
                      <td key={j} className="py-2 px-4 text-xs text-zinc-600 truncate max-w-[150px]">
                        {row[key] as React.ReactNode}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex justify-end gap-4">
            <button
              onClick={() => { setFile(null); setPreview([]); setParsedData(null); }}
              className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={executeImport}
              disabled={isProcessing}
              className="px-6 py-2 bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              {isProcessing && <Loader2 size={14} className="animate-spin" />}
              {isProcessing ? 'Injecting Data...' : 'Confirm Bulk Import'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main Application ---

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'settings' | 'expenses' | 'entry'>('overview');
  const [level, setLevel] = useState<'global' | 'branch'>('global');
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [historyRange, setHistoryRange] = useState(30);
  const [drillDown, setDrillDown] = useState<any>({ isOpen: false });

  // Interaction Fix: Reset visual stack when tab changes. Prevent ghosting.
  useEffect(() => {
    if (activeTab !== 'overview') {
      setLevel('global');
      setActiveBranchId(null);
    }
  }, [activeTab]);

  const { data: matrix, isLoading } = useQuery({
    queryKey: ['global_overview'],
    queryFn: () => api.getGlobalOverview(),
    refetchInterval: 10000
  });

  const { data: trendData } = useQuery({
    queryKey: ['stats', 'trend', historyRange],
    queryFn: () => api.getTrendData(historyRange)
  });

  const { data: historyReports, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['historical_reports', historyRange],
    queryFn: () => api.getHistoricalReports(historyRange),
    refetchInterval: 10000
  });

  const activeBranchData = useMemo(() => {
    if (!matrix || !activeBranchId) return null;
    return matrix.find(m => m.branch.id === activeBranchId);
  }, [matrix, activeBranchId]);

  const selectBranch = (id: string) => {
    setActiveBranchId(id);
    setLevel('branch');
  };

  const exportCsv = () => {
    if (!historyReports || historyReports.length === 0) return alert('No data to export');
    const csv = Papa.unparse(historyReports);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fari_cash_analysis_${historyRange}d.csv`;
    link.click();
  };

  const navigateToGlobal = () => {
    setLevel('global');
    setActiveBranchId(null);
  };

  if (isLoading) return <SkeletonLoader />;

  return (
    <div className="flex h-screen bg-white text-zinc-900 font-sans selection:bg-zinc-200 selection:text-zinc-900">
      <Toaster />

      {/* Centralized Drill Down Modal for Dashboard */}
      <AttendantModal
        isOpen={drillDown.isOpen}
        onClose={() => setDrillDown({ isOpen: false })}
        branchId={drillDown.branchId}
        attendantName={drillDown.attendantName}
        shiftDate={drillDown.shiftDate}
        shiftTime={drillDown.shiftTime}
      />

      {/* Restrained Sidebar */}
      <aside className="w-56 bg-[#FAFAFA] border-r border-zinc-200 p-6 flex flex-col shrink-0 z-30">
        <div className="mb-10 px-2 opacity-80">
          <h1 className="text-xl font-black tracking-tight">FuelTrack.</h1>
        </div>

        <nav className="space-y-1 flex-1">
          <SidebarItem icon={LayoutDashboard} label="Live Shift" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarItem icon={FileEdit} label="Manual Entry" active={activeTab === 'entry'} onClick={() => setActiveTab('entry')} />

          <SidebarItem icon={History} label="Historical Reports" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <SidebarItem icon={Receipt} label="Expense Audit" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
          <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-200">
          <div className="flex items-center gap-3 px-2 mb-6">
            <div className="w-8 h-8 rounded bg-zinc-200 overflow-hidden grayscale">
              <img src="https://picsum.photos/seed/gm/100/100" alt="GM" referrerPolicy="no-referrer" />
            </div>
            <div>
              <p className="text-xs font-bold">Adebayo O.</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Admin</p>
            </div>
          </div>
          <button className="flex items-center gap-3 w-full px-2 text-zinc-400 hover:text-zinc-900 transition-colors font-bold text-xs uppercase tracking-widest">
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">

        {/* Subtle Utilities Header */}
        <header className="h-14 border-b border-zinc-200 bg-white px-8 flex items-center justify-between shrink-0">
          <div className="flex gap-4">
            <div className="relative">
              <Search size={14} className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type="text" placeholder="Search data..." className="bg-transparent pl-6 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none w-48" />
            </div>
          </div>
          <button className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 transition-colors">Close Shift</button>
        </header>

        {activeTab === 'overview' && <GlobalTracker matrix={matrix || []} navigateToLevel={navigateToGlobal} />}

        <main className="flex-1 overflow-y-auto">
          <div className={cn("px-8 pb-12", activeTab !== 'overview' && "pt-12 max-w-6xl mx-auto")}>
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div
                  key="overview-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {level === 'global' && <BranchOverviewMatrix matrix={matrix || []} setActiveBranch={selectBranch} />}
                  {level === 'branch' && activeBranchData && <ActiveShiftLedger branchData={activeBranchData} navigateBack={navigateToGlobal} />}
                </motion.div>
              )}

              {activeTab === 'expenses' && (
                <motion.div
                  key="expenses-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="mb-10">
                    <h3 className="text-2xl font-black tracking-tight mb-2">Expense Audit</h3>
                    <p className="text-zinc-500 text-sm">Review standard expenses isolated from the live ledger math.</p>
                  </div>
                  <ExpenseAudit />
                </motion.div>
              )}

              {activeTab === 'history' && (
                <motion.div
                  key="history-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="flex items-center justify-between mb-10">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight mb-2">Historical Reports</h3>
                      <p className="text-zinc-500 text-sm">Variance records and finalized audits across all branches.</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex border border-zinc-200 rounded">
                        {[30, 60, 90].map((range) => (
                          <button
                            key={range}
                            onClick={() => setHistoryRange(range)}
                            className={cn(
                              "px-4 py-2 text-xs font-bold transition-colors",
                              historyRange === range ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                            )}
                          >
                            {range}D
                          </button>
                        ))}
                      </div>
                      <button onClick={exportCsv} className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors">Export CSV</button>
                    </div>
                  </div>

                  {/* Stripped down Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12">
                    <div>
                      <h4 className="font-bold text-sm text-zinc-900 mb-6 uppercase tracking-widest">{historyRange}-DAY VARIANCE TREND</h4>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#FAFAFA" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A1A1AA' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A1A1AA' }} />
                            <Tooltip cursor={{ stroke: '#F4F4F5' }} contentStyle={{ borderRadius: '0', border: '1px solid #E4E4E7', boxShadow: 'none' }} formatter={(value: number) => [formatNaira(value), 'Variance']} />
                            <Line type="monotone" dataKey="variance" stroke="#18181A" strokeWidth={2} dot={{ r: 3, fill: '#18181A', strokeWidth: 0 }} activeDot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-zinc-900 mb-6 uppercase tracking-widest">POS Claimed vs Actual</h4>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={trendData || []}>
                            <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#FAFAFA" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A1A1AA' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A1A1AA' }} />
                            <Tooltip cursor={{ fill: '#FAFAFA' }} contentStyle={{ borderRadius: '0', border: '1px solid #E4E4E7', boxShadow: 'none' }} />
                            <Bar dataKey="claimed" fill="#E4E4E7" radius={0} />
                            <Bar dataKey="actual" fill="#18181A" radius={0} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-zinc-200 mt-8">
                    <h4 className="font-bold text-sm text-zinc-900 mb-4 px-2 uppercase tracking-widest mt-6">Latest Cash Analysis Reports</h4>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-200">Date & Time</th>
                          <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-200">Branch</th>
                          <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-200">Attendant & Pump</th>
                          <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-200 text-right">Total Cash Verified</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {isHistoryLoading ? (
                          <tr><td colSpan={4} className="text-center py-8 text-sm text-zinc-500">Loading reports...</td></tr>
                        ) : (historyReports || []).length === 0 ? (
                          <tr><td colSpan={4} className="text-center py-8 text-sm text-zinc-500">No Historical Cash Reports Found</td></tr>
                        ) : (historyReports || []).map((row: any, i: number) => (
                          <tr
                            key={i}
                            onClick={() => {
                              if (row.branch_id) {
                                setDrillDown({
                                  isOpen: true,
                                  attendantName: row.attendant,
                                  branchId: row.branch_id,
                                  shiftDate: row.shift_date,
                                  shiftTime: row.shift_time
                                });
                              }
                            }}
                            className="cursor-pointer hover:bg-zinc-50 transition-colors group"
                          >
                            <td className="py-4 whitespace-nowrap group-hover:pl-2 transition-all">
                              <div className="text-sm font-bold text-zinc-900">{new Date(row.shift_date || row.created_at).toLocaleDateString()}</div>
                              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{row.shift_time || 'Morning'}</div>
                            </td>
                            <td className="py-4 text-sm font-bold text-zinc-900">{row.branch}</td>
                            <td className="py-4 text-sm">
                              <div className="font-bold text-zinc-900">{row.attendant}</div>
                              <div className="text-xs text-zinc-500">{row.product}</div>
                            </td>
                            <td className="py-4 text-sm font-mono text-zinc-900 font-bold text-right">{formatNaira(row.total_cash)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {activeTab === 'entry' && (
                <motion.div
                  key="entry-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <ManualDataEntry />
                </motion.div>
              )}



              {activeTab === 'settings' && (
                <motion.div
                  key="settings-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="mb-10">
                    <h3 className="text-2xl font-black tracking-tight mb-2">System Settings</h3>
                    <p className="text-zinc-500 text-sm">Configure operational thresholds and branch metadata.</p>
                  </div>

                  <div className="max-w-4xl space-y-12">
                    <section>
                      <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 border-b border-zinc-200 pb-2">Mass Data Injection</h4>
                      <CsvImporter />
                    </section>

                    <section>
                      <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 border-b border-zinc-200 pb-2">Variance Thresholds</h4>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-zinc-900">Critical Shortage Alert</p>
                            <p className="text-xs text-zinc-500 mt-1">Flag shifts with variance exceeding this amount.</p>
                          </div>
                          <input type="text" defaultValue="₦10,000" className="bg-transparent border-b border-zinc-200 py-1 text-sm font-mono w-32 text-right focus:outline-none focus:border-zinc-900" />
                        </div>
                      </div>
                    </section>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
