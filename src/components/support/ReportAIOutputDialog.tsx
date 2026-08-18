'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal';
import { createClientId } from '@/lib/uuid';
import {
  AI_OUTPUT_REPORT_REASONS,
  type AIOutputReportContext,
  type AIOutputReportFeature,
  type AIOutputReportReason,
} from '@/lib/support';

export type ReportAIOutputDialogSnapshot = {
  providerUsed?: string | null;
  primaryModel?: string | null;
  finalModel?: string | null;
  fallbackUsed?: boolean | null;
};

type ReportAIOutputDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  feature: AIOutputReportFeature;
  referenceId?: string | null;
  snapshot?: ReportAIOutputDialogSnapshot | null;
  autoGenerateSubject?: boolean;
};

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; ticketNumber: string }
  | { status: 'error'; message: string };

const AUTO_SUBJECT_KEYS: Record<AIOutputReportFeature, string> = {
  text_ai: 'aiReporting.defaultSubject.textAI',
  voice_ai: 'aiReporting.defaultSubject.voiceAI',
  receipt_document_ai: 'aiReporting.defaultSubject.receiptAI',
  ai_assistant: 'aiReporting.defaultSubject.assistant',
};

const REASON_TKEYS: Record<AIOutputReportReason, string> = {
  inappropriate: 'aiReporting.reasons.inappropriate',
  inaccurate: 'aiReporting.reasons.inaccurate',
  offensive: 'aiReporting.reasons.offensive',
  unsafe: 'aiReporting.reasons.unsafe',
  other: 'aiReporting.reasons.other',
};

