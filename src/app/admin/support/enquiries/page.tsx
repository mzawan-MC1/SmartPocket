'use client';

import React from 'react';
import { Loader2, Mail, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import SearchField from '@/components/ui/SearchField';
import SupportConfirmationModal from '@/components/support/SupportConfirmationModal';
import { SupportPriorityBadge, SupportStatusBadge } from '@/components/support/SupportBadges';
import {
  CONTACT_ENQUIRY_PRIORITIES,
  CONTACT_ENQUIRY_STATUSES,
  formatSupportDateTime,
  toTitleLabel,
} from '@/lib/support';

type AdminUserOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type EnquiryRecord = {
  id: string;
  reference_number: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  source_page: string | null;
  status: string;
  priority: string;
  assigned_admin_id: string | null;
  internal_notes: string | null;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  updated_at: string;
};

type EnquiryEvent = {
  id: string;
  actor_name: string | null;
  event_type: string;
  body: string | null;
  is_internal: boolean;
  created_at: string;
};

export default function AdminSupportEnquiriesPage() {
  const { t } = useTranslation('admin');
  const [items, setItems] = React.useState<EnquiryRecord[]>([]);
  const [selected, setSelected] = React.useState<EnquiryRecord | null>(null);
  const [events, setEvents] = React.useState<EnquiryEvent[]>([]);
  const [adminUsers, setAdminUsers] = React.useState<AdminUserOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [replyBody, setReplyBody] = React.useState('');
  const [internalNote, setInternalNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [loadedStatus, setLoadedStatus] = React.useState<string | null>(null);
  const [pendingStatusConfirmation, setPendingStatusConfirmation] = React.useState<{
    status: 'resolved' | 'open' | 'closed';
    title: string;
    description: string;
  } | null>(null);

  const getStatusLabel = React.useCallback(
    (value: string) => t(`support.badges.status.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const getPriorityLabel = React.useCallback(
    (value: string) => t(`support.badges.priority.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const getEventTypeLabel = React.useCallback(
    (value: string) => t(`support.values.eventTypes.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const formatDisplayValue = React.useCallback(
    (value: string | null | undefined) => value || t('support.enquiries.emptyValue'),
    [t]
  );
  const formatDisplayDate = React.useCallback(
    (value: string | null | undefined) => (value ? formatSupportDateTime(value) : t('support.enquiries.emptyValue')),
    [t]
  );

  const loadEnquiryDetail = React.useCallback(async (enquiryId: string) => {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/support/enquiries/${enquiryId}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.enquiries.detailLoadError'));
      }
      setSelected(payload.enquiry || null);
      setLoadedStatus(payload.enquiry?.status || null);
      setEvents(payload.events || []);
      if (payload.adminUsers) {
        setAdminUsers(payload.adminUsers);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.enquiries.detailLoadError'));
    } finally {
      setDetailLoading(false);
    }
  }, [t]);

  const loadEnquiries = React.useCallback(async (preferredId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('page', String(page));
      params.set('pageSize', '12');

      const response = await fetch(`/api/admin/support/enquiries?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.enquiries.loadError'));
      }

      setItems(payload.items || []);
      setAdminUsers(payload.adminUsers || []);
      setTotalPages(payload.pagination?.totalPages || 1);

      const selectedId = preferredId || selected?.id || payload.items?.[0]?.id || null;
      if (selectedId) {
        await loadEnquiryDetail(selectedId);
      } else {
        setSelected(null);
        setLoadedStatus(null);
        setEvents([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.enquiries.loadError'));
    } finally {
      setLoading(false);
    }
  }, [fromDate, loadEnquiryDetail, page, priority, search, selected?.id, status, t, toDate]);

  React.useEffect(() => {
    void loadEnquiries();
  }, [loadEnquiries]);

  const getStatusConfirmationCopy = React.useCallback((currentStatus: string | null, nextStatus: string) => {
    if (currentStatus !== 'resolved' && nextStatus === 'resolved') {
      return {
        status: 'resolved' as const,
        title: t('support.enquiries.confirmResolveTitle'),
        description: t('support.enquiries.confirmResolveDescription'),
      };
    }

    if (currentStatus !== 'closed' && nextStatus === 'closed') {
      return {
        status: 'closed' as const,
        title: t('support.enquiries.confirmCloseTitle'),
        description: t('support.enquiries.confirmCloseDescription'),
      };
    }

    if ((currentStatus === 'resolved' || currentStatus === 'closed') && !['resolved', 'closed'].includes(nextStatus)) {
      return {
        status: 'open' as const,
        title: t('support.enquiries.confirmReopenTitle'),
        description: t('support.enquiries.confirmReopenDescription'),
      };
    }

    return null;
  }, [t]);

  const updateSelected = async (updates: Record<string, unknown>) => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/support/enquiries/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.enquiries.updateError'));
      }
      if (internalNote) {
        setInternalNote('');
      }
      setPendingStatusConfirmation(null);
      await loadEnquiries(selected.id);
      toast.success(t('support.enquiries.updateSuccess'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.enquiries.updateError'));
    } finally {
      setSaving(false);
    }
  };

  const requestSaveSelected = () => {
    if (!selected) return;

    const confirmation = getStatusConfirmationCopy(loadedStatus, selected.status);
    if (confirmation) {
      setPendingStatusConfirmation(confirmation);
      return;
    }

    void updateSelected({
      status: selected.status,
      priority: selected.priority,
      assignedAdminId: selected.assigned_admin_id,
      internalNote,
    });
  };

  const requestStatusAction = (nextStatus: 'resolved' | 'open' | 'closed') => {
    const confirmation = getStatusConfirmationCopy(loadedStatus, nextStatus);
    if (!confirmation) {
      return;
    }

    setPendingStatusConfirmation(confirmation);
  };

  const sendReply = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/support/enquiries/${selected.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyBody, status: 'waiting_for_customer' }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.enquiries.replyError'));
      }
      setReplyBody('');
      await loadEnquiries(selected.id);
      toast.success(t('support.enquiries.replySuccess'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.enquiries.replyError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('support.enquiries.title')}
        description={t('support.enquiries.description')}
        actions={
          <button type="button" className="btn-secondary" onClick={() => void loadEnquiries(selected?.id || undefined)} disabled={loading}>
            <RefreshCw size={14} />
            {t('support.enquiries.refresh')}
          </button>
        }
      />

      <SectionCard title={t('support.enquiries.filtersTitle')} description={t('support.enquiries.filtersDescription')}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <SearchField
            placeholder={t('support.enquiries.searchPlaceholder')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            inputClassName="h-10"
          />
          <select className="input-base" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">{t('support.enquiries.allStatuses')}</option>
            {CONTACT_ENQUIRY_STATUSES.map((item) => (
              <option key={item} value={item}>{getStatusLabel(item)}</option>
            ))}
          </select>
          <select className="input-base" value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}>
            <option value="">{t('support.enquiries.allPriorities')}</option>
            {CONTACT_ENQUIRY_PRIORITIES.map((item) => (
              <option key={item} value={item}>{getPriorityLabel(item)}</option>
            ))}
          </select>
          <input type="date" className="input-base" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} />
          <input type="date" className="input-base" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SectionCard title={t('support.enquiries.inboxTitle')} description={t('support.enquiries.inboxDescription')}>
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Search size={20} />
              </div>
              <p className="mt-4 text-sm font-700 text-foreground">{t('support.enquiries.emptyTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('support.enquiries.emptyDescription')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${selected?.id === item.id ? 'border-accent bg-accent/5' : 'border-border bg-card hover:bg-muted/20'}`}
                  onClick={() => void loadEnquiryDetail(item.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-800 uppercase tracking-[0.16em] text-muted-foreground">
                          {item.reference_number}
                        </span>
                        {item.status === 'new' ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-700 text-white">{t('support.enquiries.unread')}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-700 text-foreground">{item.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.name} • {item.email} • {formatSupportDateTime(item.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SupportPriorityBadge priority={item.priority} namespace="admin" />
                      <SupportStatusBadge status={item.status} namespace="admin" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t('support.enquiries.pageOf', { page, total: totalPages })}</p>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
                {t('support.enquiries.previous')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading}>
                {t('support.enquiries.next')}
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={selected ? selected.reference_number : t('support.enquiries.detailsTitle')}
          description={t('support.enquiries.detailsDescription')}
        >
          {detailLoading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          ) : !selected ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
              {t('support.enquiries.selectPrompt')}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SupportPriorityBadge priority={selected.priority} namespace="admin" />
                  <SupportStatusBadge status={selected.status} namespace="admin" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <div><span className="font-700 text-foreground">{t('support.enquiries.name')}:</span> {selected.name}</div>
                  <div><span className="font-700 text-foreground">{t('support.enquiries.email')}:</span> {selected.email}</div>
                  <div><span className="font-700 text-foreground">{t('support.enquiries.phone')}:</span> {formatDisplayValue(selected.phone)}</div>
                  <div><span className="font-700 text-foreground">{t('support.enquiries.sourcePage')}:</span> {formatDisplayValue(selected.source_page)}</div>
                  <div><span className="font-700 text-foreground">{t('support.enquiries.submitted')}:</span> {formatSupportDateTime(selected.created_at)}</div>
                  <div><span className="font-700 text-foreground">{t('support.enquiries.updated')}:</span> {formatSupportDateTime(selected.updated_at)}</div>
                  <div><span className="font-700 text-foreground">{t('support.enquiries.firstResponse')}:</span> {formatDisplayDate(selected.first_response_at)}</div>
                  <div><span className="font-700 text-foreground">{t('support.enquiries.resolved')}:</span> {formatDisplayDate(selected.resolved_at)}</div>
                </div>
                <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">{t('support.enquiries.message')}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{selected.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <select className="input-base" value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value })}>
                  {CONTACT_ENQUIRY_STATUSES.map((item) => (
                    <option key={item} value={item}>{getStatusLabel(item)}</option>
                  ))}
                </select>
                <select className="input-base" value={selected.priority} onChange={(event) => setSelected({ ...selected, priority: event.target.value })}>
                  {CONTACT_ENQUIRY_PRIORITIES.map((item) => (
                    <option key={item} value={item}>{getPriorityLabel(item)}</option>
                  ))}
                </select>
                <select className="input-base" value={selected.assigned_admin_id || ''} onChange={(event) => setSelected({ ...selected, assigned_admin_id: event.target.value || null })}>
                  <option value="">{t('support.enquiries.unassigned')}</option>
                  {adminUsers.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.full_name || admin.email || admin.id}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                className="input-base min-h-[120px] resize-y"
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                placeholder={t('support.enquiries.internalNotePlaceholder')}
              />

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={requestSaveSelected}
                  disabled={saving}
                >
                  {t('support.enquiries.saveChanges')}
                </button>
                {selected.status !== 'resolved' ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => requestStatusAction('resolved')}
                    disabled={saving}
                  >
                    {t('support.enquiries.markResolved')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => requestStatusAction('open')}
                    disabled={saving}
                  >
                    {t('support.enquiries.reopen')}
                  </button>
                )}
                {selected.status !== 'closed' ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => requestStatusAction('closed')}
                    disabled={saving}
                  >
                    {t('support.enquiries.close')}
                  </button>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-accent" />
                  <p className="text-sm font-700 text-foreground">{t('support.enquiries.replyTitle')}</p>
                </div>
                <textarea
                  className="input-base mt-3 min-h-[140px] resize-y"
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder={t('support.enquiries.replyPlaceholder')}
                />
                <div className="mt-3 flex justify-end">
                  <button type="button" className="btn-primary" onClick={() => void sendReply()} disabled={saving || replyBody.trim().length < 2}>
                    {t('support.enquiries.sendReply')}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-700 text-foreground">{t('support.enquiries.timelineTitle')}</p>
                <div className="mt-3 space-y-3">
                  {events.map((event) => (
                    <div key={event.id} className={`rounded-2xl border p-3 ${event.is_internal ? 'border-warning/20 bg-warning-soft/40' : 'border-border bg-muted/20'}`}>
                      <p className="text-sm font-600 text-foreground">
                        {event.actor_name || t('support.enquiries.systemActor')} • {getEventTypeLabel(event.event_type)}
                      </p>
                      {event.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{event.body}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">{formatSupportDateTime(event.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
      <SupportConfirmationModal
        open={Boolean(pendingStatusConfirmation)}
        title={pendingStatusConfirmation?.title || ''}
        description={pendingStatusConfirmation?.description || ''}
        confirmLabel={t('support.enquiries.confirmAction')}
        cancelLabel={t('support.enquiries.cancelAction')}
        pending={saving}
        onClose={() => setPendingStatusConfirmation(null)}
        onConfirm={() => {
          if (!selected || !pendingStatusConfirmation) return;
          void updateSelected({
            status: pendingStatusConfirmation.status,
            priority: selected.priority,
            assignedAdminId: selected.assigned_admin_id,
            internalNote,
          });
        }}
      />
    </div>
  );
}
