'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Mic, Type, CheckCircle, RotateCcw, Trash2, ChevronDown, ChevronUp, Loader2, AlertTriangle, MessageSquare, ThumbsUp, ThumbsDown, Minus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';


interface AIRequest {
  id: string;
  request_type: 'voice' | 'text';
  status: string;
  overall_intent: string | null;
  raw_text: string | null;
  transcript: string | null;
  transcript_retained: boolean;
  input_language: string;
  language_provider_used: string | null;
  fallback_used: boolean;
  confidence: number | null;
  parsed_result: Record<string, unknown> | null;
  executed_record_ids: unknown[] | null;
  confirmation_status: string | null;
  error_message: string | null;
  total_duration_ms: number | null;
  created_at: string;
}

interface AIFeedback {
  request_id: string;
  feedback_type: 'correct' | 'partially_correct' | 'incorrect';
  wrong_fields: string[] | null;
  notes: string | null;
}

function AIHistoryStatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const map: Record<string, { color: string; label: string }> = {
    executed:    { color: 'bg-positive-soft text-positive', label: t('aiHistory.statuses.executed') },
    confirmed:   { color: 'bg-positive-soft text-positive', label: t('aiHistory.statuses.confirmed') },
    cancelled:   { color: 'bg-muted text-muted-foreground', label: t('aiHistory.statuses.cancelled') },
    failed:      { color: 'bg-negative-soft text-negative', label: t('aiHistory.statuses.failed') },
    parsed:      { color: 'bg-info-soft text-info', label: t('aiHistory.statuses.parsed') },
    clarifying:  { color: 'bg-warning-soft text-warning', label: t('aiHistory.statuses.clarifying') },
    not_configured: { color: 'bg-muted text-muted-foreground', label: t('aiHistory.statuses.notConfigured') },
  };
  const s = map[status] || { color: 'bg-muted text-muted-foreground', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-600 ${s.color}`}>
      {s.label}
    </span>
  );
}

export default function AIHistoryPage() {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const pathname = usePathname();
  const [requests, setRequests] = useState<AIRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, AIFeedback>>({});
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null);
  const [feedbackForm, setFeedbackForm] = useState<{
    requestId: string;
    type: 'correct' | 'partially_correct' | 'incorrect';
    wrongFields: string[];
    notes: string;
  } | null>(null);

  const WRONG_FIELD_OPTIONS = [
    'amount', 'currency', 'person', 'account', 'category',
    'date', 'payer', 'funding_source', 'reimbursement',
  ];

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('ai_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setRequests((data || []) as AIRequest[]);

      // Load existing feedback
      if (data && data.length > 0) {
        const ids = data.map((r: AIRequest) => r.id);
        const { data: fbData } = await supabase
          .from('ai_feedback')
          .select('*')
          .in('request_id', ids);

        const fbMap: Record<string, AIFeedback> = {};
        (fbData || []).forEach((fb: AIFeedback) => {
          fbMap[fb.request_id] = fb;
        });
        setFeedbackMap(fbMap);
      }
    } catch {
      toast.error(t('aiHistory.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleDeleteTranscript = async (requestId: string) => {
    try {
      const supabase = createClient();
      await supabase
        .from('ai_requests')
        .update({ transcript: null, transcript_retained: false })
        .eq('id', requestId);
      toast.success(t('aiHistory.transcriptDeleted'));
      loadHistory();
    } catch {
      toast.error(t('aiHistory.deleteTranscriptFailed'));
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackForm) return;
    setSubmittingFeedback(feedbackForm.requestId);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('aiHistory.notAuthenticated'));

      await supabase.from('ai_feedback').upsert({
        user_id: user.id,
        request_id: feedbackForm.requestId,
        feedback_type: feedbackForm.type,
        wrong_fields: feedbackForm.wrongFields.length > 0 ? feedbackForm.wrongFields : null,
        notes: feedbackForm.notes || null,
      }, { onConflict: 'request_id' });

      toast.success(t('aiHistory.feedbackSubmitted'));
      setFeedbackForm(null);
      loadHistory();
    } catch {
      toast.error(t('aiHistory.feedbackFailed'));
    } finally {
      setSubmittingFeedback(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const timeText = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
    if (isToday) {
      return t('aiHistory.todayAt', { time: timeText });
    }
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  const getIntentLabel = (intent: string | null): string => {
    if (!intent) return t('aiHistory.unknown');
    switch (intent) {
      case 'personal_transaction':
        return t('aiHistory.intents.personalTransaction');
      case 'managed_person_transaction':
        return t('aiHistory.intents.managedPersonTransaction');
      case 'transfer':
        return t('aiHistory.intents.transfer');
      case 'reimbursement':
        return t('aiHistory.intents.reimbursement');
      case 'settlement':
        return t('aiHistory.intents.settlement');
      case 'budget':
        return t('aiHistory.intents.budget');
      case 'recurring_transaction':
        return t('aiHistory.intents.recurringTransaction');
      case 'multiple_actions':
        return t('aiHistory.intents.multipleActions');
      case 'unclear':
        return t('aiHistory.intents.unclear');
      default:
        return t('aiHistory.unknown');
    }
  };

  const getRequestTypeLabel = (requestType: AIRequest['request_type']) => {
    return requestType === 'voice'
      ? t('aiHistory.requestTypes.voice')
      : t('aiHistory.requestTypes.text');
  };

  const getFeedbackTypeLabel = (feedbackType: AIFeedback['feedback_type']) => {
    if (feedbackType === 'correct') return t('aiHistory.feedbackOptions.correct');
    if (feedbackType === 'incorrect') return t('aiHistory.feedbackOptions.incorrect');
    return t('aiHistory.feedbackOptions.partial');
  };

  const getWrongFieldLabel = (field: string) => {
    switch (field) {
      case 'amount':
        return t('aiHistory.wrongFieldLabels.amount');
      case 'currency':
        return t('aiHistory.wrongFieldLabels.currency');
      case 'person':
        return t('aiHistory.wrongFieldLabels.person');
      case 'account':
        return t('aiHistory.wrongFieldLabels.account');
      case 'category':
        return t('aiHistory.wrongFieldLabels.category');
      case 'date':
        return t('aiHistory.wrongFieldLabels.date');
      case 'payer':
        return t('aiHistory.wrongFieldLabels.payer');
      case 'funding_source':
        return t('aiHistory.wrongFieldLabels.fundingSource');
      case 'reimbursement':
        return t('aiHistory.wrongFieldLabels.reimbursement');
      default:
        return field;
    }
  };

  const getActionTypeLabel = (actionType: string) => {
    switch (actionType) {
      case 'income':
        return t('aiHistory.actionTypes.income');
      case 'expense':
        return t('aiHistory.actionTypes.expense');
      case 'money_received_from_person':
        return t('aiHistory.actionTypes.moneyReceivedFromPerson');
      case 'money_returned_to_person':
        return t('aiHistory.actionTypes.moneyReturnedToPerson');
      case 'expense_from_held_balance':
        return t('aiHistory.actionTypes.expenseFromHeldBalance');
      case 'expense_paid_for_person':
        return t('aiHistory.actionTypes.expensePaidForPerson');
      case 'reimbursement_payment':
        return t('aiHistory.actionTypes.reimbursementPayment');
      case 'settlement':
        return t('aiHistory.actionTypes.settlement');
      case 'transfer':
        return t('aiHistory.actionTypes.transfer');
      case 'budget':
        return t('aiHistory.actionTypes.budget');
      case 'recurring_transaction':
        return t('aiHistory.actionTypes.recurringTransaction');
      case 'loan_received':
        return t('aiHistory.actionTypes.loanReceived');
      case 'loan_repayment':
        return t('aiHistory.actionTypes.loanRepayment');
      default:
        return actionType;
    }
  };

  const getSummary = (req: AIRequest): string => {
    if (req.raw_text) return req.raw_text.slice(0, 80) + (req.raw_text.length > 80 ? '...' : '');
    if (req.transcript) return req.transcript.slice(0, 80) + (req.transcript.length > 80 ? '...' : '');
    if (req.overall_intent) return getIntentLabel(req.overall_intent);
    return t('aiHistory.requestFallback');
  };

  if (loading) {
    return (
      <AppLayout activeRoute={pathname}>
        <div className="flex items-center justify-center h-64">
          <Loader2 size={32} className="text-accent animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activeRoute={pathname}>
      <SubscriptionFeatureGate feature="ai_history">
        <div className="page-shell-readable page-section">
          <PageHeader
            title={t('aiHistory.title')}
            description={t('aiHistory.description')}
            badge={<StatusBadge status="ai" label={t('aiHistory.badge')} />}
            compact
            className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
            actionsClassName="w-full sm:w-auto"
            actions={
              <button
                onClick={loadHistory}
                className="btn-secondary max-[480px]:w-full"
                aria-label={t('aiHistory.refresh')}
              >
                <RotateCcw size={16} />
                {t('aiHistory.refresh')}
              </button>
            }
          />

          {requests.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Sparkles size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-600 text-foreground mb-2">{t('aiHistory.emptyTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {t('aiHistory.emptyDescription')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map(req => {
              const isExpanded = expandedId === req.id;
              const existingFeedback = feedbackMap[req.id];

              return (
                <div key={req.id} className="card overflow-hidden">
                  {/* Row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30 max-[480px]:items-start max-[480px]:p-3"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      req.request_type === 'voice' ? 'bg-accent/10' : 'bg-muted'
                    }`}>
                      {req.request_type === 'voice'
                        ? <Mic size={14} className="text-accent" />
                        : <Type size={14} className="text-muted-foreground" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-foreground truncate">{getSummary(req)}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDate(req.created_at)}</span>
                        <span className="text-xs text-muted-foreground">· {getRequestTypeLabel(req.request_type)}</span>
                        {req.overall_intent && (
                          <span className="text-xs text-muted-foreground">· {getIntentLabel(req.overall_intent)}</span>
                        )}
                        {req.total_duration_ms && (
                          <span className="text-xs text-muted-foreground">· {t('aiHistory.durationMs', { value: req.total_duration_ms })}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <AIHistoryStatusBadge status={req.confirmation_status || req.status} t={t} />
                      {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="space-y-4 border-t border-border p-4 max-[480px]:p-3">
                      {/* Transcript */}
                      {req.transcript && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{t('aiHistory.transcript')}</p>
                            {req.transcript_retained && (
                              <button
                                onClick={() => handleDeleteTranscript(req.id)}
                                className="flex items-center gap-1 text-xs text-negative hover:text-negative/80 transition-colors"
                              >
                                <Trash2 size={12} />
                                {t('aiHistory.delete')}
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-foreground italic">"{req.transcript}"</p>
                        </div>
                      )}

                      {/* Provider info */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {req.language_provider_used && (
                          <span>{t('aiHistory.provider', { value: req.language_provider_used })}</span>
                        )}
                        {req.fallback_used && (
                          <span className="text-warning">{t('aiHistory.fallbackUsed')}</span>
                        )}
                        {req.confidence && (
                          <span>{t('aiHistory.confidence', { value: Math.round(req.confidence * 100) })}</span>
                        )}
                        <span>{t('aiHistory.language', { value: req.input_language })}</span>
                      </div>

                      {/* Error */}
                      {req.error_message && (
                        <div className="p-3 bg-negative-soft rounded-xl flex items-start gap-2">
                          <AlertTriangle size={14} className="text-negative mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-negative">{req.error_message}</p>
                        </div>
                      )}

                      {/* Executed records */}
                      {req.executed_record_ids && Array.isArray(req.executed_record_ids) && req.executed_record_ids.length > 0 && (
                        <div>
                          <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">{t('aiHistory.createdRecords')}</p>
                          <div className="space-y-1">
                            {(req.executed_record_ids as Array<{ actionType: string; recordTable: string; recordId: string }>).map((r, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-foreground">
                                <CheckCircle size={12} className="text-positive" />
                                <span>{getActionTypeLabel(r.actionType)}</span>
                                <span className="text-muted-foreground">{t('aiHistory.inTable', { table: r.recordTable })}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Feedback */}
                      {req.status === 'executed' && (
                        <div>
                          <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">{t('aiHistory.feedback')}</p>
                          {existingFeedback ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {existingFeedback.feedback_type === 'correct' && <ThumbsUp size={12} className="text-positive" />}
                              {existingFeedback.feedback_type === 'incorrect' && <ThumbsDown size={12} className="text-negative" />}
                              {existingFeedback.feedback_type === 'partially_correct' && <Minus size={12} className="text-warning" />}
                              <span>{getFeedbackTypeLabel(existingFeedback.feedback_type)}</span>
                              {existingFeedback.wrong_fields?.length && (
                                <span>· {t('aiHistory.wrongFields', { fields: existingFeedback.wrong_fields.map(getWrongFieldLabel).join(', ') })}</span>
                              )}
                            </div>
                          ) : feedbackForm?.requestId === req.id ? (
                            <div className="space-y-3">
                              <div className="flex gap-2">
                                {(['correct', 'partially_correct', 'incorrect'] as const).map((feedbackType) => (
                                  <button
                                    key={feedbackType}
                                    onClick={() => setFeedbackForm(prev => prev ? { ...prev, type: feedbackType } : null)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-600 transition-colors ${
                                      feedbackForm.type === feedbackType
                                        ? feedbackType === 'correct' ? 'bg-positive text-white'
                                          : feedbackType === 'incorrect'? 'bg-negative text-white' :'bg-warning text-white' :'bg-muted text-muted-foreground'
                                    }`}
                                  >
                                    {feedbackType === 'correct' ? t('aiHistory.feedbackOptions.correct') : feedbackType === 'incorrect' ? t('aiHistory.feedbackOptions.incorrect') : t('aiHistory.feedbackOptions.partial')}
                                  </button>
                                ))}
                              </div>
                              {feedbackForm.type !== 'correct' && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1.5">{t('aiHistory.whatWasWrong')}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {WRONG_FIELD_OPTIONS.map(f => (
                                      <button
                                        key={f}
                                        onClick={() => setFeedbackForm(prev => {
                                          if (!prev) return null;
                                          const wf = prev.wrongFields.includes(f)
                                            ? prev.wrongFields.filter(x => x !== f)
                                            : [...prev.wrongFields, f];
                                          return { ...prev, wrongFields: wf };
                                        })}
                                        className={`px-2 py-1 rounded-lg text-xs font-600 transition-colors ${
                                          feedbackForm.wrongFields.includes(f)
                                            ? 'bg-negative-soft text-negative border border-negative/30' :'bg-muted text-muted-foreground'
                                        }`}
                                      >
                                        {getWrongFieldLabel(f)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={handleSubmitFeedback}
                                  disabled={submittingFeedback === req.id}
                                  className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-600 hover:bg-accent/90 disabled:opacity-50 transition-colors"
                                >
                                  {submittingFeedback === req.id ? <Loader2 size={12} className="animate-spin mx-auto" /> : t('aiHistory.submit')}
                                </button>
                                <button
                                  onClick={() => setFeedbackForm(null)}
                                  className="px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-600 hover:bg-muted/80 transition-colors"
                                >
                                  {t('aiHistory.cancel')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setFeedbackForm({ requestId: req.id, type: 'correct', wrongFields: [], notes: '' })}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <MessageSquare size={12} />
                              {t('aiHistory.rateResult')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
        </div>
      </SubscriptionFeatureGate>
    </AppLayout>
  );
}
