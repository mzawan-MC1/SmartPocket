'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Download, Printer, RefreshCw, TrendingUp, TrendingDown, Wallet, RotateCcw, DollarSign, FileText } from 'lucide-react';
import { getManagedPeople, getPersonReport, type ManagedPerson, type PersonLedgerEntry, type Reimbursement, type Settlement, type PersonBalance } from '@/lib/people';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { formatCurrencyText } from '@/lib/currency-formatting';


const ENTRY_TYPE_LABELS: Record<string, { label: string; sign: '+' | '-'; group: string }> = {
  money_received:              { label: 'Money Received',           sign: '+', group: 'held' },
  money_returned:              { label: 'Money Returned',           sign: '-', group: 'held' },
  expense_from_held:           { label: 'Expense (Held Balance)',   sign: '-', group: 'expense' },
  expense_paid_by_user:        { label: 'Expense (Paid by Me)',     sign: '-', group: 'expense' },
  expense_paid_by_person:      { label: 'Expense (Paid by Person)', sign: '-', group: 'expense' },
  reimbursement_due_to_user:   { label: 'Reimbursement Due to Me',  sign: '+', group: 'reimbursement' },
  reimbursement_due_to_person: { label: 'Reimbursement Due to Person', sign: '-', group: 'reimbursement' },
  reimbursement_received:      { label: 'Reimbursement Received',   sign: '+', group: 'reimbursement' },
  reimbursement_paid:          { label: 'Reimbursement Paid',       sign: '-', group: 'reimbursement' },
  settlement:                  { label: 'Settlement',               sign: '+', group: 'settlement' },
  adjustment:                  { label: 'Adjustment',               sign: '+', group: 'other' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  partially_paid: 'bg-info-soft text-info',
  settled: 'bg-positive-soft text-positive',
  waived: 'bg-muted text-muted-foreground',
  cancelled: 'bg-negative-soft text-negative',
};

type ReportTab = 'ledger' | 'held' | 'expenses' | 'reimbursements' | 'settlements';

function formatMoney(amount: number, currency?: string | null, fallbackCurrency?: string) {
  return formatCurrencyText(Math.abs(amount), {
    currencyCode: currency,
    fallbackCurrencyCode: fallbackCurrency,
  });
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PersonReportsPage() {
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState<ReportTab>('ledger');
  const [loading, setLoading] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(true);

  const [ledger, setLedger] = useState<PersonLedgerEntry[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balance, setBalance] = useState<PersonBalance | null>(null);

  const [filterEntryType, setFilterEntryType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    getManagedPeople(false).then((data) => {
      setPeople(data);
      if (data.length > 0) setSelectedPersonId(data[0].id);
    }).catch(() => toast.error('Failed to load people')).finally(() => setLoadingPeople(false));
  }, []);

  const loadReport = useCallback(async () => {
    if (!selectedPersonId) return;
    setLoading(true);
    try {
      const report = await getPersonReport(selectedPersonId, dateFrom || undefined, dateTo || undefined);
      setLedger(report.ledger);
      setReimbursements(report.reimbursements);
      setSettlements(report.settlements);
      setBalance(report.balance);
    } catch {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [selectedPersonId, dateFrom, dateTo]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const selectedPerson = people.find((p) => p.id === selectedPersonId);

  const filteredLedger = useMemo(() => {
    return ledger.filter((e) => filterEntryType === 'all' || e.entry_type === filterEntryType);
  }, [ledger, filterEntryType]);

  const filteredReimb = useMemo(() => {
    return reimbursements.filter((r) => filterStatus === 'all' || r.status === filterStatus);
  }, [reimbursements, filterStatus]);

  const heldEntries = useMemo(() => ledger.filter((e) => ['money_received', 'money_returned', 'expense_from_held'].includes(e.entry_type)), [ledger]);
  const expenseEntries = useMemo(() => ledger.filter((e) => e.entry_type.startsWith('expense')), [ledger]);

  const handleExportLedger = () => {
    if (!filteredLedger.length) { toast.error('No data to export'); return; }
    downloadCSV(
      `ledger_${selectedPerson?.full_name || 'person'}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Type', 'Description', 'Amount', 'Currency', 'Notes'],
      filteredLedger.map((e) => [
        e.entry_date,
        ENTRY_TYPE_LABELS[e.entry_type]?.label || e.entry_type,
        e.description,
        String(e.amount),
        e.currency,
        e.notes || '',
      ])
    );
  };

  const handleExportReimb = () => {
    if (!filteredReimb.length) { toast.error('No data to export'); return; }
    downloadCSV(
      `reimbursements_${selectedPerson?.full_name || 'person'}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Description', 'Amount', 'Paid', 'Outstanding', 'Currency', 'Status', 'Owed By'],
      filteredReimb.map((r) => [
        r.created_at.slice(0, 10),
        r.description,
        String(r.amount),
        String(r.amount_paid),
        String(Number(r.amount) - Number(r.amount_paid)),
        r.currency,
        r.status,
        r.owed_by,
      ])
    );
  };

  const handleExportSettlements = () => {
    if (!settlements.length) { toast.error('No data to export'); return; }
    downloadCSV(
      `settlements_${selectedPerson?.full_name || 'person'}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Description', 'Amount', 'Currency', 'Payment Method'],
      settlements.map((s) => [
        s.settlement_date,
        s.description,
        String(s.amount),
        s.currency,
        s.payment_method,
      ])
    );
  };

  const handlePrint = () => window.print();

  const TABS: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'ledger', label: 'Ledger', icon: FileText },
    { id: 'held', label: 'Money Held', icon: Wallet },
    { id: 'expenses', label: 'Expenses', icon: TrendingDown },
    { id: 'reimbursements', label: 'Reimbursements', icon: RotateCcw },
    { id: 'settlements', label: 'Settlements', icon: DollarSign },
  ];

  return (
    <AppLayout activeRoute="/reports">
      <div className="space-y-5 pb-6 print:space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Person Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Ledger, held balance, expenses, reimbursements, and settlements</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
              <Printer size={15} /> Print
            </button>
            <button onClick={loadReport} className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-600 text-muted-foreground mb-1">Person</label>
              {loadingPeople ? (
                <div className="h-9 bg-muted rounded-xl animate-pulse" />
              ) : (
                <select
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-600 text-muted-foreground mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="block text-xs font-600 text-muted-foreground mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="w-full px-3 py-2 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Balance Summary */}
        {balance && selectedPerson && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet size={14} className="text-info" />
                <span className="text-xs font-600 text-muted-foreground">Money Held</span>
              </div>
              <p className="text-base font-700 text-info">
                {formatMoney(balance.money_held, selectedPerson.preferred_currency, selectedPerson.preferred_currency)}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-positive" />
                <span className="text-xs font-600 text-muted-foreground">Owes Me</span>
              </div>
              <p className="text-base font-700 text-positive">
                {formatMoney(balance.person_owes_user, selectedPerson.preferred_currency, selectedPerson.preferred_currency)}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={14} className="text-negative" />
                <span className="text-xs font-600 text-muted-foreground">I Owe</span>
              </div>
              <p className="text-base font-700 text-negative">
                {formatMoney(balance.user_owes_person, selectedPerson.preferred_currency, selectedPerson.preferred_currency)}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={14} className="text-muted-foreground" />
                <span className="text-xs font-600 text-muted-foreground">Total Expenses</span>
              </div>
              <p className="text-base font-700 text-foreground">
                {formatMoney(balance.total_expenses, selectedPerson.preferred_currency, selectedPerson.preferred_currency)}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-muted-foreground" />
                <span className="text-xs font-600 text-muted-foreground">Total Received</span>
              </div>
              <p className="text-base font-700 text-foreground">
                {formatMoney(balance.total_received, selectedPerson.preferred_currency, selectedPerson.preferred_currency)}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-border print:hidden">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-600 whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="card p-8 animate-pulse">
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-muted rounded" />)}
            </div>
          </div>
        ) : (
          <>
            {/* Ledger Tab */}
            {activeTab === 'ledger' && (
              <div className="card">
                <div className="p-4 border-b border-border flex items-center justify-between print:hidden">
                  <div className="flex items-center gap-3">
                    <select
                      value={filterEntryType}
                      onChange={(e) => setFilterEntryType(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs focus:outline-none"
                    >
                      <option value="all">All Types</option>
                      {Object.entries(ENTRY_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">{filteredLedger.length} entries</span>
                  </div>
                  <button onClick={handleExportLedger} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-600 text-muted-foreground hover:bg-muted transition-colors">
                    <Download size={13} /> CSV
                  </button>
                </div>
                {filteredLedger.length === 0 ? (
                  <div className="p-12 text-center">
                    <FileText size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No ledger entries found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredLedger.map((entry) => {
                      const meta = ENTRY_TYPE_LABELS[entry.entry_type] || { label: entry.entry_type, sign: '+' as const, group: 'other' };
                      return (
                        <div key={entry.id} className="flex items-center justify-between p-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-600 text-foreground truncate">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">{meta.label} · {entry.entry_date}</p>
                          </div>
                          <span className={`text-sm font-700 ml-4 ${meta.sign === '+' ? 'text-positive' : 'text-negative'}`}>
                            {meta.sign}{formatMoney(Number(entry.amount), entry.currency, selectedPerson?.preferred_currency)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Money Held Tab */}
            {activeTab === 'held' && (
              <div className="card">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-700 text-foreground">Held Balance Statement</h3>
                    {balance && selectedPerson && (
                      <span className="text-sm font-700 text-info">
                        {formatMoney(balance.money_held, selectedPerson.preferred_currency, selectedPerson.preferred_currency)}
                      </span>
                    )}
                  </div>
                </div>
                {heldEntries.length === 0 ? (
                  <div className="p-12 text-center">
                    <Wallet size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No held balance entries</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {heldEntries.map((entry) => {
                      const meta = ENTRY_TYPE_LABELS[entry.entry_type];
                      return (
                        <div key={entry.id} className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-600 text-foreground">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">{meta?.label} · {entry.entry_date}</p>
                          </div>
                          <span className={`text-sm font-700 ${meta?.sign === '+' ? 'text-positive' : 'text-negative'}`}>
                            {meta?.sign}{formatMoney(Number(entry.amount), entry.currency, selectedPerson?.preferred_currency)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Expenses Tab */}
            {activeTab === 'expenses' && (
              <div className="card">
                <div className="p-4 border-b border-border">
                  <h3 className="text-sm font-700 text-foreground">Expense Entries</h3>
                </div>
                {expenseEntries.length === 0 ? (
                  <div className="p-12 text-center">
                    <TrendingDown size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No expense entries</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {expenseEntries.map((entry) => {
                      const meta = ENTRY_TYPE_LABELS[entry.entry_type];
                      return (
                        <div key={entry.id} className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-600 text-foreground">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">{meta?.label} · {entry.entry_date}</p>
                          </div>
                          <span className="text-sm font-700 text-negative">
                            -{formatMoney(Number(entry.amount), entry.currency, selectedPerson?.preferred_currency)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Reimbursements Tab */}
            {activeTab === 'reimbursements' && (
              <div className="card">
                <div className="p-4 border-b border-border flex items-center justify-between print:hidden">
                  <div className="flex items-center gap-3">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs focus:outline-none"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="settled">Settled</option>
                      <option value="waived">Waived</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <span className="text-xs text-muted-foreground">{filteredReimb.length} records</span>
                  </div>
                  <button onClick={handleExportReimb} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-600 text-muted-foreground hover:bg-muted transition-colors">
                    <Download size={13} /> CSV
                  </button>
                </div>
                {filteredReimb.length === 0 ? (
                  <div className="p-12 text-center">
                    <RotateCcw size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No reimbursements found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredReimb.map((r) => (
                      <div key={r.id} className="flex items-start justify-between p-4">
                        <div>
                          <p className="text-sm font-600 text-foreground">{r.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.owed_by === 'person' ? 'Person owes me' : 'I owe person'} · {r.created_at.slice(0, 10)}
                          </p>
                          {Number(r.amount_paid) > 0 && (
                            <p className="text-xs text-positive mt-0.5">
                              Paid: {formatMoney(Number(r.amount_paid), r.currency, selectedPerson?.preferred_currency)}
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-700 text-foreground">
                            {formatMoney(Number(r.amount), r.currency, selectedPerson?.preferred_currency)}
                          </p>
                          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-500 ${STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground'}`}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Settlements Tab */}
            {activeTab === 'settlements' && (
              <div className="card">
                <div className="p-4 border-b border-border flex items-center justify-between print:hidden">
                  <span className="text-xs text-muted-foreground">{settlements.length} settlements</span>
                  <button onClick={handleExportSettlements} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-600 text-muted-foreground hover:bg-muted transition-colors">
                    <Download size={13} /> CSV
                  </button>
                </div>
                {settlements.length === 0 ? (
                  <div className="p-12 text-center">
                    <DollarSign size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No settlements found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {settlements.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-4">
                        <div>
                          <p className="text-sm font-600 text-foreground">{s.description}</p>
                          <p className="text-xs text-muted-foreground">{s.payment_method} · {s.settlement_date}</p>
                        </div>
                        <p className="text-sm font-700 text-positive">
                          +{formatMoney(Number(s.amount), s.currency, selectedPerson?.preferred_currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
