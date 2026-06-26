'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Download, Printer, RefreshCw, TrendingUp, TrendingDown, Wallet, RotateCcw, DollarSign, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getManagedPeople, getPersonReport, type ManagedPerson, type PersonLedgerEntry, type Reimbursement, type Settlement, type PersonBalance } from '@/lib/people';
import { toast } from 'sonner';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';


function getEntryTypeMeta(t: (key: string, options?: Record<string, unknown>) => string): Record<string, { label: string; sign: '+' | '-'; group: string }> {
  return {
    money_received: { label: t('people.detail.entryTypes.moneyReceived', { ns: 'portal' }), sign: '+', group: 'held' },
    money_returned: { label: t('people.detail.entryTypes.moneyReturned', { ns: 'portal' }), sign: '-', group: 'held' },
    expense_from_held: { label: t('people.detail.entryTypes.expenseFromHeld', { ns: 'portal' }), sign: '-', group: 'expense' },
    expense_paid_by_user: { label: t('people.detail.entryTypes.expensePaidByUser', { ns: 'portal' }), sign: '-', group: 'expense' },
    expense_paid_by_person: { label: t('people.detail.entryTypes.expensePaidByPerson', { ns: 'portal' }), sign: '-', group: 'expense' },
    reimbursement_due_to_user: { label: t('people.detail.entryTypes.reimbursementDueToUser', { ns: 'portal' }), sign: '+', group: 'reimbursement' },
    reimbursement_due_to_person: { label: t('people.detail.entryTypes.reimbursementDueToPerson', { ns: 'portal' }), sign: '-', group: 'reimbursement' },
    reimbursement_received: { label: t('people.detail.entryTypes.reimbursementReceived', { ns: 'portal' }), sign: '+', group: 'reimbursement' },
    reimbursement_paid: { label: t('people.detail.entryTypes.reimbursementPaid', { ns: 'portal' }), sign: '-', group: 'reimbursement' },
    settlement: { label: t('people.detail.entryTypes.settlement', { ns: 'portal' }), sign: '+', group: 'settlement' },
    adjustment: { label: t('people.detail.entryTypes.adjustment', { ns: 'portal' }), sign: '+', group: 'other' },
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  partially_paid: 'bg-info-soft text-info',
  settled: 'bg-positive-soft text-positive',
  waived: 'bg-muted text-muted-foreground',
  cancelled: 'bg-negative-soft text-negative',
};

type ReportTab = 'ledger' | 'held' | 'expenses' | 'reimbursements' | 'settlements';

function RichAmount({
  amount,
  currency,
  fallbackCurrency,
  className = '',
}: {
  amount: number;
  currency?: string | null;
  fallbackCurrency?: string;
  className?: string;
}) {
  return (
    <FormattedCurrencyAmount
      amount={amount}
      currencyCode={currency}
      fallbackCurrencyCode={fallbackCurrency}
      className={className}
    />
  );
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
  const { t } = useTranslation(['portal', 'common']);
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
  const entryTypeLabels = useMemo(() => getEntryTypeMeta(t), [t]);
  const tabs: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'ledger', label: t('peopleReports.tabs.ledger', { ns: 'portal' }), icon: FileText },
    { id: 'held', label: t('peopleReports.tabs.held', { ns: 'portal' }), icon: Wallet },
    { id: 'expenses', label: t('peopleReports.tabs.expenses', { ns: 'portal' }), icon: TrendingDown },
    { id: 'reimbursements', label: t('peopleReports.tabs.reimbursements', { ns: 'portal' }), icon: RotateCcw },
    { id: 'settlements', label: t('peopleReports.tabs.settlements', { ns: 'portal' }), icon: DollarSign },
  ];

  useEffect(() => {
    getManagedPeople(false).then((data) => {
      setPeople(data);
      if (data.length > 0) setSelectedPersonId(data[0].id);
    }).catch(() => toast.error(t('people.loadFailed', { ns: 'portal' }))).finally(() => setLoadingPeople(false));
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
      toast.error(t('peopleReports.loadFailed', { ns: 'portal' }));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedPersonId, t]);

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
    if (!filteredLedger.length) { toast.error(t('peopleReports.noDataToExport', { ns: 'portal' })); return; }
    downloadCSV(
      `ledger_${selectedPerson?.full_name || 'person'}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        t('peopleReports.csv.date', { ns: 'portal' }),
        t('peopleReports.csv.type', { ns: 'portal' }),
        t('peopleReports.csv.description', { ns: 'portal' }),
        t('peopleReports.csv.amount', { ns: 'portal' }),
        t('peopleReports.csv.currency', { ns: 'portal' }),
        t('peopleReports.csv.notes', { ns: 'portal' }),
      ],
      filteredLedger.map((e) => [
        e.entry_date,
        entryTypeLabels[e.entry_type]?.label || e.entry_type,
        e.description,
        String(e.amount),
        e.currency,
        e.notes || '',
      ])
    );
  };

  const handleExportReimb = () => {
    if (!filteredReimb.length) { toast.error(t('peopleReports.noDataToExport', { ns: 'portal' })); return; }
    downloadCSV(
      `reimbursements_${selectedPerson?.full_name || 'person'}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        t('peopleReports.csv.date', { ns: 'portal' }),
        t('peopleReports.csv.description', { ns: 'portal' }),
        t('peopleReports.csv.amount', { ns: 'portal' }),
        t('peopleReports.csv.paid', { ns: 'portal' }),
        t('peopleReports.csv.outstanding', { ns: 'portal' }),
        t('peopleReports.csv.currency', { ns: 'portal' }),
        t('peopleReports.csv.status', { ns: 'portal' }),
        t('peopleReports.csv.owedBy', { ns: 'portal' }),
      ],
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
    if (!settlements.length) { toast.error(t('peopleReports.noDataToExport', { ns: 'portal' })); return; }
    downloadCSV(
      `settlements_${selectedPerson?.full_name || 'person'}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        t('peopleReports.csv.date', { ns: 'portal' }),
        t('peopleReports.csv.description', { ns: 'portal' }),
        t('peopleReports.csv.amount', { ns: 'portal' }),
        t('peopleReports.csv.currency', { ns: 'portal' }),
        t('peopleReports.csv.paymentMethod', { ns: 'portal' }),
      ],
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

  return (
    <AppLayout activeRoute="/reports">
      <SubscriptionFeatureGate feature="standard_reports">
        <div className="space-y-5 pb-6 print:space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-700 text-foreground">{t('peopleReports.title', { ns: 'portal' })}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t('peopleReports.description', { ns: 'portal' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
              <Printer size={15} /> {t('reports.print', { ns: 'portal' })}
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
              <label className="block text-xs font-600 text-muted-foreground mb-1">{t('people.title', { ns: 'portal' })}</label>
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
              <label className="block text-xs font-600 text-muted-foreground mb-1">{t('reports.from', { ns: 'portal' })}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="block text-xs font-600 text-muted-foreground mb-1">{t('reports.to', { ns: 'portal' })}</label>
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
                {t('peopleReports.clearFilters', { ns: 'portal' })}
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
                <span className="text-xs font-600 text-muted-foreground">{t('people.moneyHeld', { ns: 'portal' })}</span>
              </div>
              <p className="text-base font-700 text-info">
                <RichAmount amount={balance.money_held} currency={selectedPerson.preferred_currency} fallbackCurrency={selectedPerson.preferred_currency} />
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-positive" />
                <span className="text-xs font-600 text-muted-foreground">{t('people.owesMe', { ns: 'portal' })}</span>
              </div>
              <p className="text-base font-700 text-positive">
                <RichAmount amount={balance.person_owes_user} currency={selectedPerson.preferred_currency} fallbackCurrency={selectedPerson.preferred_currency} />
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={14} className="text-negative" />
                <span className="text-xs font-600 text-muted-foreground">{t('people.iOwe', { ns: 'portal' })}</span>
              </div>
              <p className="text-base font-700 text-negative">
                <RichAmount amount={balance.user_owes_person} currency={selectedPerson.preferred_currency} fallbackCurrency={selectedPerson.preferred_currency} />
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={14} className="text-muted-foreground" />
                <span className="text-xs font-600 text-muted-foreground">{t('people.detail.totalExpenses', { ns: 'portal' })}</span>
              </div>
              <p className="text-base font-700 text-foreground">
                <RichAmount amount={balance.total_expenses} currency={selectedPerson.preferred_currency} fallbackCurrency={selectedPerson.preferred_currency} />
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-muted-foreground" />
                <span className="text-xs font-600 text-muted-foreground">{t('people.detail.totalReceived', { ns: 'portal' })}</span>
              </div>
              <p className="text-base font-700 text-foreground">
                <RichAmount amount={balance.total_received} currency={selectedPerson.preferred_currency} fallbackCurrency={selectedPerson.preferred_currency} />
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-border print:hidden">
          {tabs.map((tab) => {
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
                      <option value="all">{t('peopleReports.allTypes', { ns: 'portal' })}</option>
                      {Object.entries(entryTypeLabels).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">{t('peopleReports.entriesCount', { ns: 'portal', count: filteredLedger.length })}</span>
                  </div>
                  <button onClick={handleExportLedger} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-600 text-muted-foreground hover:bg-muted transition-colors">
                    <Download size={13} /> {t('reports.csv', { ns: 'portal' })}
                  </button>
                </div>
                {filteredLedger.length === 0 ? (
                  <div className="p-12 text-center">
                    <FileText size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">{t('peopleReports.empty.ledger', { ns: 'portal' })}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredLedger.map((entry) => {
                      const meta = entryTypeLabels[entry.entry_type] || { label: entry.entry_type, sign: '+' as const, group: 'other' };
                      return (
                        <div key={entry.id} className="flex items-center justify-between p-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-600 text-foreground truncate">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">{meta.label} · {entry.entry_date}</p>
                          </div>
                          <span className={`text-sm font-700 ml-4 ${meta.sign === '+' ? 'text-positive' : 'text-negative'}`}>
                            {meta.sign}
                            <RichAmount amount={Number(entry.amount)} currency={entry.currency} fallbackCurrency={selectedPerson?.preferred_currency} className="inline-flex" />
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
                    <h3 className="text-sm font-700 text-foreground">{t('peopleReports.heldTitle', { ns: 'portal' })}</h3>
                    {balance && selectedPerson && (
                      <span className="text-sm font-700 text-info">
                        <RichAmount amount={balance.money_held} currency={selectedPerson.preferred_currency} fallbackCurrency={selectedPerson.preferred_currency} />
                      </span>
                    )}
                  </div>
                </div>
                {heldEntries.length === 0 ? (
                  <div className="p-12 text-center">
                    <Wallet size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">{t('peopleReports.empty.held', { ns: 'portal' })}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {heldEntries.map((entry) => {
                      const meta = entryTypeLabels[entry.entry_type];
                      return (
                        <div key={entry.id} className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-600 text-foreground">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">{meta?.label} · {entry.entry_date}</p>
                          </div>
                          <span className={`text-sm font-700 ${meta?.sign === '+' ? 'text-positive' : 'text-negative'}`}>
                            {meta?.sign}
                            <RichAmount amount={Number(entry.amount)} currency={entry.currency} fallbackCurrency={selectedPerson?.preferred_currency} className="inline-flex" />
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
                  <h3 className="text-sm font-700 text-foreground">{t('peopleReports.expenseTitle', { ns: 'portal' })}</h3>
                </div>
                {expenseEntries.length === 0 ? (
                  <div className="p-12 text-center">
                    <TrendingDown size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">{t('peopleReports.empty.expenses', { ns: 'portal' })}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {expenseEntries.map((entry) => {
                      const meta = entryTypeLabels[entry.entry_type];
                      return (
                        <div key={entry.id} className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-600 text-foreground">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">{meta?.label} · {entry.entry_date}</p>
                          </div>
                          <span className="text-sm font-700 text-negative">
                            -
                            <RichAmount amount={Number(entry.amount)} currency={entry.currency} fallbackCurrency={selectedPerson?.preferred_currency} className="inline-flex" />
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
                      <option value="all">{t('peopleReports.allStatuses', { ns: 'portal' })}</option>
                      <option value="pending">{t('reimbursements.statuses.pending', { ns: 'portal' })}</option>
                      <option value="partially_paid">{t('reimbursements.statuses.partially_paid', { ns: 'portal' })}</option>
                      <option value="settled">{t('reimbursements.statuses.settled', { ns: 'portal' })}</option>
                      <option value="waived">{t('reimbursements.statuses.waived', { ns: 'portal' })}</option>
                      <option value="cancelled">{t('reimbursements.statuses.cancelled', { ns: 'portal' })}</option>
                    </select>
                    <span className="text-xs text-muted-foreground">{t('peopleReports.recordsCount', { ns: 'portal', count: filteredReimb.length })}</span>
                  </div>
                  <button onClick={handleExportReimb} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-600 text-muted-foreground hover:bg-muted transition-colors">
                    <Download size={13} /> {t('reports.csv', { ns: 'portal' })}
                  </button>
                </div>
                {filteredReimb.length === 0 ? (
                  <div className="p-12 text-center">
                    <RotateCcw size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">{t('peopleReports.empty.reimbursements', { ns: 'portal' })}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredReimb.map((r) => (
                      <div key={r.id} className="flex items-start justify-between p-4">
                        <div>
                          <p className="text-sm font-600 text-foreground">{r.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.owed_by === 'person'
                              ? t('peopleReports.owedBy.person', { ns: 'portal' })
                              : t('peopleReports.owedBy.user', { ns: 'portal' })} · {r.created_at.slice(0, 10)}
                          </p>
                          {Number(r.amount_paid) > 0 && (
                            <p className="text-xs text-positive mt-0.5">
                              {t('reimbursements.paid', { ns: 'portal' })}: <RichAmount amount={Number(r.amount_paid)} currency={r.currency} fallbackCurrency={selectedPerson?.preferred_currency} className="inline-flex" />
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-700 text-foreground">
                            <RichAmount amount={Number(r.amount)} currency={r.currency} fallbackCurrency={selectedPerson?.preferred_currency} />
                          </p>
                          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-500 ${STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground'}`}>
                            {t(`reimbursements.statuses.${r.status}` as const, { ns: 'portal', defaultValue: r.status.replace('_', ' ') })}
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
                  <span className="text-xs text-muted-foreground">{t('peopleReports.settlementsCount', { ns: 'portal', count: settlements.length })}</span>
                  <button onClick={handleExportSettlements} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-600 text-muted-foreground hover:bg-muted transition-colors">
                    <Download size={13} /> {t('reports.csv', { ns: 'portal' })}
                  </button>
                </div>
                {settlements.length === 0 ? (
                  <div className="p-12 text-center">
                    <DollarSign size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">{t('peopleReports.empty.settlements', { ns: 'portal' })}</p>
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
                          +
                          <RichAmount amount={Number(s.amount)} currency={s.currency} fallbackCurrency={selectedPerson?.preferred_currency} className="inline-flex" />
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
      </SubscriptionFeatureGate>
    </AppLayout>
  );
}
