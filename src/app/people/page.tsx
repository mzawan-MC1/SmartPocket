'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, Plus, Archive, MoreVertical, TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight, UserPlus, RefreshCw } from 'lucide-react';
import { getManagedPeople, archiveManagedPerson, type ManagedPerson } from '@/lib/people';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchField from '@/components/ui/SearchField';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import Modal from '@/components/ui/Modal';
import ManagedPersonForm from '@/app/people/components/ManagedPersonForm';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { useLanguage } from '@/contexts/LanguageContext';

const RELATIONSHIPS = [
  'spouse',
  'child',
  'parent',
  'sibling',
  'friend',
  'relative',
  'colleague',
  'client',
  'other',
] as const;

const RELATIONSHIP_COLORS: Record<string, string> = {
  spouse: 'bg-violet-100 text-violet-700',
  child: 'bg-cyan-100 text-cyan-700',
  parent: 'bg-indigo-100 text-indigo-700',
  sibling: 'bg-blue-100 text-blue-700',
  friend: 'bg-teal-100 text-teal-700',
  relative: 'bg-slate-100 text-slate-700',
  colleague: 'bg-sky-100 text-sky-700',
  client: 'bg-purple-100 text-purple-700',
  other: 'bg-muted text-muted-foreground',
};

function groupPeopleTotals(people: ManagedPerson[], field: 'money_held' | 'person_owes_user' | 'user_owes_person') {
  const grouped = new Map<string, number>();
  for (const person of people) {
    const amount = Number(person[field] ?? 0);
    if (!amount) continue;
    const currency = person.preferred_currency || 'USD';
    grouped.set(currency, (grouped.get(currency) ?? 0) + amount);
  }
  return Array.from(grouped.entries()).map(([currency, amount]) => ({ currency, amount }));
}

function formatAmount(amount: number, currency = 'USD') {
  if (amount === 0) return '—';
  return <FormattedCurrencyAmount amount={amount} currencyCode={currency} />;
}

