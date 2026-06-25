'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LifeBuoy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import SupportAttachmentUploader, { type PendingSupportFile } from '@/components/support/SupportAttachmentUploader';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  toTitleLabel,
  type FinalizedSupportUpload,
} from '@/lib/support';
import { uploadSupportAttachments } from '@/lib/support-attachments';
import { useAuth } from '@/contexts/AuthContext';
import { createClientId } from '@/lib/uuid';

export default function SupportNewPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation('portal');
  const [subject, setSubject] = React.useState('');
  const [category, setCategory] = React.useState('other');
  const [priority, setPriority] = React.useState('normal');
  const [message, setMessage] = React.useState('');
  const [relatedPath, setRelatedPath] = React.useState('');
  const [errorCode, setErrorCode] = React.useState('');
  const [attachments, setAttachments] = React.useState<PendingSupportFile[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const draftId = React.useMemo(() => createClientId(), []);
  const getCategoryLabel = React.useCallback(
    (value: string) => t(`support.values.categories.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );
  const getPriorityLabel = React.useCallback(
    (value: string) => t(`support.badges.priority.${value}`, { defaultValue: toTitleLabel(value) }),
    [t]
  );

  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) {
      toast.error(t('support.newTicket.authRequired'));
      return;
    }

    setSubmitting(true);
    try {
      let finalizedUploads: FinalizedSupportUpload[] = [];

      if (attachments.length > 0) {
        finalizedUploads = await uploadSupportAttachments({
          ticketId: draftId,
          files: attachments.map((item) => item.file),
          onFileProgress: (index, progress) => {
            const fileId = attachments[index]?.id;
            if (!fileId) return;
            setUploadProgress((current) => ({ ...current, [fileId]: progress }));
          },
        });
      }

      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: draftId,
          subject,
          category,
          priority,
          message,
          relatedPath,
          errorCode,
          uploads: finalizedUploads,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t('support.newTicket.createError'));
      }

      toast.success(payload?.message || t('support.newTicket.created'));
      router.push(`/support/${payload.ticketId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.newTicket.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout activeRoute="/support">
      <div className="page-section page-shell-readable">
        <PageHeader
          title={t('support.newTicket.title')}
          description={t('support.newTicket.description')}
          badge={
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-700 text-accent">
              <LifeBuoy size={12} />
              {t('support.newTicket.badge')}
            </span>
          }
        />

        <form onSubmit={submitTicket} className="space-y-6">
          <SectionCard
            title={t('support.newTicket.detailsTitle')}
            description={t('support.newTicket.detailsDescription')}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="support-subject" className="mb-1.5 block text-sm font-600 text-foreground">
                  {t('support.newTicket.subject')}
                </label>
                <input
                  id="support-subject"
                  className="input-base"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder={t('support.newTicket.subjectPlaceholder')}
                  maxLength={160}
                  required
                />
              </div>

              <div>
                <label htmlFor="support-category" className="mb-1.5 block text-sm font-600 text-foreground">
                  {t('support.newTicket.category')}
                </label>
                <select
                  id="support-category"
                  className="input-base"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {SUPPORT_TICKET_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {getCategoryLabel(item)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="support-priority" className="mb-1.5 block text-sm font-600 text-foreground">
                  {t('support.newTicket.priority')}
                </label>
                <select
                  id="support-priority"
                  className="input-base"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {SUPPORT_TICKET_PRIORITIES.map((item) => (
                    <option key={item} value={item}>
                      {getPriorityLabel(item)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="support-related-path" className="mb-1.5 block text-sm font-600 text-foreground">
                  {t('support.newTicket.relatedPath')}
                </label>
                <input
                  id="support-related-path"
                  className="input-base"
                  value={relatedPath}
                  onChange={(event) => setRelatedPath(event.target.value)}
                  placeholder={t('support.newTicket.relatedPathPlaceholder')}
                  maxLength={240}
                />
              </div>

              <div>
                <label htmlFor="support-error-code" className="mb-1.5 block text-sm font-600 text-foreground">
                  {t('support.newTicket.errorCode')}
                </label>
                <input
                  id="support-error-code"
                  className="input-base"
                  value={errorCode}
                  onChange={(event) => setErrorCode(event.target.value)}
                  placeholder={t('support.newTicket.errorCodePlaceholder')}
                  maxLength={120}
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="support-message" className="mb-1.5 block text-sm font-600 text-foreground">
                  {t('support.newTicket.message')}
                </label>
                <textarea
                  id="support-message"
                  className="input-base min-h-[180px] resize-y"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={t('support.newTicket.messagePlaceholder')}
                  minLength={10}
                  maxLength={6000}
                  required
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={t('support.newTicket.attachmentsTitle')}
            description={t('support.newTicket.attachmentsDescription')}
          >
            <SupportAttachmentUploader
              files={attachments}
              onChange={setAttachments}
              uploadProgress={uploadProgress}
              disabled={submitting}
            />
          </SectionCard>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => router.push('/support')}
              disabled={submitting}
            >
              {t('support.newTicket.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('support.newTicket.creating')}
                </>
              ) : (
                t('support.newTicket.create')
              )}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
