import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import * as api from './lib/api';
import {
  LayoutDashboard,
  History,
  Receipt,
  Settings,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  LogOut,
  Menu,
  X,
  Eye,
  Check,
  Ban
} from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
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

// --- Types ---
interface ShiftData {
  id: string;
  shift_id: string;
  attendant_id: string;
  attendant_name: string;
  pump_product: string;
  opening_meter: number;
  closing_meter: number;
  expected_liters: number;
  expected_amount: number;
  cash_remitted: number;
  pos_remitted: number;
  expenses_total: number;
  variance: number;
}

interface Expense {
  id: string;
  shift_data_id: string;
  description: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  attendant_name: string;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all duration-200",
      active
        ? "bg-black text-white shadow-lg shadow-black/10"
        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    )}
  >
    <Icon size={20} />
    <span className="font-medium text-sm">{label}</span>
  </button>
);

const StatCard = ({ title, value, subValue, trend, type = 'neutral' }: { title: string, value: string, subValue?: string, trend?: number, type?: 'neutral' | 'danger' | 'success' }) => (
  <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm">
    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">{title}</p>
    <div className="flex items-end justify-between">
      <div>
        <h3 className={cn(
          "text-2xl font-bold tracking-tight",
          type === 'danger' ? "text-red-600" : type === 'success' ? "text-emerald-600" : "text-zinc-900"
        )}>
          {value}
        </h3>
        {subValue && <p className="text-sm text-zinc-500 mt-1">{subValue}</p>}
      </div>
      {trend !== undefined && (
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold",
          trend >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
        )}>
          {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  </div>
);

const ReconciliationTable = ({ data }: { data: ShiftData[] }) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filterShortages, setFilterShortages] = useState(false);

  const filteredData = useMemo(() => {
    if (filterShortages) return data.filter(d => d.variance < 0);
    return data;
  }, [data, filterShortages]);

  const columns = useMemo<ColumnDef<ShiftData>[]>(() => [
    {
      accessorKey: 'attendant_name',
      header: 'Attendant',
      cell: info => <span className="font-semibold text-zinc-900">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'pump_product',
      header: 'Product',
      cell: info => <span className="text-xs font-bold px-2 py-1 bg-zinc-100 rounded text-zinc-600">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'expected_amount',
      header: 'Expected (₦)',
      cell: info => <span className="font-mono text-sm">{formatNaira(info.getValue() as number)}</span>,
    },
    {
      accessorKey: 'cash_remitted',
      header: 'Cash (₦)',
      cell: info => <span className="font-mono text-sm">{formatNaira(info.getValue() as number)}</span>,
    },
    {
      accessorKey: 'pos_remitted',
      header: 'POS (₦)',
      cell: info => <span className="font-mono text-sm">{formatNaira(info.getValue() as number)}</span>,
    },
    {
      accessorKey: 'expenses_total',
      header: 'Expenses (₦)',
      cell: info => <span className="font-mono text-sm text-zinc-500">{formatNaira(info.getValue() as number)}</span>,
    },
    {
      accessorKey: 'variance',
      header: 'Variance (₦)',
      cell: info => {
        const val = info.getValue() as number;
        return (
          <div className={cn(
            "flex items-center gap-2 font-bold font-mono",
            val < 0 ? "text-red-600" : val > 0 ? "text-emerald-600" : "text-zinc-400"
          )}>
            {val < 0 ? <AlertCircle size={14} /> : val === 0 ? <CheckCircle2 size={14} /> : null}
            {formatNaira(val)}
          </div>
        );
      },
    },
  ], []);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
        <h3 className="font-bold text-zinc-900">Attendant Reconciliation Matrix</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterShortages(!filterShortages)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              filterShortages
                ? "bg-red-600 text-white"
                : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Filter size={14} />
            {filterShortages ? "Showing Shortages" : "Filter Shortages"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-zinc-100">
                {headerGroup.headers.map(header => (
                  <th key={header.id} className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    {header.isPlaceholder ? null : (
                      <div
                        {...{
                          className: header.column.getCanSort() ? 'cursor-pointer select-none flex items-center gap-1' : '',
                          onClick: header.column.getToggleSortingHandler(),
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: ' ↑',
                          desc: ' ↓',
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-6 py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ExpenseAudit = () => {
  const queryClient = useQueryClient();
  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', 'pending'],
    queryFn: () => api.getPendingExpenses()
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveExpense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses', 'pending'] })
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectExpense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses', 'pending'] })
  });

  if (isLoading) return <div className="p-8 text-center text-zinc-400">Loading expenses...</div>;
  if (!expenses || expenses.length === 0) return (
    <div className="p-12 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
      <Receipt className="mx-auto text-zinc-300 mb-3" size={32} />
      <p className="text-zinc-500 font-medium">No pending expenses to audit.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {expenses.map(expense => (
        <motion.div
          layout
          key={expense.id}
          className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-500">
              <Receipt size={24} />
            </div>
            <div>
              <h4 className="font-bold text-zinc-900">{expense.description}</h4>
              <p className="text-xs text-zinc-500">Claimed by <span className="font-bold text-zinc-700">{expense.attendant_name}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-lg font-bold text-zinc-900">{formatNaira(expense.amount)}</p>
              <button className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1 hover:underline">
                <Eye size={10} /> View Receipt
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => approveMutation.mutate(expense.id)}
                className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Check size={20} />
              </button>
              <button
                onClick={() => rejectMutation.mutate(expense.id)}
                className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Ban size={20} />
              </button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

const Dashboard = () => {
  const [activeBranch, setActiveBranch] = useState('br-yola');
  const [activeTab, setActiveTab] = useState('overview');
  const [historyRange, setHistoryRange] = useState(30);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.getBranches()
  });

  const { data: shiftData, isLoading: shiftLoading } = useQuery<{ shift: any, data: ShiftData[] }>({
    queryKey: ['shift', activeBranch],
    queryFn: () => api.getActiveShift(activeBranch),
    refetchInterval: 30000 // Poll every 30s
  });

  const { data: trendData } = useQuery({
    queryKey: ['stats', 'trend'],
    queryFn: () => api.getTrendData()
  });

  const totals = useMemo(() => {
    if (!shiftData?.data) return { revenue: 0, pos: 0, variance: 0 };
    return shiftData.data.reduce((acc, curr) => ({
      revenue: acc.revenue + curr.expected_amount,
      pos: acc.pos + curr.pos_remitted,
      variance: acc.variance + curr.variance
    }), { revenue: 0, pos: 0, variance: 0 });
  }, [shiftData]);

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-200 bg-white p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-black italic">F</div>
          <h1 className="text-xl font-black tracking-tight">FuelTrack.</h1>
        </div>

        <nav className="space-y-1 flex-1">
          <SidebarItem icon={LayoutDashboard} label="Live Shift" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarItem icon={History} label="Historical Reports" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <SidebarItem icon={Receipt} label="Expense Audit" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
          <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-100">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center overflow-hidden">
              <img src="https://picsum.photos/seed/gm/100/100" alt="GM" referrerPolicy="no-referrer" />
            </div>
            <div>
              <p className="text-sm font-bold">Adebayo O.</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">General Manager</p>
            </div>
          </div>
          <button className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-colors font-bold text-sm">
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="h-20 border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold">Shift Reconciliation</h2>
            <div className="h-4 w-px bg-zinc-200 mx-2" />
            <div className="relative">
              <select
                value={activeBranch}
                onChange={(e) => setActiveBranch(e.target.value)}
                className="appearance-none bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 pr-10 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5 cursor-pointer"
              >
                {branches?.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search transactions..."
                className="bg-zinc-50 border border-zinc-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 w-64"
              />
            </div>
            <button className="bg-black text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10">
              Close Shift
            </button>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* KPI Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard
                    title="Total Shift Revenue"
                    value={formatNaira(totals.revenue)}
                    subValue="Expected from meters"
                    trend={12}
                  />
                  <StatCard
                    title="POS Settlements"
                    value={formatNaira(totals.pos)}
                    subValue="Claimed by attendants"
                    trend={-2}
                  />
                  <StatCard
                    title="Net True Variance"
                    value={formatNaira(totals.variance)}
                    subValue="Cash shortage/excess"
                    type={totals.variance < 0 ? 'danger' : totals.variance > 0 ? 'success' : 'neutral'}
                  />
                </div>

                {/* Main Table Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black tracking-tight">Active Reconciliation</h3>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Last synced: Just now</p>
                  </div>
                  {shiftLoading ? (
                    <div className="h-64 bg-white rounded-2xl border border-zinc-100 animate-pulse" />
                  ) : (
                    <ReconciliationTable data={shiftData?.data || []} />
                  )}
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm">
                    <h4 className="font-bold mb-6 text-zinc-900">7-Day Variance Trend</h4>
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A1A1AA' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A1A1AA' }} />
                          <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number) => [formatNaira(value), 'Variance']}
                          />
                          <Line type="monotone" dataKey="variance" stroke="#EF4444" strokeWidth={3} dot={{ r: 4, fill: '#EF4444', strokeWidth: 2, stroke: '#FFF' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm">
                    <h4 className="font-bold mb-6 text-zinc-900">POS Claimed vs Bank Actual</h4>
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: 'Mon', claimed: 450000, actual: 445000 },
                          { name: 'Tue', claimed: 320000, actual: 320000 },
                          { name: 'Wed', claimed: 510000, actual: 490000 },
                          { name: 'Thu', claimed: 280000, actual: 280000 },
                          { name: 'Fri', claimed: 620000, actual: 615000 },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A1A1AA' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#A1A1AA' }} />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                          <Bar dataKey="claimed" fill="#E4E4E7" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="actual" fill="#000" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'expenses' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Expense Audit</h3>
                    <p className="text-zinc-500 text-sm">Review and approve petty cash claims for the current shift.</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold">
                    <AlertCircle size={14} />
                    {totals.variance < 0 ? "High Variance Detected" : "Shift Healthy"}
                  </div>
                </div>
                <ExpenseAudit />
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Historical Reports</h3>
                    <p className="text-zinc-500 text-sm">Review performance and variance trends across all branches.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200">
                      {[30, 60, 90].map((range) => (
                        <button
                          key={range}
                          onClick={() => setHistoryRange(range)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                            historyRange === range
                              ? "bg-white text-black shadow-sm"
                              : "text-zinc-500 hover:text-zinc-900"
                          )}
                        >
                          {range} Days
                        </button>
                      ))}
                    </div>
                    <button className="px-4 py-2 bg-black text-white rounded-lg text-sm font-bold hover:bg-zinc-800 transition-colors">Export PDF</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Avg. Daily Revenue', value: historyRange === 30 ? '₦4.2M' : historyRange === 60 ? '₦4.5M' : '₦4.8M', trend: historyRange === 30 ? 5 : historyRange === 60 ? 7 : 10 },
                    { label: 'Avg. Daily Variance', value: historyRange === 30 ? '-₦12.5k' : historyRange === 60 ? '-₦10.2k' : '-₦8.4k', trend: -2, danger: true },
                    { label: 'Total POS Volume', value: historyRange === 30 ? '₦28.4M' : historyRange === 60 ? '₦58.2M' : '₦92.1M', trend: 8 },
                    { label: 'Audit Score', value: historyRange === 30 ? '94%' : historyRange === 60 ? '92%' : '95%', trend: 1 },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-zinc-100 shadow-sm">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{stat.label}</p>
                      <div className="flex items-center justify-between">
                        <span className={cn("text-lg font-bold", stat.danger ? "text-red-600" : "text-zinc-900")}>{stat.value}</span>
                        <span className={cn("text-[10px] font-bold", stat.trend >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {stat.trend > 0 ? '+' : ''}{stat.trend}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-zinc-50/50">
                      <tr className="border-b border-zinc-100">
                        <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Branch</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Sales</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Variance</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { date: 'Feb 20, 2024', branch: 'Yola Main', sales: '₦3,450,000', var: '-₦4,500', status: 'Audited' },
                        { date: 'Feb 20, 2024', branch: 'Gombi Station', sales: '₦1,200,000', var: '₦0', status: 'Audited' },
                        { date: 'Feb 19, 2024', branch: 'Kebbi North', sales: '₦2,800,000', var: '-₦12,000', status: 'Flagged' },
                        { date: 'Feb 19, 2024', branch: 'Jigawa Central', sales: '₦4,100,000', var: '₦2,500', status: 'Audited' },
                        { date: 'Feb 18, 2024', branch: 'Yola Main', sales: '₦3,100,000', var: '-₦1,200', status: 'Audited' },
                        ...(historyRange >= 60 ? [
                          { date: 'Jan 15, 2024', branch: 'Yola Main', sales: '₦3,200,000', var: '-₦2,500', status: 'Audited' },
                          { date: 'Jan 14, 2024', branch: 'Kebbi North', sales: '₦2,950,000', var: '-₦8,000', status: 'Audited' },
                        ] : []),
                        ...(historyRange >= 90 ? [
                          { date: 'Dec 12, 2023', branch: 'Gombi Station', sales: '₦1,150,000', var: '₦0', status: 'Audited' },
                          { date: 'Dec 10, 2023', branch: 'Jigawa Central', sales: '₦4,300,000', var: '-₦15,000', status: 'Flagged' },
                        ] : []),
                      ].map((row, i) => (
                        <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-zinc-600">{row.date}</td>
                          <td className="px-6 py-4 text-sm font-bold text-zinc-900">{row.branch}</td>
                          <td className="px-6 py-4 text-sm font-mono">{row.sales}</td>
                          <td className={cn("px-6 py-4 text-sm font-mono font-bold", row.var.startsWith('-') ? "text-red-600" : row.var === '₦0' ? "text-zinc-400" : "text-emerald-600")}>{row.var}</td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
                              row.status === 'Audited' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                            )}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl space-y-8"
              >
                <div>
                  <h3 className="text-2xl font-black tracking-tight">System Settings</h3>
                  <p className="text-zinc-500 text-sm">Configure operational thresholds and branch metadata.</p>
                </div>

                <div className="space-y-6">
                  <section className="space-y-4">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Variance Thresholds</h4>
                    <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">Critical Shortage Alert</p>
                          <p className="text-xs text-zinc-500">Flag shifts with variance exceeding this amount.</p>
                        </div>
                        <input type="text" defaultValue="₦10,000" className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono w-32 text-right" />
                      </div>
                      <div className="h-px bg-zinc-100" />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">Auto-Audit Tolerance</p>
                          <p className="text-xs text-zinc-500">Automatically mark shifts as audited if variance is below this.</p>
                        </div>
                        <input type="text" defaultValue="₦500" className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono w-32 text-right" />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Branch Management</h4>
                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm divide-y divide-zinc-100">
                      {['Yola Main', 'Gombi Station', 'Jigawa Central', 'Kebbi North'].map((branch) => (
                        <div key={branch} className="p-4 flex items-center justify-between">
                          <span className="text-sm font-bold">{branch}</span>
                          <button className="text-xs font-bold text-indigo-600 hover:underline">Edit Config</button>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="flex justify-end gap-3">
                    <button className="px-6 py-2 bg-zinc-100 text-zinc-600 rounded-lg text-sm font-bold hover:bg-zinc-200 transition-colors">Discard Changes</button>
                    <button className="px-6 py-2 bg-black text-white rounded-lg text-sm font-bold hover:bg-zinc-800 transition-colors">Save Settings</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
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
