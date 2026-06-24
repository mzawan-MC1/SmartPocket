'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { DollarSign, Plus } from 'lucide-react';
import {
  getSettlements, createSettlement, getManagedPeople, getReimbursements,
  type Settlement, type ManagedPerson, type Reimbursement
} from '@/lib/people';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchField from '@/components/ui/SearchField';
import CurrencySelector from '@/components/CurrencySelector';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { getFinancialAccountDisplayLabel } from '@/lib/financial-account-utils';

interface NewSettlementModalProps {
  people: ManagedPerson[];
  accounts: FinancialAccount[];
  reimbursements: Reimbursement[];
  onClose: () => void;
  onSuccess: () => void;
}

function NewSettlementModal({ people, accounts, reimbursements, onClose, onSuccess }: NewSettlementModalProps) {
  const { t } = useTranslation('portal');
  const { data: referenceData } = useClientReferenceData();
  const initialCurrency = referenceData?.platformDefaultCurrency || '';
  const [personId, setPersonId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(initialCurrency);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('cash');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedReimbs, setSelectedReimbs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialCurrency || currency) return;
    setCurrency(initialCurrency);
  }, [currency, initialCurrency]);

  const personReimbs = reimbursements.filter(
    (r) => r.person_id === personId && (r.status === 'pending' || r.status === 'partially_paid')
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId) { toast.error(t('settlements.selectPersonError')); return; }
    if (!amount || Number(amount) <= 0) { toast.error(t('settlements.validAmountError')); return; }
    if (!description.trim()) { toast.error(t('settlements.descriptionRequired')); return; }
    setSaving(true);
    try {
      await createSettlement({
        person_id: personId,
        amount: Number(amount),
        currency,
        settlement_date: date,
        payment_method: method,
        receiving_account_id: accountId || null,
        description: description.trim(),
        notes: notes || undefined,
        reimbursement_ids: selectedReimbs.length > 0 ? selectedReimbs : undefined,
      });
      toast.success(t('settlements.recorded'));
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message || t('settlements.recordFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-700 text-foreground">{t('settlements.newSettlement')}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.person')} <span className="text-negative">*</span></label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
              <option value="">{t('settlements.selectPerson')}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.amount')} <span className="text-negative">*</span></label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('settlements.amountPlaceholder')} min="0.01" step="0.01"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.currency')}</label>
              <CurrencySelector
                value={currency}
                onChange={setCurrency}
                placeholder={t('settlements.chooseCurrency')}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.paymentMethod')}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
              <option value="cash">{t('settlements.methods.cash')}</option>
              <option value="bank_transfer">{t('settlements.methods.bankTransfer')}</option>
              <option value="card">{t('settlements.methods.card')}</option>
              <option value="digital_wallet">{t('settlements.methods.digitalWallet')}</option>
              <option value="other">{t('settlements.methods.other')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.receivingAccount')}</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
              <option value="">{t('settlements.noneExternal')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {getFinancialAccountDisplayLabel(a, {
                    includeCurrency: true,
                    includeDefaultLabel: true,
                  })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.descriptionLabel')} <span className="text-negative">*</span></label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('settlements.descriptionPlaceholder')}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>

          {personReimbs.length > 0 && (
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.clearReimbursements')}</label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {personReimbs.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-muted">
                    <input type="checkbox" checked={selectedReimbs.includes(r.id)}
                      onChange={(e) => setSelectedReimbs(e.target.checked
                        ? [...selectedReimbs, r.id]
                        : selectedReimbs.filter((id) => id !== r.id))}
                      className="rounded" />
                    <span className="text-sm text-foreground flex-1">{r.description}</span>
                    <FormattedCurrencyAmount
                      amount={Number(r.amount) - Number(r.amount_paid)}
                      currencyCode={r.currency}
                      className="text-xs text-muted-foreground"
                      showCode
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.notes')}</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('settlements.optional')}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">{t('settlements.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 disabled:opacity-60">
              {saving ? t('settlements.saving') : t('settlements.recordSettlement')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettlementsPage() {
  const { t } = useTranslation('portal');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPerson, setFilterPerson] = useState('all');
  const [showModal, setShowModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, a, r] = await Promise.all([
        getSettlements(), getManagedPeople(), getAccounts(), getReimbursements(),
      ]);
      setSettlements(s); setPeople(p); setAccounts(a); setReimbursements(r);
    } catch { toast.error(t('settlements.loadFailed')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);

  useSmartPocketDataChanged(['settlements', 'reimbursements', 'people', 'financial_accounts'], 'SettlementsPage', async () => {
    await loadData();
  });

  const filtered = settlements.filter((s) => {
    const matchPerson = filterPerson === 'all' || s.person_id === filterPerson;
    const matchSearch = !search || s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.person?.full_name.toLowerCase().includes(search.toLowerCase());
    return matchPerson && matchSearch;
  });

  const totalSettledByCurrency = Array.from(
    settlements.reduce((map, settlement) => {
      const normalized = typeof settlement.currency === 'string' ? settlement.currency.trim().toUpperCase() : '';
      const currency = normalized.length === 3 ? normalized : 'USD';
      map.set(currency, (map.get(currency) || 0) + Number(settlement.amount || 0));
      return map;
    }, new Map<string, number>())
  ).map(([currency, amount]) => ({ currency, amount }));

  return (
    <AppLayout activeRoute="/settlements">
      <div className="page-section pb-6 max-[480px]:gap-3">
        <PageHeader
          title={t('settlements.title')}
          description={t('settlements.description')}
          badge={<StatusBadge status="info" label={t('settlements.badge')} />}
          compact
          className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
          actionsClassName="w-full sm:w-auto"
          actions={
            <button onClick={() => setShowModal(true)} className="btn-primary max-[480px]:w-full">
              <Plus size={16} />
              <span>{t('settlements.newSettlement')}</span>
            </button>
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div className="card p-4 max-[480px]:p-3">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">{t('settlements.totalSettlements')}</p>
            <p className="text-lg font-700 text-foreground">{settlements.length}</p>
          </div>
          <div className="card p-4 max-[480px]:p-3">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">{t('settlements.totalAmount')}</p>
            <div className="text-lg font-700 text-positive">
              {totalSettledByCurrency.length === 0 ? (
                t('settlements.noData')
              ) : (
                totalSettledByCurrency.map((row) => (
                  <FormattedCurrencyAmount
                    key={row.currency}
                    amount={row.amount}
                    currencyCode={row.currency}
                    className="text-lg font-700 text-positive"
                    showCode
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchField
            type="text"
            placeholder={t('settlements.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
            inputClassName="bg-card h-[42px]"
          />
          <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
            <option value="all">{t('settlements.allPeople')}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="card p-4 h-20 animate-pulse bg-muted" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <DollarSign size={40} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{t('settlements.emptyTitle')}</p>
            <button onClick={() => setShowModal(true)} className="mt-4 text-accent text-sm font-600 hover:underline">
              {t('settlements.recordFirstSettlement')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <div key={s.id} className="card p-4 max-[480px]:p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-600 text-foreground">{s.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.person?.full_name} · {t(`settlements.methods.${s.payment_method}`, { defaultValue: s.payment_method })} · {s.settlement_date}
                    </p>
                    {s.receiving_account && (
                      <p className="text-xs text-muted-foreground">{t('settlements.toAccount', { name: s.receiving_account.name })}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <FormattedCurrencyAmount
                      amount={Number(s.amount)}
                      currencyCode={s.currency}
                      className="text-sm font-700 text-positive"
                      showCode
                    />
                    <span className="text-xs px-2 py-0.5 rounded-full bg-positive-soft text-positive font-500">{t('settlements.settled')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <NewSettlementModal
          people={people}
          accounts={accounts}
          reimbursements={reimbursements}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </AppLayout>
  );
}
