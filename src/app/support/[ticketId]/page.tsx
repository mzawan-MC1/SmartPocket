'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Lock, MessageSquare, Paperclip, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
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
  const { t } = useTranslation('portal');
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
  const getCategoryLabel = React.useCallback(
    (value: string) => t(`support.values.categories.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const formatDisplayValue = React.useCallback(
    (value: string | null | undefined) => value || t('support.detail.emptyValue'),
    [t]
  );
  const formatDisplayDate = React.useCallback(
    (value: string | null | undefined) => (value ? formatSupportDateTime(value) : t('support.detail.emptyValue')),
    [t]
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

  return (
    <AppLayout activeRoute="/support">
      <div className="page-section page-shell-readable">
        {loading || !ticket ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : (
          <>
            <PageHeader
              title={ticket.subject}
              description={t('support.detail.headerDescription', {
                ticketNumber: ticket.ticket_number,
                createdAt: formatSupportDateTime(ticket.created_at),
              })}
              actions={
                <div className="flex flex-wrap items-center gap-2">
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
              }
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_360px]">
              <div className="space-y-6">
                <SectionCard
                  title={t('support.detail.conversationTitle')}
                  description={t('support.detail.conversationDescription')}
                >
                  <div className="space-y-4">
                    {ticket.messages.map((message) => (
                      <div key={message.id} className={`rounded-2xl border p-4 ${message.sender_role === 'admin' ? 'border-accent/20 bg-accent/5' : 'border-border bg-card'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-700 text-foreground">
                            {message.sender_name} <span className="font-500 text-muted-foreground">({getRoleLabel(message.sender_role)})</span>
                          </p>
                          <p className="text-xs text-muted-foreground">{formatSupportDateTime(message.created_at)}</p>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{message.body}</p>
                        {message.attachments.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {message.attachments.map((attachment) => (
                              <button
                                key={attachment.id}
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-600 text-foreground transition-colors hover:bg-muted"
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
                                    className="inline-flex items-center gap-2 rounded-full border border-negative/20 bg-negative-soft/40 px-3 py-1.5 text-xs font-600 text-negative transition-colors hover:bg-negative-soft/60"
                                    onClick={() => setAttachmentToDelete({ id: attachment.id, name: attachment.file_name })}
                                  >
                                    <Trash2 size={12} />
                                    {t('support.detail.deleteAttachment')}
                                  </button>
                                ))
                              : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title={t('support.detail.replyTitle')}
                  description={t('support.detail.replyDescription')}
                >
                  <div className="space-y-4">
                    <textarea
                      className="input-base min-h-[160px] resize-y"
                      value={replyMessage}
                      onChange={(event) => setReplyMessage(event.target.value)}
                      placeholder={t('support.detail.replyPlaceholder')}
                    />
                    <SupportAttachmentUploader
                      files={replyFiles}
                      onChange={setReplyFiles}
                      uploadProgress={uploadProgress}
                      disabled={sending || ['closed'].includes(ticket.status)}
                    />
                    <div className="flex justify-end">
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

              <div className="space-y-6">
                <SectionCard
                  title={t('support.detail.summaryTitle')}
                  description={t('support.detail.summaryDescription')}
                >
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <SupportStatusBadge status={ticket.status} namespace="portal" />
                      <SupportPriorityBadge priority={ticket.priority} namespace="portal" />
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">{t('support.detail.category')}</p>
                      <p className="mt-1 text-foreground">{getCategoryLabel(ticket.category)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">{t('support.detail.relatedPage')}</p>
                      <p className="mt-1 text-foreground">{formatDisplayValue(ticket.related_path)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">{t('support.detail.errorCode')}</p>
                      <p className="mt-1 text-foreground">{formatDisplayValue(ticket.error_code)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">{t('support.detail.firstResponse')}</p>
                      <p className="mt-1 text-foreground">{formatDisplayDate(ticket.first_response_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">{t('support.detail.resolved')}</p>
                      <p className="mt-1 text-foreground">{formatDisplayDate(ticket.resolved_at)}</p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title={t('support.detail.timelineTitle')}
                  description={t('support.detail.timelineDescription')}
                >
                  <div className="space-y-3">
                    {ticket.events.map((event) => (
                      <div key={event.id} className="rounded-2xl border border-border bg-card p-3">
                        <p className="text-sm font-600 text-foreground">{event.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatSupportDateTime(event.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title={t('support.detail.securityTitle')}
                  description={t('support.detail.securityDescription')}
                >
                  <div className="flex items-start gap-3 rounded-2xl border border-info/20 bg-info-soft/50 p-4 text-sm text-foreground">
                    <Lock size={18} className="mt-0.5 text-info" />
                    <p>{t('support.detail.securityBody')}</p>
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
