'use client';

import React from 'react';
import Link from 'next/link';
import { Loader2, Search, Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import SearchField from '@/components/ui/SearchField';
import { SupportPriorityBadge, SupportStatusBadge } from '@/components/support/SupportBadges';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  formatSupportDateTime,
  toTitleLabel,
} from '@/lib/support';

type AdminUserOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type TicketRecord = {
  id: string;
  ticket_number: string;
  user_name_snapshot: string;
  user_email_snapshot: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string;
  support_unread_count: number;
};

type DashboardMetrics = {
  totalOpen: number;
  unassigned: number;
  urgent: number;
  waitingForSupport: number;
  waitingForCustomer: number;
  resolvedToday: number;
  averageFirstResponseHours: number | null;
  averageResolutionHours: number | null;
};

type BulkTicketResult = {
  ticketId: string;
  success: boolean;
  error?: string;
};

type BulkTicketResponse = {
  success?: boolean;
  results?: BulkTicketResult[];
  error?: string;
};

function formatHours(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} h`;
}

export default function AdminSupportTicketsPage() {
  const { t } = useTranslation('admin');
  const [items, setItems] = React.useState<TicketRecord[]>([]);
  const [adminUsers, setAdminUsers] = React.useState<AdminUserOption[]>([]);
  const [metrics, setMetrics] = React.useState<DashboardMetrics | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [assigned, setAssigned] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [bulkAssignedAdminId, setBulkAssignedAdminId] = React.useState('');
  const [bulkStatus, setBulkStatus] = React.useState('');
  const getStatusLabel = React.useCallback(
    (value: string) => t(`support.badges.status.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const getCategoryLabel = React.useCallback(
    (value: string) => t(`support.values.categories.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const getPriorityLabel = React.useCallback(
    (value: string) => t(`support.badges.priority.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );

  const loadTickets = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (status) params.set('status', status);
      if (category) params.set('category', category);
      if (priority) params.set('priority', priority);
      if (assigned) params.set('assigned', assigned);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('page', String(page));
      params.set('pageSize', '12');

      const response = await fetch(`/api/admin/support/tickets?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.tickets.loadError'));
      }

      setItems(payload.items || []);
      setAdminUsers(payload.adminUsers || []);
      setMetrics(payload.metrics || null);
      setTotalPages(payload.pagination?.totalPages || 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.tickets.loadError'));
    } finally {
      setLoading(false);
    }
  }, [assigned, category, fromDate, page, priority, search, status, t, toDate]);

  React.useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const toggleTicket = (ticketId: string) => {
    setSelectedIds((current) =>
      current.includes(ticketId)
        ? current.filter((id) => id !== ticketId)
        : [...current, ticketId]
    );
  };

  const runBulkAction = async (action: 'assign' | 'status') => {
    if (selectedIds.length === 0) {
      toast.error(t('support.tickets.selectAtLeastOne'));
      return;
    }

    setBulkBusy(true);
    try {
      const response = await fetch('/api/admin/support/tickets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'assign'
            ? { action, ticketIds: selectedIds, assignedAdminId: bulkAssignedAdminId || null }
            : { action, ticketIds: selectedIds, status: bulkStatus }
        ),
      });

      const payload = (await response.json()) as BulkTicketResponse;
      if (!response.ok) {
        throw new Error(payload?.error || t('support.tickets.bulkError'));
      }

      const results: BulkTicketResult[] = Array.isArray(payload?.results) ? payload.results : [];
      const successCount = results.filter((result: BulkTicketResult) => result.success).length;
      const failureCount = results.length - successCount;
      const fallbackSuccess = action === 'assign'
        ? t('support.tickets.bulkAssignmentUpdated')
        : t('support.tickets.bulkStatusUpdated');

      if (failureCount > 0) {
        const message = t('support.tickets.bulkPartial', { successCount, failureCount });
        if (successCount > 0) {
          toast.success(message);
        } else {
          toast.error(t('support.tickets.bulkError'));
        }
      } else {
        toast.success(fallbackSuccess);
      }
      setSelectedIds([]);
      await loadTickets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.tickets.bulkError'));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('support.tickets.title')}
        description={t('support.tickets.description')}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: t('support.tickets.metrics.openTickets'), value: metrics?.totalOpen ?? t('support.tickets.metrics.empty'), sub: t('support.tickets.metrics.openTicketsSub') },
          { label: t('support.tickets.metrics.unassigned'), value: metrics?.unassigned ?? t('support.tickets.metrics.empty'), sub: t('support.tickets.metrics.unassignedSub') },
          { label: t('support.tickets.metrics.urgent'), value: metrics?.urgent ?? t('support.tickets.metrics.empty'), sub: t('support.tickets.metrics.urgentSub') },
          { label: t('support.tickets.metrics.waitingForSupport'), value: metrics?.waitingForSupport ?? t('support.tickets.metrics.empty'), sub: t('support.tickets.metrics.waitingForSupportSub') },
          { label: t('support.tickets.metrics.waitingForCustomer'), value: metrics?.waitingForCustomer ?? t('support.tickets.metrics.empty'), sub: t('support.tickets.metrics.waitingForCustomerSub') },
          { label: t('support.tickets.metrics.resolvedToday'), value: metrics?.resolvedToday ?? t('support.tickets.metrics.empty'), sub: t('support.tickets.metrics.resolvedTodaySub') },
          { label: t('support.tickets.metrics.avgFirstResponse'), value: formatHours(metrics?.averageFirstResponseHours ?? null), sub: t('support.tickets.metrics.avgFirstResponseSub') },
          { label: t('support.tickets.metrics.avgResolution'), value: formatHours(metrics?.averageResolutionHours ?? null), sub: t('support.tickets.metrics.avgResolutionSub') },
        ].map((metric) => (
          <div key={metric.label} className="metric-card">
            <p className="mb-1 text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
            <p className="text-2xl font-800 text-foreground">{metric.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{metric.sub}</p>
          </div>
        ))}
      </div>

      <SectionCard title={t('support.tickets.filtersTitle')} description={t('support.tickets.filtersDescription')}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-7">
          <SearchField
            placeholder={t('support.tickets.searchPlaceholder')}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            inputClassName="h-10"
          />
          <select className="input-base" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">{t('support.tickets.allStatuses')}</option>
            {SUPPORT_TICKET_STATUSES.map((item) => (
              <option key={item} value={item}>{getStatusLabel(item)}</option>
            ))}
          </select>
          <select className="input-base" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
            <option value="">{t('support.tickets.allCategories')}</option>
            {SUPPORT_TICKET_CATEGORIES.map((item) => (
              <option key={item} value={item}>{getCategoryLabel(item)}</option>
            ))}
          </select>
          <select className="input-base" value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}>
            <option value="">{t('support.tickets.allPriorities')}</option>
            {SUPPORT_TICKET_PRIORITIES.map((item) => (
              <option key={item} value={item}>{getPriorityLabel(item)}</option>
            ))}
          </select>
          <select className="input-base" value={assigned} onChange={(event) => { setAssigned(event.target.value); setPage(1); }}>
            <option value="">{t('support.tickets.allAssignments')}</option>
            <option value="unassigned">{t('support.tickets.unassignedOption')}</option>
            {adminUsers.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.full_name || admin.email || admin.id}
              </option>
            ))}
          </select>
          <input type="date" className="input-base" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} />
          <input type="date" className="input-base" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} />
        </div>
      </SectionCard>

      <SectionCard title={t('support.tickets.bulkTitle')} description={t('support.tickets.bulkDescription')}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
          <select className="input-base" value={bulkAssignedAdminId} onChange={(event) => setBulkAssignedAdminId(event.target.value)}>
            <option value="">{t('support.tickets.assignSelectedTo')}</option>
            {adminUsers.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.full_name || admin.email || admin.id}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => void runBulkAction('assign')} disabled={bulkBusy || selectedIds.length === 0}>
            {t('support.tickets.applyAssignment')}
          </button>
          <select className="input-base" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
            <option value="">{t('support.tickets.changeSelectedStatusTo')}</option>
            {['assigned', 'in_progress', 'waiting_for_customer', 'waiting_for_support', 'resolved'].map((item) => (
              <option key={item} value={item}>
                {getStatusLabel(item)}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => void runBulkAction('status')} disabled={bulkBusy || selectedIds.length === 0 || !bulkStatus}>
            {t('support.tickets.applyStatus')}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={t('support.tickets.sectionTitle')} description={t('support.tickets.sectionDescription')}>
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 size={22} className="animate-spin text-accent" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Search size={20} />
            </div>
              <p className="mt-4 text-sm font-700 text-foreground">{t('support.tickets.emptyTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('support.tickets.emptyDescription')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((ticket) => {
              const ageHours = Math.max(0, Math.round((Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60)));
              const slaTone = ageHours >= 72 ? 'text-negative' : ageHours >= 24 ? 'text-warning' : 'text-muted-foreground';

              return (
                <div key={ticket.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <label className="mt-1 inline-flex items-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedIds.includes(ticket.id)}
                        onChange={() => toggleTicket(ticket.id)}
                      />
                    </label>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-800 uppercase tracking-[0.16em] text-muted-foreground">{ticket.ticket_number}</span>
                        {ticket.support_unread_count > 0 ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-700 text-white">
                            {t('support.tickets.unreadReply')}
                          </span>
                        ) : null}
                        <span className={`text-xs font-700 ${slaTone}`}>{t('support.tickets.ageHours', { hours: ageHours })}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-sm font-700 text-foreground">{ticket.subject}</p>
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {ticket.user_name_snapshot} • {ticket.user_email_snapshot} • {getCategoryLabel(ticket.category)} • {t('support.tickets.updatedAt', { value: formatSupportDateTime(ticket.updated_at) })}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <SupportPriorityBadge priority={ticket.priority} namespace="admin" />
                      <SupportStatusBadge status={ticket.status} namespace="admin" />
                      <Link href={`/admin/support/tickets/${ticket.id}`} className="btn-secondary">
                        <Ticket size={14} />
                        {t('support.tickets.open')}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('support.tickets.pageOf', { page, total: totalPages })}</p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
              {t('support.tickets.previous')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading}>
              {t('support.tickets.next')}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
