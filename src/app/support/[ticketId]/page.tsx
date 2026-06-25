'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Lock, MessageSquare, Paperclip, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import SectionCard from '@/components/ui/SectionCard';
import SupportAttachmentUploader, { type PendingSupportFile } from '@/components/support/SupportAttachmentUploader';
import { SupportPriorityBadge, SupportStatusBadge } from '@/components/support/SupportBadges';
import SupportConfirmationModal from '@/components/support/SupportConfirmationModal';
import { canReopenTicket, formatSupportDateTime, toTitleLabel, type FinalizedSupportUpload } from '@/lib/support';
import { uploadSupportAttachments } from '@/lib/support-attachments';
import { useAuth } from '@/contexts/AuthContext';

type TicketDetail = {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  related_path: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  messages: Array<{
    id: string;
    sender_name: string;
    sender_role: string;
    body: string;
    created_at: string;
    attachments: Array<{
      id: string;
      file_name: string;
      mime_type: string;
      file_size_bytes: number;
    }>;
  }>;
  events: Array<{
    id: string;
    description: string;
    created_at: string;
  }>;
};

export default function SupportTicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation(['portal', 'common']);
  const [ticket, setTicket] = React.useState<TicketDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [replyMessage, setReplyMessage] = React.useState('');
  const [replyFiles, setReplyFiles] = React.useState<PendingSupportFile[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [sending, setSending] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<'close' | 'reopen' | null>(null);
  const [actingOnTicket, setActingOnTicket] = React.useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = React.useState<{ id: string; name: string } | null>(null);
  const [deletingAttachment, setDeletingAttachment] = React.useState(false);
  const getRoleLabel = React.useCallback(
    (value: string) => t(`support.values.roles.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const getMessageRoleBadgeLabel = React.useCallback(
    (value: string) =>
      value === 'admin'
        ? t('support.detail.roleSupport', { defaultValue: 'Support' })
        : t('support.detail.roleCustomer', { defaultValue: 'Customer' }),
    [t]
  );
  const getCategoryLabel = React.useCallback(
    (value: string) => t(`support.values.categories.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const formatDisplayValue = React.useCallback(
    (value: string | null | undefined) => value || '—',
    []
  );
  const formatDisplayDate = React.useCallback(
    (value: string | null | undefined) => (value ? formatSupportDateTime(value) : '—'),
    []
  );

  const loadTicket = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/support/tickets/${params.ticketId}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.detail.loadError'));
      }
      setTicket(payload.ticket || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.detail.loadError'));
      router.push('/support');
    } finally {
      setLoading(false);
    }
  }, [params.ticketId, router, t]);

  React.useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  const handleReply = async () => {
    if (!ticket || !user?.id) return;

    setSending(true);
    try {
      let finalizedUploads: FinalizedSupportUpload[] = [];

      if (replyFiles.length > 0) {
        finalizedUploads = await uploadSupportAttachments({
          ticketId: ticket.id,
          context: 'customer_reply',
          files: replyFiles.map((item) => item.file),
          onFileProgress: (index, progress) => {
            const fileId = replyFiles[index]?.id;
            if (!fileId) return;
            setUploadProgress((current) => ({ ...current, [fileId]: progress }));
          },
        });
      }

      const response = await fetch(`/api/support/tickets/${ticket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyMessage,
          uploads: finalizedUploads,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.detail.replyError'));
      }

      toast.success(t('support.detail.replySent'));
      setReplyMessage('');
      setReplyFiles([]);
      setUploadProgress({});
      await loadTicket();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.detail.replyError'));
    } finally {
      setSending(false);
    }
  };

  const runTicketAction = async (action: 'close' | 'reopen') => {
    if (!ticket) return;
    setActingOnTicket(true);
    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.detail.actionError'));
      }
      toast.success(action === 'close' ? t('support.detail.closed') : t('support.detail.reopened'));
      setPendingAction(null);
      await loadTicket();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.detail.actionError'));
    } finally {
      setActingOnTicket(false);
    }
  };

  const openAttachment = async (attachmentId: string) => {
    try {
      const response = await fetch(`/api/support/attachments/${attachmentId}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.detail.attachmentError'));
      }
      window.open(payload.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.detail.attachmentError'));
    }
  };

  const deleteAttachment = async () => {
    if (!ticket || !attachmentToDelete) return;
    setDeletingAttachment(true);
    try {
      const response = await fetch(`/api/support/attachments/${attachmentToDelete.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.detail.deleteAttachmentError'));
      }
      toast.success(t('support.detail.deleteAttachmentSuccess'));
      setAttachmentToDelete(null);
      await loadTicket();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.detail.deleteAttachmentError'));
    } finally {
      setDeletingAttachment(false);
    }
  };

  const canReopen = ticket ? canReopenTicket(ticket.resolved_at, ticket.closed_at) : false;
  const orderedEvents = React.useMemo(
    () =>
      ticket?.events
        ? [...ticket.events].sort(
            (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
          )
        : [],
    [ticket?.events]
  );

  return (
    <AppLayout activeRoute="/support">
      <div className="page-section page-shell-readable space-y-5">
        {loading || !ticket ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-border bg-card px-5 py-4 shadow-card-sm sm:px-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <Link href="/support" className="btn-secondary w-fit">
                    <ArrowLeft size={16} />
                    {t('actions.back', { ns: 'common' })}
                  </Link>
                  <div className="space-y-2">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <h1 className="text-2xl font-800 tracking-tight text-foreground sm:text-3xl">
                          {ticket.subject}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          {t('support.detail.headerDescription', {
                            ticketNumber: ticket.ticket_number,
                            createdAt: formatSupportDateTime(ticket.created_at),
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <SupportStatusBadge status={ticket.status} namespace="portal" />
                        <SupportPriorityBadge priority={ticket.priority} namespace="portal" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  {ticket.status === 'resolved' ? (
                    <button type="button" className="btn-secondary" onClick={() => setPendingAction('close')}>
                      <XCircle size={16} />
                      {t('support.detail.closeTicket')}
                    </button>
                  ) : null}
                  {['resolved', 'closed'].includes(ticket.status) && canReopen ? (
                    <button type="button" className="btn-secondary" onClick={() => setPendingAction('reopen')}>
                      <RotateCcw size={16} />
                      {t('support.detail.reopen')}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(300px,0.95fr)]">
              <div className="space-y-5">
                <SectionCard
                  title={t('support.detail.conversationTitle')}
                  description={t('support.detail.conversationDescription')}
                >
                  <div className="space-y-3.5">
                    {ticket.messages.map((message) => (
                      <article
                        key={message.id}
                        className={`rounded-2xl border px-4 py-3.5 shadow-card-sm ${
                          message.sender_role === 'admin'
                            ? 'border-accent/15 bg-accent/5'
                            : 'border-border bg-background'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-700 text-foreground">{message.sender_name}</p>
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-700 uppercase tracking-[0.14em] ${
                                  message.sender_role === 'admin'
                                    ? 'border-accent/20 bg-accent/10 text-accent'
                                    : 'border-border bg-muted/70 text-muted-foreground'
                                }`}
                              >
                                {getMessageRoleBadgeLabel(message.sender_role)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {getRoleLabel(message.sender_role)}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">{formatSupportDateTime(message.created_at)}</p>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                          {message.body}
                        </p>
                        {message.attachments.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.attachments.map((attachment) => (
                              <button
                                key={attachment.id}
                                type="button"
                                className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-muted/45 px-3 text-xs font-600 text-foreground transition-colors hover:bg-muted"
                                onClick={() => void openAttachment(attachment.id)}
                              >
                                <Paperclip size={12} />
                                {attachment.file_name}
                              </button>
                            ))}
                            {message.sender_role === 'user'
                              ? message.attachments.map((attachment) => (
                                  <button
                                    key={`${attachment.id}-delete`}
                                    type="button"
                                    className="inline-flex h-8 items-center gap-2 rounded-full border border-negative/20 bg-negative-soft/40 px-3 text-xs font-600 text-negative transition-colors hover:bg-negative-soft/60"
                                    onClick={() => setAttachmentToDelete({ id: attachment.id, name: attachment.file_name })}
                                  >
                                    <Trash2 size={12} />
                                    {t('support.detail.deleteAttachment')}
                                  </button>
                                ))
                              : null}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title={t('support.detail.replyTitle')}
                  description={t('support.detail.replyDescription')}
                >
                  <div className="space-y-3.5">
                    <textarea
                      className="input-base min-h-[132px] resize-y"
                      value={replyMessage}
                      onChange={(event) => setReplyMessage(event.target.value)}
                      placeholder={t('support.detail.replyPlaceholder')}
                    />
                    <div className="rounded-2xl border border-border/70 bg-muted/15 p-3">
                      <SupportAttachmentUploader
                        files={replyFiles}
                        onChange={setReplyFiles}
                        uploadProgress={uploadProgress}
                        disabled={sending || ['closed'].includes(ticket.status)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void handleReply()}
                        disabled={sending || replyMessage.trim().length < 2 || ['closed'].includes(ticket.status)}
                      >
                        {sending ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            {t('support.detail.sendingReply')}
                          </>
                        ) : (
                          <>
                            <MessageSquare size={16} />
                            {t('support.detail.sendReply')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </SectionCard>
              </div>

              <div className="space-y-5 xl:sticky xl:top-6">
                <SectionCard
                  title={t('support.detail.summaryTitle')}
                  description={t('support.detail.summaryDescription')}
                >
                  <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <SupportStatusBadge status={ticket.status} namespace="portal" />
                      <SupportPriorityBadge priority={ticket.priority} namespace="portal" />
                    </div>
                    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,120px)_1fr]">
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                        {t('support.detail.category')}
                      </p>
                      <p className="text-sm text-foreground">{getCategoryLabel(ticket.category)}</p>
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                        {t('support.detail.relatedPage')}
                      </p>
                      <p className="truncate text-sm text-foreground">{formatDisplayValue(ticket.related_path)}</p>
                    </div>
                    <div className="border-t border-border/70" />
                    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,120px)_1fr]">
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                        {t('support.detail.errorCode')}
                      </p>
                      <p className="text-sm text-foreground">{formatDisplayValue(ticket.error_code)}</p>
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                        {t('support.detail.firstResponse')}
                      </p>
                      <p className="text-sm text-foreground">{formatDisplayDate(ticket.first_response_at)}</p>
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                        {t('support.detail.resolved')}
                      </p>
                      <p className="text-sm text-foreground">{formatDisplayDate(ticket.resolved_at)}</p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title={t('support.detail.timelineTitle')}
                  description={t('support.detail.timelineDescription')}
                >
                  <div className="space-y-0">
                    {orderedEvents.map((event, index) => (
                      <div key={event.id} className="relative ps-6 pb-4 last:pb-0">
                        {index < orderedEvents.length - 1 ? (
                          <span className="absolute left-[0.44rem] top-4 h-[calc(100%-0.25rem)] w-px bg-border" />
                        ) : null}
                        <span className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-accent/20 bg-card">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                        </span>
                        <div className="space-y-1">
                          <p className="text-sm font-600 leading-5 text-foreground">{event.description}</p>
                          <p className="text-xs text-muted-foreground">{formatSupportDateTime(event.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title={t('support.detail.securityTitle')}
                  description={t('support.detail.securityDescription')}
                >
                  <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                    <Lock size={16} className="mt-0.5 shrink-0 text-info" />
                    <p className="leading-6">{t('support.detail.securityBody')}</p>
                  </div>
                </SectionCard>
              </div>
            </div>
          </>
        )}
      </div>
      <SupportConfirmationModal
        open={pendingAction === 'close'}
        title={t('support.detail.confirmCloseTitle')}
        description={t('support.detail.confirmCloseDescription')}
        confirmLabel={t('support.detail.confirmAction')}
        cancelLabel={t('support.detail.cancelAction')}
        pending={actingOnTicket}
        onClose={() => setPendingAction(null)}
        onConfirm={() => void runTicketAction('close')}
      />
      <SupportConfirmationModal
        open={pendingAction === 'reopen'}
        title={t('support.detail.confirmReopenTitle')}
        description={t('support.detail.confirmReopenDescription')}
        confirmLabel={t('support.detail.confirmAction')}
        cancelLabel={t('support.detail.cancelAction')}
        pending={actingOnTicket}
        onClose={() => setPendingAction(null)}
        onConfirm={() => void runTicketAction('reopen')}
      />
      <SupportConfirmationModal
        open={Boolean(attachmentToDelete)}
        title={t('support.detail.confirmDeleteAttachmentTitle')}
        description={t('support.detail.confirmDeleteAttachmentDescription', {
          name: attachmentToDelete?.name || '',
        })}
        confirmLabel={t('support.detail.confirmAction')}
        cancelLabel={t('support.detail.cancelAction')}
        pending={deletingAttachment}
        onClose={() => setAttachmentToDelete(null)}
        onConfirm={() => void deleteAttachment()}
      />
    </AppLayout>
  );
}
