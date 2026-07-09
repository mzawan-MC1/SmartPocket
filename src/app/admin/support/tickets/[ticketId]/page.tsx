'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Loader2, Mail, MessageSquare, Paperclip, Shield, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import SupportAttachmentUploader, { type PendingSupportFile } from '@/components/support/SupportAttachmentUploader';
import { SupportPriorityBadge, SupportStatusBadge } from '@/components/support/SupportBadges';
import SupportConfirmationModal from '@/components/support/SupportConfirmationModal';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  formatSupportDateTime,
  toTitleLabel,
  type FinalizedSupportUpload,
} from '@/lib/support';
import { openSignedResourceUrl } from '@/lib/signed-resource-navigation';
import { uploadSupportAttachments } from '@/lib/support-attachments';

type AdminUserOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type TicketDetail = {
  id: string;
  ticket_number: string;
  user_id: string;
  user_name_snapshot: string;
  user_email_snapshot: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assigned_admin_id: string | null;
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
    is_internal: boolean;
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
    event_type: string;
    is_internal: boolean;
    created_at: string;
  }>;
};

export default function AdminSupportTicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const { t } = useTranslation(['admin', 'common']);
  const [ticket, setTicket] = React.useState<TicketDetail | null>(null);
  const [adminUsers, setAdminUsers] = React.useState<AdminUserOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingSummary, setSavingSummary] = React.useState(false);
  const [sendingReply, setSendingReply] = React.useState(false);
  const [addingNote, setAddingNote] = React.useState(false);
  const [loadedTicketStatus, setLoadedTicketStatus] = React.useState<string | null>(null);
  const [pendingStatusConfirmation, setPendingStatusConfirmation] = React.useState<{
    title: string;
    description: string;
  } | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = React.useState<{ id: string; name: string } | null>(null);
  const [deletingAttachment, setDeletingAttachment] = React.useState(false);
  const [replyBody, setReplyBody] = React.useState('');
  const [noteBody, setNoteBody] = React.useState('');
  const [replyFiles, setReplyFiles] = React.useState<PendingSupportFile[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});

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
  const getRoleLabel = React.useCallback(
    (value: string) => t(`support.values.roles.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const formatDisplayValue = React.useCallback(
    (value: string | null | undefined) => value || t('support.ticketDetail.emptyValue'),
    [t]
  );
  const formatDisplayDate = React.useCallback(
    (value: string | null | undefined) => (value ? formatSupportDateTime(value) : t('support.ticketDetail.emptyValue')),
    [t]
  );

  const loadTicket = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/support/tickets/${params.ticketId}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.ticketDetail.loadError'));
      }
      setTicket(payload.ticket || null);
      setLoadedTicketStatus(payload.ticket?.status || null);
      setAdminUsers(payload.adminUsers || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.ticketDetail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [params.ticketId, t]);

  React.useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  const getStatusConfirmationCopy = React.useCallback((currentStatus: string | null, nextStatus: string) => {
    if (currentStatus !== 'resolved' && nextStatus === 'resolved') {
      return {
        title: t('support.ticketDetail.confirmResolveTitle'),
        description: t('support.ticketDetail.confirmResolveDescription'),
      };
    }

    if (currentStatus !== 'closed' && nextStatus === 'closed') {
      return {
        title: t('support.ticketDetail.confirmCloseTitle'),
        description: t('support.ticketDetail.confirmCloseDescription'),
      };
    }

    if ((currentStatus === 'resolved' || currentStatus === 'closed') && !['resolved', 'closed'].includes(nextStatus)) {
      return {
        title: t('support.ticketDetail.confirmReopenTitle'),
        description: t('support.ticketDetail.confirmReopenDescription'),
      };
    }

    return null;
  }, [t]);

  const saveSummary = async () => {
    if (!ticket) return;
    setSavingSummary(true);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: ticket.status,
          category: ticket.category,
          priority: ticket.priority,
          assignedAdminId: ticket.assigned_admin_id,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.ticketDetail.saveError'));
      }
      toast.success(t('support.ticketDetail.saveSuccess'));
      setPendingStatusConfirmation(null);
      await loadTicket();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.ticketDetail.saveError'));
    } finally {
      setSavingSummary(false);
    }
  };

  const requestSaveSummary = () => {
    if (!ticket) return;

    const confirmation = getStatusConfirmationCopy(loadedTicketStatus, ticket.status);
    if (confirmation) {
      setPendingStatusConfirmation(confirmation);
      return;
    }

    void saveSummary();
  };

  const sendReply = async () => {
    if (!ticket) return;
    setSendingReply(true);
    try {
      let finalizedUploads: FinalizedSupportUpload[] = [];

      if (replyFiles.length > 0) {
        finalizedUploads = await uploadSupportAttachments({
          ticketId: ticket.id,
          context: 'admin_reply',
          files: replyFiles.map((item) => item.file),
          onFileProgress: (index, progress) => {
            const fileId = replyFiles[index]?.id;
            if (!fileId) return;
            setUploadProgress((current) => ({ ...current, [fileId]: progress }));
          },
        });
      }

      const response = await fetch(`/api/admin/support/tickets/${ticket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'reply',
          message: replyBody,
          uploads: finalizedUploads,
          status: 'waiting_for_customer',
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.ticketDetail.replyError'));
      }

      setReplyBody('');
      setReplyFiles([]);
      setUploadProgress({});
      toast.success(t('support.ticketDetail.replySuccess'));
      await loadTicket();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.ticketDetail.replyError'));
    } finally {
      setSendingReply(false);
    }
  };

  const addInternalNote = async () => {
    if (!ticket) return;
    setAddingNote(true);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'internal_note',
          message: noteBody,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.ticketDetail.noteError'));
      }

      setNoteBody('');
      toast.success(t('support.ticketDetail.noteSuccess'));
      await loadTicket();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.ticketDetail.noteError'));
    } finally {
      setAddingNote(false);
    }
  };

  const openAttachment = async (attachmentId: string) => {
    try {
      const response = await fetch(`/api/support/attachments/${attachmentId}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.ticketDetail.attachmentError'));
      }
      openSignedResourceUrl(payload.signedUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.ticketDetail.attachmentError'));
    }
  };

  const deleteAttachment = async () => {
    if (!attachmentToDelete) return;
    setDeletingAttachment(true);
    try {
      const response = await fetch(`/api/support/attachments/${attachmentToDelete.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.ticketDetail.deleteAttachmentError'));
      }
      toast.success(t('support.ticketDetail.deleteAttachmentSuccess'));
      setAttachmentToDelete(null);
      await loadTicket();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.ticketDetail.deleteAttachmentError'));
    } finally {
      setDeletingAttachment(false);
    }
  };

  return (
    <div className="space-y-6">
      {loading || !ticket ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      ) : (
        <>
          <PageHeader
            title={ticket.subject}
            description={`${ticket.ticket_number} • ${ticket.user_name_snapshot} • ${ticket.user_email_snapshot}`}
            badge={(
              <Link href="/admin/support/tickets" className="btn-secondary">
                <ArrowLeft size={16} />
                {t('actions.back', { ns: 'common' })}
              </Link>
            )}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SupportPriorityBadge priority={ticket.priority} namespace="admin" />
                <SupportStatusBadge status={ticket.status} namespace="admin" />
              </div>
            }
          />

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,2fr)_420px]">
            <div className="space-y-6">
              <SectionCard
                title={t('support.ticketDetail.conversationTitle')}
                description={t('support.ticketDetail.conversationDescription')}
              >
                <div className="space-y-4">
                  {ticket.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-2xl border p-4 ${
                        message.is_internal
                          ? 'border-warning/20 bg-warning-soft/40'
                          : message.sender_role === 'admin'
                            ? 'border-accent/20 bg-accent/5'
                            : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-700 text-foreground">
                          {message.sender_name}{' '}
                          <span className="font-500 text-muted-foreground">
                            ({message.is_internal ? t('support.ticketDetail.internalNoteLabel') : getRoleLabel(message.sender_role)})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">{formatSupportDateTime(message.created_at)}</p>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{message.body}</p>
                      {message.attachments.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {message.attachments.map((attachment) => (
                            <React.Fragment key={attachment.id}>
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-600 text-foreground transition-colors hover:bg-muted"
                                onClick={() => void openAttachment(attachment.id)}
                              >
                                <Paperclip size={12} />
                                {attachment.file_name}
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full border border-negative/20 bg-negative-soft/40 px-3 py-1.5 text-xs font-600 text-negative transition-colors hover:bg-negative-soft/60"
                                onClick={() => setAttachmentToDelete({ id: attachment.id, name: attachment.file_name })}
                              >
                                <Trash2 size={12} />
                                {t('support.ticketDetail.deleteAttachment')}
                              </button>
                            </React.Fragment>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title={t('support.ticketDetail.replyTitle')}
                description={t('support.ticketDetail.replyDescription')}
              >
                <div className="space-y-4">
                  <textarea
                    className="input-base min-h-[160px] resize-y"
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder={t('support.ticketDetail.replyPlaceholder')}
                  />
                  <SupportAttachmentUploader
                    files={replyFiles}
                    onChange={setReplyFiles}
                    uploadProgress={uploadProgress}
                    disabled={sendingReply}
                    namespace="admin"
                  />
                  <div className="flex justify-end">
                    <button type="button" className="btn-primary" onClick={() => void sendReply()} disabled={sendingReply || replyBody.trim().length < 2}>
                      {sendingReply ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          {t('support.ticketDetail.sendingReply')}
                        </>
                      ) : (
                        <>
                          <Mail size={16} />
                          {t('support.ticketDetail.sendReply')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title={t('support.ticketDetail.internalNotesTitle')}
                description={t('support.ticketDetail.internalNotesDescription')}
              >
                <div className="space-y-4">
                  <textarea
                    className="input-base min-h-[120px] resize-y"
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder={t('support.ticketDetail.notePlaceholder')}
                  />
                  <div className="flex justify-end">
                    <button type="button" className="btn-secondary" onClick={() => void addInternalNote()} disabled={addingNote || noteBody.trim().length < 2}>
                      {addingNote ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          {t('support.ticketDetail.saving')}
                        </>
                      ) : (
                        <>
                          <MessageSquare size={16} />
                          {t('support.ticketDetail.addInternalNote')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard
                title={t('support.ticketDetail.summaryTitle')}
                description={t('support.ticketDetail.summaryDescription')}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-1">
                    <select className="input-base" value={ticket.status} onChange={(event) => setTicket({ ...ticket, status: event.target.value })}>
                      {SUPPORT_TICKET_STATUSES.map((item) => (
                        <option key={item} value={item}>{getStatusLabel(item)}</option>
                      ))}
                    </select>
                    <select className="input-base" value={ticket.category} onChange={(event) => setTicket({ ...ticket, category: event.target.value })}>
                      {SUPPORT_TICKET_CATEGORIES.map((item) => (
                        <option key={item} value={item}>{getCategoryLabel(item)}</option>
                      ))}
                    </select>
                    <select className="input-base" value={ticket.priority} onChange={(event) => setTicket({ ...ticket, priority: event.target.value })}>
                      {SUPPORT_TICKET_PRIORITIES.map((item) => (
                        <option key={item} value={item}>{getPriorityLabel(item)}</option>
                      ))}
                    </select>
                    <select className="input-base" value={ticket.assigned_admin_id || ''} onChange={(event) => setTicket({ ...ticket, assigned_admin_id: event.target.value || null })}>
                      <option value="">{t('support.tickets.unassignedOption')}</option>
                      {adminUsers.map((admin) => (
                        <option key={admin.id} value={admin.id}>
                          {admin.full_name || admin.email || admin.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.customer')}:</span> {ticket.user_name_snapshot}</div>
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.email')}:</span> {ticket.user_email_snapshot}</div>
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.created')}:</span> {formatSupportDateTime(ticket.created_at)}</div>
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.updated')}:</span> {formatSupportDateTime(ticket.updated_at)}</div>
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.firstResponse')}:</span> {formatDisplayDate(ticket.first_response_at)}</div>
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.resolved')}:</span> {formatDisplayDate(ticket.resolved_at)}</div>
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.closed')}:</span> {formatDisplayDate(ticket.closed_at)}</div>
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.relatedPage')}:</span> {formatDisplayValue(ticket.related_path)}</div>
                    <div><span className="font-700 text-foreground">{t('support.ticketDetail.errorCode')}:</span> {formatDisplayValue(ticket.error_code)}</div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" className="btn-secondary" onClick={requestSaveSummary} disabled={savingSummary}>
                      {savingSummary ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          {t('support.ticketDetail.saving')}
                        </>
                      ) : (
                        t('support.ticketDetail.saveSummary')
                      )}
                    </button>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title={t('support.ticketDetail.timelineTitle')}
                description={t('support.ticketDetail.timelineDescription')}
              >
                <div className="space-y-3">
                  {ticket.events.map((event) => (
                    <div
                      key={event.id}
                      className={`rounded-2xl border p-3 ${event.is_internal ? 'border-warning/20 bg-warning-soft/40' : 'border-border bg-card'}`}
                    >
                      <p className="text-sm font-600 text-foreground">{event.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatSupportDateTime(event.created_at)}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title={t('support.ticketDetail.securityTitle')}
                description={t('support.ticketDetail.securityDescription')}
              >
                <div className="flex items-start gap-3 rounded-2xl border border-info/20 bg-info-soft/50 p-4 text-sm text-foreground">
                  <Shield size={18} className="mt-0.5 text-info" />
                  <p>{t('support.ticketDetail.securityBody')}</p>
                </div>
                <button type="button" className="btn-secondary mt-4 w-full justify-center" onClick={() => void loadTicket()}>
                  <Download size={16} />
                  {t('support.ticketDetail.refresh')}
                </button>
              </SectionCard>
            </div>
          </div>
        </>
      )}
      <SupportConfirmationModal
        open={Boolean(pendingStatusConfirmation)}
        title={pendingStatusConfirmation?.title || ''}
        description={pendingStatusConfirmation?.description || ''}
        confirmLabel={t('support.ticketDetail.confirmAction')}
        cancelLabel={t('support.ticketDetail.cancelAction')}
        pending={savingSummary}
        onClose={() => setPendingStatusConfirmation(null)}
        onConfirm={() => void saveSummary()}
      />
      <SupportConfirmationModal
        open={Boolean(attachmentToDelete)}
        title={t('support.ticketDetail.confirmDeleteAttachmentTitle')}
        description={t('support.ticketDetail.confirmDeleteAttachmentDescription', {
          name: attachmentToDelete?.name || '',
        })}
        confirmLabel={t('support.ticketDetail.confirmAction')}
        cancelLabel={t('support.ticketDetail.cancelAction')}
        pending={deletingAttachment}
        onClose={() => setAttachmentToDelete(null)}
        onConfirm={() => void deleteAttachment()}
      />
    </div>
  );
}
