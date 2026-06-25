'use client';

import React from 'react';
import Link from 'next/link';
import { Loader2, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import SearchField from '@/components/ui/SearchField';
import { SupportPriorityBadge, SupportStatusBadge } from '@/components/support/SupportBadges';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORT_TICKET_CATEGORIES, SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES, formatSupportDateTime, toTitleLabel } from '@/lib/support';

type TicketListItem = {
  id: string;
  ticket_number: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  customer_unread_count: number;
};

export default function SupportPage() {
  const { t } = useTranslation('portal');
  const { isRTL } = useLanguage();
  const [items, setItems] = React.useState<TicketListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
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
      params.set('page', String(page));
      params.set('pageSize', '10');

      const response = await fetch(`/api/support/tickets?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.list.loadError'));
      }

      setItems(payload.items || []);
      setTotalPages(payload.pagination?.totalPages || 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.list.loadError'));
    } finally {
      setLoading(false);
    }
  }, [category, page, priority, search, status, t]);

  React.useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  return (
    <AppLayout activeRoute="/support">
      <div className="page-section page-shell-readable">
        <PageHeader
          title={t('support.list.title')}
          description={t('support.list.description')}
          actions={
            <div className={`flex w-full ${isRTL ? 'justify-start' : 'justify-end'}`}>
              <Link href="/support/new" className="btn-primary">
                <Plus size={16} />
                {t('support.list.newTicket')}
              </Link>
            </div>
          }
        />

        <SectionCard
          title={t('support.list.filtersTitle')}
          description={t('support.list.filtersDescription')}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <SearchField
              placeholder={t('support.list.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              inputClassName="h-10"
            />
            <select className="input-base" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="">{t('support.list.allStatuses')}</option>
              {SUPPORT_TICKET_STATUSES.map((item) => (
                <option key={item} value={item}>{getStatusLabel(item)}</option>
              ))}
            </select>
            <select className="input-base" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
              <option value="">{t('support.list.allCategories')}</option>
              {SUPPORT_TICKET_CATEGORIES.map((item) => (
                <option key={item} value={item}>{getCategoryLabel(item)}</option>
              ))}
            </select>
            <select className="input-base" value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}>
              <option value="">{t('support.list.allPriorities')}</option>
              {SUPPORT_TICKET_PRIORITIES.map((item) => (
                <option key={item} value={item}>{getPriorityLabel(item)}</option>
              ))}
            </select>
          </div>
        </SectionCard>

        <SectionCard
          title={t('support.list.sectionTitle')}
          description={t('support.list.sectionDescription')}
        >
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Search size={20} />
              </div>
              <p className="mt-4 text-sm font-700 text-foreground">{t('support.list.emptyTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('support.list.emptyDescription')}</p>
              <Link href="/support/new" className="btn-primary mt-4 inline-flex">
                <Plus size={16} />
                {t('support.list.newTicket')}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/support/${ticket.id}`}
                  className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/20"
                >
                  <div className={`flex flex-wrap items-start justify-between gap-3 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className={`flex flex-wrap items-center gap-2 ${isRTL ? 'flex-row-reverse justify-start' : ''}`}>
                        <span className="text-xs font-800 uppercase tracking-[0.16em] text-muted-foreground" dir="ltr">
                          {ticket.ticket_number}
                        </span>
                        {ticket.customer_unread_count > 0 ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-700 text-white">
                            {t('support.list.newReply')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-700 text-foreground text-start" dir="auto">{ticket.subject}</p>
                      <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground ${isRTL ? 'flex-row-reverse justify-start' : ''}`}>
                        <span>{getCategoryLabel(ticket.category)}</span>
                        <span aria-hidden="true">{'\u2022'}</span>
                        <span>{t('support.list.updatedLabel')}</span>
                        <bdi dir="ltr">{formatSupportDateTime(ticket.updated_at)}</bdi>
                      </div>
                    </div>
                    <div className={`flex flex-wrap items-center gap-2 ${isRTL ? 'sm:justify-start' : 'sm:justify-end'}`}>
                      <SupportPriorityBadge priority={ticket.priority} namespace="portal" />
                      <SupportStatusBadge status={ticket.status} namespace="portal" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className={`mt-4 flex items-center gap-3 ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
            <p className="text-xs text-muted-foreground">{t('support.list.pageOf', { page, total: totalPages })}</p>
            <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button type="button" className="btn-secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
                {t('support.list.previous')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading}>
                {t('support.list.next')}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
