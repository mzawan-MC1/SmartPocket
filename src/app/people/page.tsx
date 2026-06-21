'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { Users, Plus, Archive, MoreVertical, TrendingUp, TrendingDown, Wallet, ChevronRight, UserPlus, RefreshCw } from 'lucide-react';
import { getManagedPeople, archiveManagedPerson, type ManagedPerson } from '@/lib/people';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchField from '@/components/ui/SearchField';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useSmartPocketDataChanged } from '@/lib/data-change';

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
  spouse: 'bg-pink-100 text-pink-700',
  child: 'bg-blue-100 text-blue-700',
  parent: 'bg-purple-100 text-purple-700',
  sibling: 'bg-indigo-100 text-indigo-700',
  friend: 'bg-green-100 text-green-700',
  relative: 'bg-orange-100 text-orange-700',
  colleague: 'bg-yellow-100 text-yellow-700',
  client: 'bg-teal-100 text-teal-700',
  other: 'bg-gray-100 text-gray-700',
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
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRelationship, setFilterRelationship] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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

  const filtered = people.filter((p) => {
    const matchSearch = !search || p.full_name.toLowerCase().includes(search.toLowerCase());
    const matchRel = filterRelationship === 'all' || p.relationship === filterRelationship;
    return matchSearch && matchRel;
  });

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

  const totalHeld = groupPeopleTotals(people, 'money_held');
  const totalOwedToMe = groupPeopleTotals(people, 'person_owes_user');
  const totalIOwe = groupPeopleTotals(people, 'user_owes_person');

  return (
    <AppLayout activeRoute="/people">
      <div className="page-section pb-6 max-[480px]:gap-3">
        <PageHeader
          title={t('people.title')}
          description={t('people.description')}
          badge={<StatusBadge status="info" label={t('people.badge')} />}
          compact
          className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
          actionsClassName="w-full sm:w-auto"
          actions={
            <Link
              href="/people/new"
              className="btn-primary max-[480px]:w-full"
            >
              <UserPlus size={16} />
              <span>{t('people.addPerson')}</span>
            </Link>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-3">
          <div className="card p-4 max-[480px]:p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={16} className="text-info" />
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wide">{t('people.moneyHeld')}</span>
            </div>
            <div className="space-y-1">
              {totalHeld.length === 0 ? <p className="text-sm text-muted-foreground">{t('people.noBalances')}</p> : totalHeld.map((row) => (
                <FormattedCurrencyAmount key={`held-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-lg font-700 text-foreground" />
              ))}
            </div>
          </div>
          <div className="card p-4 max-[480px]:p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-positive" />
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wide">{t('people.owedToMe')}</span>
            </div>
            <div className="space-y-1">
              {totalOwedToMe.length === 0 ? <p className="text-sm text-muted-foreground">{t('people.noBalances')}</p> : totalOwedToMe.map((row) => (
                <FormattedCurrencyAmount key={`owed-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-lg font-700 text-positive" />
              ))}
            </div>
          </div>
          <div className="card p-4 max-[480px]:p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={16} className="text-negative" />
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wide">{t('people.iOwe')}</span>
            </div>
            <div className="space-y-1">
              {totalIOwe.length === 0 ? <p className="text-sm text-muted-foreground">{t('people.noBalances')}</p> : totalIOwe.map((row) => (
                <FormattedCurrencyAmount key={`owe-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-lg font-700 text-negative" />
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchField
            type="text"
            placeholder={t('people.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
            inputClassName="bg-card h-[42px]"
          />
          <select
            value={filterRelationship}
            onChange={(e) => setFilterRelationship(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
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
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-500 transition-colors ${showArchived ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card text-muted-foreground'}`}
          >
            <Archive size={15} />
            {t('people.archived')}
          </button>
          <button onClick={loadPeople} className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition-colors hover:text-foreground max-[480px]:hidden">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* People List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Users size={48} className="mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-600 text-foreground mb-2">
              {search || filterRelationship !== 'all' ? t('people.emptyFilteredTitle') : t('people.emptyTitle')}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterRelationship !== 'all' ? t('people.emptyFilteredDescription') : t('people.emptyDescription')}
            </p>
            {!search && filterRelationship === 'all' && (
              <Link
                href="/people/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow"
              >
                <Plus size={16} />
                {t('people.addFirstPerson')}
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((person) => (
              <div key={person.id} className="card p-4 transition-shadow hover:shadow-card-md max-[480px]:p-3">
                <div className="flex items-center gap-4 max-[480px]:items-start max-[480px]:gap-3">
                  {/* Avatar */}
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarColor(person.full_name)} text-sm font-700 text-white max-[480px]:h-11 max-[480px]:w-11`}>
                    {person.photo_url ? (
                      <img src={person.photo_url} alt={person.full_name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <PersonInitials name={person.full_name} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-600 text-foreground truncate">{person.full_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-500 ${RELATIONSHIP_COLORS[person.relationship] || RELATIONSHIP_COLORS.other}`}>
                        {t(`people.relationships.${person.relationship}` as const, {
                          defaultValue: t('people.relationships.other'),
                        })}
                      </span>
                      {person.is_archived && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-500">{t('people.archived')}</span>
                      )}
                    </div>

                    {/* Balance row */}
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      {(person.money_held ?? 0) > 0 && (
                        <span className="text-xs text-info font-500">
                          {t('people.held')}: {formatAmount(person.money_held ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {(person.person_owes_user ?? 0) > 0 && (
                        <span className="text-xs text-positive font-500">
                          {t('people.owesMe')}: {formatAmount(person.person_owes_user ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {(person.user_owes_person ?? 0) > 0 && (
                        <span className="text-xs text-negative font-500">
                          {t('people.iOweShort')}: {formatAmount(person.user_owes_person ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {!(person.money_held) && !(person.person_owes_user) && !(person.user_owes_person) && (
                        <span className="text-xs text-muted-foreground">{t('people.noOutstandingBalance')}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-start flex-shrink-0">
                    <Link
                      href={`/people/${person.id}`}
                      className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-600 text-accent transition-colors hover:bg-accent/20"
                    >
                      {t('people.view')}
                      <ChevronRight size={13} />
                    </Link>
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === person.id ? null : person.id)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenuId === person.id && (
                        <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-card-md min-w-[160px] py-1">
                          <Link
                            href={`/people/${person.id}/edit`}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                            onClick={() => setOpenMenuId(null)}
                          >
                            {t('people.editProfile')}
                          </Link>
                          <Link
                            href={`/people/${person.id}?tab=ledger`}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                            onClick={() => setOpenMenuId(null)}
                          >
                            {t('people.viewLedger')}
                          </Link>
                          <Link
                            href={`/people/new?quick=money_received&person=${person.id}`}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-positive"
                            onClick={() => setOpenMenuId(null)}
                          >
                            {t('people.recordMoneyReceived')}
                          </Link>
                          {!person.is_archived && (
                            <button
                              onClick={() => handleArchive(person.id, person.full_name)}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-muted-foreground"
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
    </AppLayout>
  );
}