function PersonInitials({ name }: { name: string }) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return <span>{initials}</span>;
}

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700', 'from-purple-500 to-purple-700',
  'from-green-500 to-green-700', 'from-orange-500 to-orange-700',
  'from-pink-500 to-pink-700', 'from-teal-500 to-teal-700',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ManagedPeoplePage() {
  const { t } = useTranslation('portal');
  const router = useRouter();
  const { isRTL } = useLanguage();
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRelationship, setFilterRelationship] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const ChevronIcon = isRTL ? ChevronLeft : ChevronRight;

  const loadPeople = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getManagedPeople(showArchived);
      setPeople(data);
    } catch {
      toast.error(t('people.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [showArchived, t]);

  useEffect(() => { loadPeople(); }, [loadPeople]);

  useSmartPocketDataChanged(['people', 'reimbursements', 'settlements'], 'PeoplePage', async () => {
    await loadPeople();
  });

  const filtered = useMemo(() => people.filter((p) => {
    const matchSearch = !search || p.full_name.toLowerCase().includes(search.toLowerCase());
    const matchRel = filterRelationship === 'all' || p.relationship === filterRelationship;
    return matchSearch && matchRel;
  }), [filterRelationship, people, search]);

  const handleArchive = async (id: string, name: string) => {
    try {
      await archiveManagedPerson(id);
      toast.success(t('people.archivedPerson', { name }));
      loadPeople();
    } catch {
      toast.error(t('people.archiveFailed'));
    }
    setOpenMenuId(null);
  };

  const totalHeld = useMemo(() => groupPeopleTotals(people, 'money_held'), [people]);
  const totalOwedToMe = useMemo(() => groupPeopleTotals(people, 'person_owes_user'), [people]);
  const totalIOwe = useMemo(() => groupPeopleTotals(people, 'user_owes_person'), [people]);

  return (
    <AppLayout activeRoute="/people" hideMobileFooter>
      <SubscriptionFeatureGate feature="managed_people">
        <div className="page-section pb-6 max-[480px]:gap-2.5">
        <PageHeader
          title={t('people.title')}
          description={t('people.description')}
          badge={<StatusBadge status="info" label={t('people.badge')} />}
          compact
          className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-3.5 py-3 shadow-card-sm max-[480px]:px-3.5 max-[480px]:py-3"
          actionsClassName="w-full sm:w-auto"
          actions={
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[18px] bg-[linear-gradient(135deg,#06a6d8_0%,#1294ff_100%)] px-3.5 py-2.5 text-[14px] font-700 text-white shadow-[0_12px_24px_rgba(18,148,255,0.18)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:w-auto"
            >
              <UserPlus size={16} />
              <span>{t('people.addPerson')}</span>
            </button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          <div className="card-elevated rounded-[22px] border border-[#d7e3f5] bg-[linear-gradient(180deg,#fafdff_0%,#ffffff_100%)] p-3 shadow-card-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf5ff] text-info">
                <Wallet size={15} />
              </span>
              <span className="text-[10.5px] font-700 uppercase tracking-[0.08em] text-muted-foreground">{t('people.moneyHeld')}</span>
            </div>
            <div className="space-y-1">
              {totalHeld.length === 0 ? <p className="text-[13px] text-muted-foreground">{t('people.noBalances')}</p> : totalHeld.map((row) => (
                <FormattedCurrencyAmount key={`held-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-[16px] font-800 text-foreground" />
              ))}
            </div>
          </div>
          <div className="card-elevated rounded-[22px] border border-[#d7ecdf] bg-[linear-gradient(180deg,#f7fdf9_0%,#ffffff_100%)] p-3 shadow-card-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-positive-soft text-positive">
                <TrendingUp size={15} />
              </span>
              <span className="text-[10.5px] font-700 uppercase tracking-[0.08em] text-muted-foreground">{t('people.owedToMe')}</span>
            </div>
            <div className="space-y-1">
              {totalOwedToMe.length === 0 ? <p className="text-[13px] text-muted-foreground">{t('people.noBalances')}</p> : totalOwedToMe.map((row) => (
                <FormattedCurrencyAmount key={`owed-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-[16px] font-800 text-positive" />
              ))}
            </div>
          </div>
          <div className="card-elevated col-span-2 rounded-[22px] border border-[#f0d7da] bg-[linear-gradient(180deg,#fffafb_0%,#ffffff_100%)] p-3 shadow-card-sm lg:col-span-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-negative-soft text-negative">
                <TrendingDown size={15} />
              </span>
              <span className="text-[10.5px] font-700 uppercase tracking-[0.08em] text-muted-foreground">{t('people.iOwe')}</span>
            </div>
            <div className="space-y-1">
              {totalIOwe.length === 0 ? <p className="text-[13px] text-muted-foreground">{t('people.noBalances')}</p> : totalIOwe.map((row) => (
                <FormattedCurrencyAmount key={`owe-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-[16px] font-800 text-negative" />
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
          <SearchField
            type="text"
            placeholder={t('people.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
            inputClassName="bg-card h-11 rounded-[18px] px-3.5 text-[14px]"
          />
          <select
            value={filterRelationship}
            onChange={(e) => setFilterRelationship(e.target.value)}
            className="rounded-[18px] border border-border bg-card px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="all">{t('people.allRelationships')}</option>
            {RELATIONSHIPS.map((relationship) => (
              <option key={relationship} value={relationship}>
                {t(`people.relationships.${relationship}` as const)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center justify-center gap-2 rounded-[18px] border px-3 py-2.5 text-[14px] font-700 transition-colors ${showArchived ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card text-muted-foreground'}`}
          >
            <Archive size={15} />
            {t('people.archived')}
          </button>
          <button onClick={loadPeople} className="rounded-[18px] border border-border bg-card p-2.5 text-muted-foreground transition-colors hover:text-foreground max-[480px]:hidden">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* People List */}
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card rounded-[22px] p-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card rounded-[24px] p-10 text-center max-[480px]:p-8">
            <Users size={48} className="mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-600 text-foreground mb-2">
              {search || filterRelationship !== 'all' ? t('people.emptyFilteredTitle') : t('people.emptyTitle')}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterRelationship !== 'all' ? t('people.emptyFilteredDescription') : t('people.emptyDescription')}
            </p>
            {!search && filterRelationship === 'all' && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,#06a6d8_0%,#1294ff_100%)] px-5 py-2.5 text-sm font-700 text-white shadow-[0_14px_24px_rgba(18,148,255,0.2)]"
              >
                <Plus size={16} />
                {t('people.addFirstPerson')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((person) => (
              <div
                key={person.id}
                role="link"
                tabIndex={0}
                aria-label={`${t('people.view')}: ${person.full_name}`}
                onClick={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (target?.closest('a,button,[role="menu"],[role="menuitem"],[data-row-interactive="true"]')) {
                    return;
                  }
                  router.push(`/people/${person.id}`);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    router.push(`/people/${person.id}`);
                  }
                }}
                className="card cursor-pointer rounded-[22px] border border-border/80 p-3 transition-shadow hover:shadow-card-md focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <div className="flex items-center gap-3 max-[480px]:items-start max-[480px]:gap-2.5">
                  {/* Avatar */}
                  <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarColor(person.full_name)} text-sm font-700 text-white`}>
                    {person.photo_url ? (
                      <img src={person.photo_url} alt={person.full_name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <PersonInitials name={person.full_name} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="truncate text-[14px] font-700 text-foreground">{person.full_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-700 ${RELATIONSHIP_COLORS[person.relationship] || RELATIONSHIP_COLORS.other}`}>
                        {t(`people.relationships.${person.relationship}` as const, {
                          defaultValue: t('people.relationships.other'),
                        })}
                      </span>
                      {person.is_archived && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-700 text-muted-foreground">{t('people.archived')}</span>
                      )}
                    </div>

                    {/* Balance row */}
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                      {(person.money_held ?? 0) > 0 && (
                        <span className="text-[11px] font-700 text-info">
                          {t('people.held')}: {formatAmount(person.money_held ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {(person.person_owes_user ?? 0) > 0 && (
                        <span className="text-[11px] font-700 text-positive">
                          {t('people.owesMe')}: {formatAmount(person.person_owes_user ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {(person.user_owes_person ?? 0) > 0 && (
                        <span className="text-[11px] font-700 text-negative">
                          {t('people.iOweShort')}: {formatAmount(person.user_owes_person ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {!(person.money_held) && !(person.person_owes_user) && !(person.user_owes_person) && (
                        <span className="text-[11px] text-muted-foreground">{t('people.noOutstandingBalance')}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-start flex-shrink-0">
                    <ChevronIcon size={16} className="text-muted-foreground" aria-hidden="true" />
                    <div className="relative">
                      <button
                        type="button"
                        data-row-interactive="true"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId(openMenuId === person.id ? null : person.id);
                        }}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
                        aria-label={t('actions.more', { ns: 'common', defaultValue: 'More' })}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenuId === person.id && (
                        <div
                          className={`absolute top-8 z-20 min-w-[160px] rounded-xl border border-border bg-card py-1 shadow-card-md ${isRTL ? 'left-0' : 'right-0'}`}
                          role="menu"
                          data-row-interactive="true"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Link
                            href={`/people/${person.id}/edit`}
                            className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-muted transition-colors"
                            role="menuitem"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuId(null);
                            }}
                          >
                            {t('people.editProfile')}
                          </Link>
                          <Link
                            href={`/people/${person.id}?tab=ledger`}
                            className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-muted transition-colors"
                            role="menuitem"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuId(null);
                            }}
                          >
                            {t('people.viewLedger')}
                          </Link>
                          <Link
                            href={`/people/new?quick=money_received&person=${person.id}`}
                            className="flex items-center gap-2 px-4 py-2 text-[13px] text-positive transition-colors hover:bg-muted"
                            role="menuitem"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuId(null);
                            }}
                          >
                            {t('people.recordMoneyReceived')}
                          </Link>
                          {!person.is_archived && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleArchive(person.id, person.full_name);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted"
                            >
                              {t('people.archive')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        {/* Close menu on outside click */}
        {openMenuId && (
          <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
        )}

        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title={t('people.addPerson')}
          description={t('people.form.createManagedProfile')}
          size="md"
          mobileLayout="sheet"
          contentClassName="max-[480px]:w-[min(calc(100vw-8px),430px)]"
          headerClassName="max-[480px]:px-3.5 max-[480px]:py-2.5"
          bodyClassName="overflow-hidden p-0"
        >
          <ManagedPersonForm
            onSuccess={(person) => {
              setShowAddModal(false);
              void loadPeople();
              router.push(`/people/${person.id}`);
            }}
            onCancel={() => setShowAddModal(false)}
          />
        </Modal>
      </SubscriptionFeatureGate>
    </AppLayout>
  );
}
