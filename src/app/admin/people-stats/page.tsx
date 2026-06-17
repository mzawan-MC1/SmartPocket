'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Users, Home, BarChart3, TrendingUp, RefreshCw, Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

interface PeopleStats {
  totalPeople: number;
  activePeople: number;
  archivedPeople: number;
  byRelationship: { relationship: string; count: number }[];
  totalHeldBalanceByCurrency: Array<{ currency: string; amount: number }>;
  pendingReimbursements: number;
  settledReimbursements: number;
  totalSettlements: number;
}

interface SpaceStats {
  totalSpaces: number;
  activeSpaces: number;
  totalMembers: number;
  pendingInvitations: number;
  byType: { space_type: string; count: number }[];
}

type RelationshipRow = { relationship: string };
type SpaceTypeRow = { space_type: string };

export default function AdminPeopleSpaceStatsPage() {
  const { user } = useAuth();
  const [peopleStats, setPeopleStats] = useState<PeopleStats | null>(null);
  const [spaceStats, setSpaceStats] = useState<SpaceStats | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.app_metadata?.role === 'admin';

  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const supabase = createClient();

    try {
      const [
        totalPeopleRes,
        activePeopleRes,
        archivedPeopleRes,
        byRelationshipRes,
        pendingReimbRes,
        settledReimbRes,
        totalSettlementsRes,
        spaceDataRes,
        totalMembersRes,
        pendingInvRes,
        bySpaceTypeRes,
      ] = await Promise.all([
        supabase.from('managed_people').select('*', { count: 'exact', head: true }),
        supabase.from('managed_people').select('*', { count: 'exact', head: true }).eq('is_archived', false),
        supabase.from('managed_people').select('*', { count: 'exact', head: true }).eq('is_archived', true),
        supabase.from('managed_people').select('relationship').then(async ({ data }: { data: RelationshipRow[] | null }) => {
          const counts: Record<string, number> = {};
          (data || []).forEach((p) => {
            counts[p.relationship] = (counts[p.relationship] || 0) + 1;
          });
          return { data: Object.entries(counts).map(([relationship, count]) => ({ relationship, count })) };
        }),
        supabase.from('reimbursements').select('*', { count: 'exact', head: true }).in('status', ['pending', 'partially_paid']).eq('is_deleted', false),
        supabase.from('reimbursements').select('*', { count: 'exact', head: true }).eq('status', 'settled').eq('is_deleted', false),
        supabase.from('settlements').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
        supabase.from('spaces').select('id, is_active, space_type'),
        supabase.from('space_members').select('*', { count: 'exact', head: true }),
        supabase.from('space_invitations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('spaces').select('space_type').then(async ({ data }: { data: SpaceTypeRow[] | null }) => {
          const counts: Record<string, number> = {};
          (data || []).forEach((s) => {
            counts[s.space_type] = (counts[s.space_type] || 0) + 1;
          });
          return { data: Object.entries(counts).map(([space_type, count]) => ({ space_type, count })) };
        }),
      ]);

      const totalPeople = totalPeopleRes.count;
      const activePeople = activePeopleRes.count;
      const archivedPeople = archivedPeopleRes.count;
      const byRelationship = byRelationshipRes.data;
      const pendingReimb = pendingReimbRes.count;
      const settledReimb = settledReimbRes.count;
      const totalSettlements = totalSettlementsRes.count;
      const spaceData = spaceDataRes.data;
      const totalMembers = totalMembersRes.count;
      const pendingInv = pendingInvRes.count;
      const bySpaceType = bySpaceTypeRes.data;

      // Aggregate held balance total (count only, not per-user breakdown)
      const { data: balances } = await supabase.from('person_balances').select('money_held, preferred_currency');
      const totalHeldByCurrency = Array.from(
        ((balances || []) as Array<{ money_held: number | string; preferred_currency: string | null }>)
          .reduce((map, balance) => {
            const amount = Math.max(0, Number(balance.money_held || 0));
            if (!amount) return map;
            const normalized = typeof balance.preferred_currency === 'string'
              ? balance.preferred_currency.trim().toUpperCase()
              : '';
            const currency = normalized.length === 3 ? normalized : 'USD';
            map.set(currency, (map.get(currency) || 0) + amount);
            return map;
          }, new Map<string, number>())
      ).map(([currency, amount]) => ({ currency, amount }));

      const activeSpaces = (spaceData || []).filter((s: { is_active: boolean }) => s.is_active).length;

      setPeopleStats({
        totalPeople: totalPeople || 0,
        activePeople: activePeople || 0,
        archivedPeople: archivedPeople || 0,
        byRelationship: byRelationship || [],
        totalHeldBalanceByCurrency: totalHeldByCurrency || [],
        pendingReimbursements: pendingReimb || 0,
        settledReimbursements: settledReimb || 0,
        totalSettlements: totalSettlements || 0,
      });

      setSpaceStats({
        totalSpaces: (spaceData || []).length,
        activeSpaces,
        totalMembers: totalMembers || 0,
        pendingInvitations: pendingInv || 0,
        byType: bySpaceType || [],
      });
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (!isAdmin) {
    return (
      <div className="card p-12 text-center">
        <BarChart3 size={48} className="mx-auto text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-700 text-foreground mb-2">Admin Access Required</h2>
        <p className="text-sm text-muted-foreground">You need admin privileges to view these statistics.</p>
      </div>
    );
  }

  return (
      <div className="space-y-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">People & Space Statistics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Aggregate counts and activity — no private financial details</p>
          </div>
          <button onClick={loadStats} className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="card p-4 animate-pulse h-20 bg-muted" />
            ))}
          </div>
        ) : (
          <>
            {/* People Stats */}
            <div>
              <h2 className="text-sm font-700 text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                <Users size={14} /> Managed People
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total People</p>
                  <p className="text-2xl font-700 text-foreground">{peopleStats?.totalPeople ?? 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Active</p>
                  <p className="text-2xl font-700 text-positive">{peopleStats?.activePeople ?? 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Archived</p>
                  <p className="text-2xl font-700 text-muted-foreground">{peopleStats?.archivedPeople ?? 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Held Balance</p>
                  <div className="space-y-1">
                    {(peopleStats?.totalHeldBalanceByCurrency || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No held balances</p>
                    ) : (
                      (peopleStats?.totalHeldBalanceByCurrency || []).map((row) => (
                        <FormattedCurrencyAmount
                          key={row.currency}
                          amount={row.amount}
                          currencyCode={row.currency}
                          className="text-sm font-700 text-info"
                          showCode
                        />
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Across all users</p>
                </div>
              </div>
            </div>

            {/* Reimbursement & Settlement Stats */}
            <div>
              <h2 className="text-sm font-700 text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                <TrendingUp size={14} /> Reimbursements & Settlements
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Pending Reimbursements</p>
                  <p className="text-2xl font-700 text-warning">{peopleStats?.pendingReimbursements ?? 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Settled Reimbursements</p>
                  <p className="text-2xl font-700 text-positive">{peopleStats?.settledReimbursements ?? 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Settlements</p>
                  <p className="text-2xl font-700 text-foreground">{peopleStats?.totalSettlements ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Relationship Breakdown */}
            {(peopleStats?.byRelationship?.length ?? 0) > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-700 text-foreground mb-4 flex items-center gap-2">
                  <Users size={15} className="text-accent" /> People by Relationship
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {peopleStats!.byRelationship.map(({ relationship, count }) => (
                    <div key={relationship} className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
                      <span className="text-sm text-foreground capitalize">{relationship}</span>
                      <span className="text-sm font-700 text-accent">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Space Stats */}
            <div>
              <h2 className="text-sm font-700 text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                <Home size={14} /> Shared Spaces
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Spaces</p>
                  <p className="text-2xl font-700 text-foreground">{spaceStats?.totalSpaces ?? 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Active Spaces</p>
                  <p className="text-2xl font-700 text-positive">{spaceStats?.activeSpaces ?? 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Members</p>
                  <p className="text-2xl font-700 text-info">{spaceStats?.totalMembers ?? 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Pending Invitations</p>
                  <p className="text-2xl font-700 text-warning">{spaceStats?.pendingInvitations ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Space Type Breakdown */}
            {(spaceStats?.byType?.length ?? 0) > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-700 text-foreground mb-4 flex items-center gap-2">
                  <Building2 size={15} className="text-accent" /> Spaces by Type
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {spaceStats!.byType.map(({ space_type, count }) => (
                    <div key={space_type} className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
                      <span className="text-sm text-foreground capitalize">{space_type}</span>
                      <span className="text-sm font-700 text-accent">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-muted/30 rounded-xl p-4 text-xs text-muted-foreground">
              ℹ Statistics show aggregate counts only. Individual user financial data, transaction amounts, and personal balances are not exposed here.
            </div>
          </>
        )}
      </div>
  );
}
