'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, PieChart, TrendingUp, FileText, Target, FileDown, Printer, Calendar, Filter, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import {
  generateCSV,
  getAccounts,
  getReportData,
  loadAccountInclusionMap,
  isPersonalExpenseTransaction,
  isPersonalIncomeTransaction,
  loadTransactionLedgerSummaryMap,
  shouldIncludeInPersonalCashFlow,
  type FinancialAccount,
  type Transaction,
} from '@/lib/finance';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';


const IncomeExpenseReportChart = dynamic(() => import('./charts/IncomeExpenseReportChart'), { ssr: false });
const SpendingCategoryReportChart = dynamic(() => import('./charts/SpendingCategoryReportChart'), { ssr: false });
const MonthlyTrendsChart = dynamic(() => import('./charts/MonthlyTrendsChart'), { ssr: false });
const BudgetPerformanceChart = dynamic(() => import('./charts/BudgetPerformanceChart'), { ssr: false });

type ReportType = 'income-expense' | 'spending-category' | 'monthly-trends' | 'budget-performance' | 'account-statement';

const reportTypes = [
  { id: 'income-expense' as ReportType, label: 'Income vs Expenses', icon: TrendingUp, description: 'Compare monthly inflows and outflows' },
  { id: 'spending-category' as ReportType, label: 'Spending by Category', icon: PieChart, description: 'Where your money is going' },
  { id: 'monthly-trends' as ReportType, label: 'Monthly Trends', icon: BarChart3, description: 'Spending patterns over time' },
  { id: 'budget-performance' as ReportType, label: 'Budget Performance', icon: Target, description: 'How well you stuck to your budgets' },
  { id: 'account-statement' as ReportType, label: 'Account Statement', icon: FileText, description: 'Full transaction history by account' },
];

