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
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);

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

  const deleteIndividualMutation = useMutation({
    mutationFn: (id: string) => api.deleteIndividualShiftRecord(id),
    onSuccess: () => {
      notifyToast("Record deleted successfully.");
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
      setDeletingRowId(null);
    },
    onError: (err: any) => notifyToast(`Delete failed: ${err.message}`)
  });

  const deleteBulkMutation = useMutation({
    mutationFn: (ids: string[]) => api.deleteMultipleShiftRecords(ids),
    onSuccess: (_, variables) => {
      notifyToast(`Deleted ${variables.length} records successfully.`);
      queryClient.invalidateQueries({ queryKey: ['global_overview'] });
      setSelectedRows(new Set());
      setIsDeletingBulk(false);
    },
    onError: (err: any) => notifyToast(`Bulk delete failed: ${err.message}`)
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

  const toggleRowSelect = (id: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const toggleAllRows = () => {
    if (selectedRows.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredItems.map((item: any) => item.id)));
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 focus:ring-offset-0 cursor-pointer"
          checked={selectedRows.size === filteredItems.length && filteredItems.length > 0}
          onChange={toggleAllRows}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 focus:ring-offset-0 cursor-pointer"
          checked={selectedRows.has(row.original.id)}
          onChange={() => toggleRowSelect(row.original.id)}
        />
      ),
    },
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
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => startEditing(row)}
              className="p-1 text-zinc-300 hover:text-zinc-900 transition-colors"
              title="Edit Record"
            >
              <FileEdit size={14} />
            </button>

            {deletingRowId === row.id ? (
              <div className="flex items-center gap-1 bg-red-50/50 border border-red-100 px-2 py-0.5 rounded-sm h-6">
                <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest px-1 hidden md:inline">Del?</span>
                <button
                  onClick={() => deleteIndividualMutation.mutate(row.id)}
                  disabled={deleteIndividualMutation.isPending}
                  className="text-[9px] font-bold bg-red-600 text-white px-2 h-full hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setDeletingRowId(null)}
                  disabled={deleteIndividualMutation.isPending}
                  className="text-zinc-500 hover:text-zinc-900 transition-colors h-full px-1"
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeletingRowId(row.id)}
                className="p-1 text-zinc-300 hover:text-red-600 transition-colors"
                title="Delete Record"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      }
    }
  ], [editingRowId, editForm, isSaving, selectedRows, filteredItems, deletingRowId]);

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
              <div className="flex items-center gap-4">
                <AnimatePresence>
                  {selectedRows.size > 0 && (
                    isDeletingBulk ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center gap-3 bg-red-50/50 border border-red-100 px-3 py-1.5 rounded-sm"
                      >
                        <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest hidden md:inline">Delete {selectedRows.size} Selected?</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteBulkMutation.mutate(Array.from(selectedRows))}
                            disabled={deleteBulkMutation.isPending}
                            className="text-[10px] font-bold bg-red-600 text-white px-3 py-1 hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                          >
                            {deleteBulkMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                          </button>
                          <button
                            onClick={() => setIsDeletingBulk(false)}
                            disabled={deleteBulkMutation.isPending}
                            className="text-[10px] font-bold text-zinc-500 hover:text-zinc-900 px-3 py-1 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => setIsDeletingBulk(true)}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-red-600 transition-colors group"
                        title={`Delete ${selectedRows.size} Selected`}
                      >
                        <Trash2 size={14} className="group-hover:scale-110 transition-transform" /> Delete {selectedRows.size} Selected
                      </motion.button>
                    )
                  )}
                </AnimatePresence>
                <button
                  onClick={() => setIsDeleting(true)}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-red-600 transition-colors group"
                  title="Clear Station Ledger"
                >
                  <Trash2 size={14} className="group-hover:scale-110 transition-transform" /> Clear Station
                </button>
              </div>
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
                      <button onClick={exportCsv} className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors">Export CSV</button>
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
