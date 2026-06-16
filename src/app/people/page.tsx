'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { Users, Plus, Search, Archive, MoreVertical, TrendingUp, TrendingDown, Wallet, ChevronRight, UserPlus, RefreshCw } from 'lucide-react';
import { getManagedPeople, archiveManagedPerson, type ManagedPerson } from '@/lib/people';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';

const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: 'Spouse', child: 'Child', parent: 'Parent', sibling: 'Sibling',
  friend: 'Friend', relative: 'Relative', colleague: 'Colleague', client: 'Client', other: 'Other',
};

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

function formatAmount(amount: number, currency = 'AED') {
  if (amount === 0) return '—';
  return `${currency} ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const { t } = useTranslation('common');
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
      toast.error('Failed to load people');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { loadPeople(); }, [loadPeople]);

  const filtered = people.filter((p) => {
    const matchSearch = !search || p.full_name.toLowerCase().includes(search.toLowerCase());
    const matchRel = filterRelationship === 'all' || p.relationship === filterRelationship;
    return matchSearch && matchRel;
  });

  const handleArchive = async (id: string, name: string) => {
    try {
      await archiveManagedPerson(id);
      toast.success(`${name} archived`);
      loadPeople();
    } catch {
      toast.error('Failed to archive');
    }
    setOpenMenuId(null);
  };

  const totalHeld = people.reduce((s, p) => s + (p.money_held ?? 0), 0);
  const totalOwedToMe = people.reduce((s, p) => s + (p.person_owes_user ?? 0), 0);
  const totalIOwe = people.reduce((s, p) => s + (p.user_owes_person ?? 0), 0);

  return (
    <AppLayout activeRoute="/people">
      <div className="page-section pb-6">
        <PageHeader
          title="People"
          description="Manage finances for family, friends, clients, and anyone you track balances for."
          badge={<StatusBadge status="info" label="People" />}
          actions={
            <Link
              href="/people/new"
              className="btn-primary"
            >
              <UserPlus size={16} />
              <span>Add Person</span>
            </Link>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={16} className="text-info" />
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Money Held</span>
            </div>
            <p className="text-lg font-700 text-foreground">AED {totalHeld.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-positive" />
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Owed to Me</span>
            </div>
            <p className="text-lg font-700 text-positive">AED {totalOwedToMe.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={16} className="text-negative" />
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wide">I Owe</span>
            </div>
            <p className="text-lg font-700 text-negative">AED {totalIOwe.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <select
            value={filterRelationship}
            onChange={(e) => setFilterRelationship(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="all">All Relationships</option>
            {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-500 transition-colors ${showArchived ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card text-muted-foreground'}`}
          >
            <Archive size={15} />
            Archived
          </button>
          <button onClick={loadPeople} className="p-2.5 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors">
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
              {search || filterRelationship !== 'all' ? 'No people found' : 'No people yet'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterRelationship !== 'all' ?'Try adjusting your search or filters' :'Add family members, friends, or anyone whose finances you manage'}
            </p>
            {!search && filterRelationship === 'all' && (
              <Link
                href="/people/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow"
              >
                <Plus size={16} />
                Add First Person
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((person) => (
              <div key={person.id} className="card p-4 hover:shadow-card-md transition-shadow">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(person.full_name)} flex items-center justify-center text-white font-700 text-sm flex-shrink-0`}>
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
                        {RELATIONSHIP_LABELS[person.relationship] || 'Other'}
                      </span>
                      {person.is_archived && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-500">Archived</span>
                      )}
                    </div>

                    {/* Balance row */}
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      {(person.money_held ?? 0) > 0 && (
                        <span className="text-xs text-info font-500">
                          Held: {formatAmount(person.money_held ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {(person.person_owes_user ?? 0) > 0 && (
                        <span className="text-xs text-positive font-500">
                          Owes me: {formatAmount(person.person_owes_user ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {(person.user_owes_person ?? 0) > 0 && (
                        <span className="text-xs text-negative font-500">
                          I owe: {formatAmount(person.user_owes_person ?? 0, person.preferred_currency)}
                        </span>
                      )}
                      {!(person.money_held) && !(person.person_owes_user) && !(person.user_owes_person) && (
                        <span className="text-xs text-muted-foreground">No outstanding balance</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/people/${person.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-600 hover:bg-accent/20 transition-colors"
                    >
                      View
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
                            Edit Profile
                          </Link>
                          <Link
                            href={`/people/${person.id}?tab=ledger`}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                            onClick={() => setOpenMenuId(null)}
                          >
                            View Ledger
                          </Link>
                          <Link
                            href={`/people/new?quick=money_received&person=${person.id}`}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-positive"
                            onClick={() => setOpenMenuId(null)}
                          >
                            Record Money Received
                          </Link>
                          {!person.is_archived && (
                            <button
                              onClick={() => handleArchive(person.id, person.full_name)}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-muted-foreground"
                            >
                              Archive
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