export default function ReportsScreen() {
  const [activeReport, setActiveReport] = useState<ReportType>('income-expense');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [ledgerSummaryByTransactionId, setLedgerSummaryByTransactionId] = useState<Map<string, { entryTypes: Set<string>; referenceTypes: Set<string> }>>(new Map());
  const [accountInclusionById, setAccountInclusionById] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      getReportData(dateFrom, dateTo, selectedAccount),
      getAccounts(),
      loadTransactionLedgerSummaryMap(supabase),
      loadAccountInclusionMap(supabase),
    ])
      .then(([txns, accts, ledgerSummary, accountInclusion]) => {
        setTransactions(txns);
        setAccounts(accts.filter((a) => a.is_active));
        setLedgerSummaryByTransactionId(ledgerSummary);
        setAccountInclusionById(accountInclusion);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, selectedAccount]);

  useEffect(() => { load(); }, [load]);

  const income = transactions
    .filter((t) => isPersonalIncomeTransaction(t, ledgerSummaryByTransactionId, accountInclusionById))
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenses = transactions
    .filter((t) => isPersonalExpenseTransaction(t, ledgerSummaryByTransactionId, accountInclusionById))
    .reduce((s, t) => s + Number(t.amount), 0);
  const net = transactions.reduce((sum, transaction) => {
    if (!shouldIncludeInPersonalCashFlow(transaction, ledgerSummaryByTransactionId, accountInclusionById)) {
      return sum;
    }
    const amount = Number(transaction.amount || 0);
    return transaction.transaction_type === 'income' ? sum + amount : transaction.transaction_type === 'expense' ? sum - amount : sum;
  }, 0);
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  const summaryByType: Record<ReportType, Array<{ id: string; label: string; value: string; sub?: string; positive?: boolean }>> = {
    'income-expense': [
      { id: 'rpt-ie-income', label: 'Total Income', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(income), sub: `${dateFrom} – ${dateTo}`, positive: true },
      { id: 'rpt-ie-expenses', label: 'Total Expenses', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(expenses), sub: `${dateFrom} – ${dateTo}`, positive: false },
      { id: 'rpt-ie-net', label: 'Net Savings', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(net), sub: `${savingsRate.toFixed(1)}% savings rate`, positive: net >= 0 },
      { id: 'rpt-ie-txns', label: 'Transactions', value: String(transactions.length), sub: 'Total records' },
    ],
    'spending-category': [
      { id: 'rpt-sc-total', label: 'Total Spent', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(expenses), sub: 'All categories' },
      { id: 'rpt-sc-txns', label: 'Expense Transactions', value: String(transactions.filter((t) => isPersonalExpenseTransaction(t, ledgerSummaryByTransactionId, accountInclusionById)).length), sub: 'Records' },
      { id: 'rpt-sc-income', label: 'Total Income', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(income), positive: true },
      { id: 'rpt-sc-net', label: 'Net', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(net), positive: net >= 0 },
    ],
    'monthly-trends': [
      { id: 'rpt-mt-income', label: 'Period Income', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(income), positive: true },
      { id: 'rpt-mt-expenses', label: 'Period Expenses', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(expenses), positive: false },
      { id: 'rpt-mt-net', label: 'Net', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(net), positive: net >= 0 },
      { id: 'rpt-mt-txns', label: 'Transactions', value: String(transactions.length) },
    ],
    'budget-performance': [
      { id: 'rpt-bp-income', label: 'Total Income', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(income), positive: true },
      { id: 'rpt-bp-expenses', label: 'Total Expenses', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(expenses), positive: false },
      { id: 'rpt-bp-net', label: 'Net Savings', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(net), positive: net >= 0 },
      { id: 'rpt-bp-rate', label: 'Savings Rate', value: `${savingsRate.toFixed(1)}%`, positive: savingsRate >= 20 },
    ],
    'account-statement': [
      { id: 'rpt-as-txns', label: 'Total Transactions', value: String(transactions.length), sub: `${dateFrom} – ${dateTo}` },
      { id: 'rpt-as-credits', label: 'Total Credits', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(income), sub: 'Inflows', positive: true },
      { id: 'rpt-as-debits', label: 'Total Debits', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(expenses), sub: 'Outflows', positive: false },
      { id: 'rpt-as-net', label: 'Net', value: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(net), positive: net >= 0 },
    ],
  };

  const summary = summaryByType[activeReport];

  const handleDownloadCSV = () => {
    if (transactions.length === 0) { toast.error('No data to export'); return; }
    const csv = generateCSV(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-pocket-report-${dateFrom}-${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV exported — ${transactions.length} transactions`);
  };

  const handlePrint = () => window.print();

  const setPreset = (preset: string) => {
    const now = new Date();
    if (preset === 'this-month') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else if (preset === 'last-month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(first.toISOString().slice(0, 10));
      setDateTo(last.toISOString().slice(0, 10));
    } else if (preset === 'last-30') {
      setDateFrom(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else if (preset === 'ytd') {
      setDateFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    }
  };

  return (
    <div className="page-section">
      <PageHeader
        title="Reports"
        description="Analyze financial patterns, compare periods, and export statements."
        badge={<StatusBadge status="info" label="Analytics" />}
        actions={
          <>
            <button onClick={handlePrint} className="btn-secondary">
              <Printer size={14} />
              <span className="hidden sm:inline">Print / Save as PDF</span>
            </button>
            <button onClick={handleDownloadCSV} className="btn-secondary">
              <FileDown size={14} /> CSV
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Left: Report Type Selector */}
        <div className="xl:col-span-1 space-y-2">
          <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground px-1 mb-3">Report Type</p>
          {reportTypes.map((rt) => {
            const Icon = rt.icon;
            return (
              <button
                key={`report-type-${rt.id}`}
                onClick={() => setActiveReport(rt.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all duration-150 text-left ${
                  activeReport === rt.id ? 'border-accent bg-accent/8 shadow-sm' : 'border-border bg-card hover:border-accent/40 hover:bg-muted/40'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${activeReport === rt.id ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <Icon size={15} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-600 truncate ${activeReport === rt.id ? 'text-accent' : 'text-foreground'}`}>{rt.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{rt.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Report Content */}
        <div className="xl:col-span-3 space-y-4">
          {/* Filters Bar */}
          <div className="card-elevated p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-muted-foreground flex-shrink-0" />
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-base h-8 text-sm w-auto" aria-label="Start date" />
                  <span className="text-muted-foreground text-sm">to</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-base h-8 text-sm w-auto" aria-label="End date" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter size={13} className="text-muted-foreground" />
                  <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="input-base h-8 text-sm" aria-label="Filter by account">
                    <option value="all">All Accounts</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: 'This Month', key: 'this-month' },
                  { label: 'Last Month', key: 'last-month' },
                  { label: 'Last 30 Days', key: 'last-30' },
                  { label: 'YTD', key: 'ytd' },
                ].map((preset) => (
                  <button key={preset.key} className="px-2.5 py-1 rounded-lg text-[11px] font-600 border border-border hover:border-accent hover:text-accent transition-all text-muted-foreground" onClick={() => setPreset(preset.key)}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.map((item) => (
              <div key={item.id} className="card-elevated p-4">
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
                <p className={`text-lg font-700 font-tabular ${item.positive === true ? 'text-positive' : item.positive === false ? 'text-negative' : 'text-foreground'}`}>
                  {loading ? <span className="animate-pulse bg-muted rounded w-20 h-5 inline-block" /> : item.value}
                </p>
                {item.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{item.sub}</p>}
              </div>
            ))}
          </div>

          {/* Chart Area */}
          <div className="card-elevated p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-700 text-foreground">{reportTypes.find((r) => r.id === activeReport)?.label}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{dateFrom} — {dateTo}</p>
              </div>
              {loading && <Loader2 size={16} className="animate-spin text-accent" />}
            </div>

            {loading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <Loader2 size={24} className="animate-spin text-accent mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading report data...</p>
                </div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center">
                <EmptyState icon={BarChart3} title="No data for this period" description="Adjust the date range or add transactions to see reports." />
              </div>
            ) : (
              <div className="h-[300px]">
                {activeReport === 'income-expense' && <IncomeExpenseReportChart />}
                {activeReport === 'spending-category' && <SpendingCategoryReportChart />}
                {activeReport === 'monthly-trends' && <MonthlyTrendsChart />}
                {activeReport === 'budget-performance' && <BudgetPerformanceChart />}
                {activeReport === 'account-statement' && <AccountStatementTable transactions={transactions} />}
              </div>
            )}
          </div>

          {/* Download Actions */}
          <div className="card-elevated p-4">
            <p className="text-sm font-700 text-foreground mb-3">Download Options</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 'dl-csv', icon: FileDown, label: 'CSV Export', desc: `${transactions.length} transactions — raw data for spreadsheets`, action: handleDownloadCSV, primary: true },
                { id: 'dl-print', icon: Printer, label: 'Print / Save as PDF', desc: 'Use browser print dialog to save as PDF', action: handlePrint, primary: false },
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <button key={opt.id} onClick={opt.action} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 text-left ${opt.primary ? 'border-accent/40 bg-accent/8 hover:bg-accent/15' : 'border-border hover:border-accent/30 hover:bg-muted/40'}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${opt.primary ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-600 text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountStatementTable({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState icon={FileText} title="No transactions" description="No transactions in this period." />
      </div>
    );
  }
  return (
    <div className="overflow-auto h-full scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Date</th>
            <th className="text-left py-2 px-3 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Description</th>
            <th className="text-left py-2 px-3 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Category</th>
            <th className="text-right py-2 px-3 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <tr key={txn.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap font-tabular">{txn.transaction_date}</td>
              <td className="py-2.5 px-3 text-foreground truncate max-w-[200px]">{txn.merchant || txn.description}</td>
              <td className="py-2.5 px-3 text-muted-foreground">{txn.category?.name || '—'}</td>
              <td className={`py-2.5 px-3 text-right font-700 font-tabular whitespace-nowrap ${txn.transaction_type === 'income' ? 'text-positive' : 'text-foreground'}`}>
                {txn.transaction_type === 'income' ? '+' : '-'}
                {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Math.abs(txn.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