export default function ReportAIOutputDialog({
  isOpen,
  onClose,
  feature,
  referenceId = null,
  snapshot = null,
  autoGenerateSubject = true,
}: ReportAIOutputDialogProps) {
  const { t, i18n } = useTranslation(['portal', 'common']);
  const [reason, setReason] = useState<AIOutputReportReason>('inappropriate');
  const [userNote, setUserNote] = useState('');
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });

  useEffect(() => {
    if (isOpen) {
      setReason('inappropriate');
      setUserNote('');
      setState({ status: 'idle' });
    }
  }, [isOpen, feature, referenceId]);

  const defaultSubject = useMemo(() => {
    if (!autoGenerateSubject) return '';
    return t(AUTO_SUBJECT_KEYS[feature], { ns: 'portal' });
  }, [autoGenerateSubject, feature, t]);

  const getAuthToken = useCallback(async (): Promise<string> => {
    try {
      const res = await fetch('/api/auth/session', { method: 'GET' });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (body && typeof body.token === 'string' && body.token) return body.token;
      }
    } catch {
      // fall through
    }
    // Read from cookie fallback (supabase stores auth tokens in cookies)
    const all = (typeof document !== 'undefined' ? document.cookie : '') || '';
    const pair = all.split('; ').find((s) => s.startsWith('sb-access-token='));
    if (pair) return decodeURIComponent(pair.split('=')[1] || '');
    return '';
  }, []);

  const handleSubmit = useCallback(async (event?: React.FormEvent) => {
    event?.preventDefault();
    setState({ status: 'submitting' });
    try {
      const token = await getAuthToken();
      const reportContext: AIOutputReportContext = {
        feature,
        referenceId: referenceId || null,
        reason,
        userNote: userNote.trim() || null,
        provider: snapshot?.providerUsed || null,
        primaryModel: snapshot?.primaryModel || null,
        finalModel: snapshot?.finalModel || null,
        fallbackUsed: snapshot?.fallbackUsed ?? null,
      };
      const body = {
        ticketId: createClientId(),
        subject: defaultSubject,
        category: 'ai_output_report',
        priority: 'normal',
        message: userNote.trim() || t('aiReporting.defaultMessage', { ns: 'portal' }),
        aiOutputReportContext: reportContext,
        localeCode: i18n.language || 'en',
      };
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || !data?.ticketNumber) {
        setState({
          status: 'error',
          message: typeof data?.error === 'string'
            ? data.error
            : t('aiReporting.submitError', { ns: 'portal' }),
        });
        return;
      }
      setState({ status: 'success', ticketNumber: String(data.ticketNumber) });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : t('aiReporting.submitError', { ns: 'portal' }),
      });
    }
  }, [defaultSubject, feature, getAuthToken, i18n.language, reason, referenceId, snapshot, t, userNote]);

  const footer = useMemo(() => {
    if (state.status === 'success') {
      return (
        <div className="flex gap-2 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-600 text-white transition-colors hover:bg-accent/90"
          >
            {t('actions.close', { ns: 'common' })}
          </button>
        </div>
      );
    }

    const isSubmitting = state.status === 'submitting';
    const cancelLabel = state.status === 'error'
      ? t('actions.close', { ns: 'common' })
      : t('actions.cancel', { ns: 'common' });

    return (
      <div className="flex flex-col gap-2 px-4 py-3 sm:px-6 sm:flex-row sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="btn-secondary min-h-10 w-full sm:w-auto"
        >
          {cancelLabel}
        </button>
        {state.status !== 'error' && (
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            className="btn-primary min-h-10 w-full justify-center sm:w-auto"
          >
            {isSubmitting
              ? t('aiReporting.submitting', { ns: 'portal' })
              : t('aiReporting.submit', { ns: 'portal' })}
          </button>
        )}
      </div>
    );
  }, [handleSubmit, onClose, state.status, t]);

  const bodyContent = useMemo(() => {
    if (state.status === 'success') {
      return (
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-positive/10">
            <span className="text-2xl text-positive" aria-hidden>
              ✓
            </span>
          </div>
          <h2 className="mb-2 text-base font-700 text-foreground">
            {t('aiReporting.successTitle', { ns: 'portal' })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('aiReporting.successMessage', {
              ns: 'portal',
              ticketNumber: state.ticketNumber,
            })}
          </p>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-700 text-foreground">
            {t('aiReporting.title', { ns: 'portal' })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('aiReporting.description', { ns: 'portal' })}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-xs font-600 uppercase tracking-wide text-muted-foreground">
            {t('aiReporting.reasonLabel', { ns: 'portal' })}
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AI_OUTPUT_REPORT_REASONS.map((opt) => {
              const isActive = opt === reason;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setReason(opt)}
                  className={`min-h-10 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-border bg-background text-foreground hover:bg-muted/70'
                  }`}
                >
                  <span className="font-600">{t(REASON_TKEYS[opt], { ns: 'portal' })}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="ai-report-note"
            className="mb-2 block text-xs font-600 uppercase tracking-wide text-muted-foreground"
          >
            {t('aiReporting.noteLabel', { ns: 'portal' })}
            <span className="ml-1 normal-case tracking-normal text-muted-foreground">
              ({t('aiReporting.optional', { ns: 'portal' })})
            </span>
          </label>
          <textarea
            id="ai-report-note"
            value={userNote}
            onChange={(event) => setUserNote(event.target.value.slice(0, 1000))}
            placeholder={t('aiReporting.notePlaceholder', { ns: 'portal' })}
            className="input-base min-h-[120px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {userNote.length}/1000
          </p>
        </div>

        {state.status === 'error' && (
          <div
            role="alert"
            className="rounded-xl border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
          >
            {state.message}
          </div>
        )}
      </form>
    );
  }, [handleSubmit, reason, state, t, userNote]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (state.status !== 'submitting') onClose();
      }}
      title={t('aiReporting.title', { ns: 'portal' })}
      size="lg"
      footer={footer}
      stickyFooter
      closeOnBackdrop={state.status !== 'submitting'}
      closeOnEscape={state.status !== 'submitting'}
    >
      {bodyContent}
    </Modal>
  );
}
