'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Mic, Type, CheckCircle, RotateCcw, Trash2, ChevronDown, ChevronUp, Loader2, AlertTriangle, MessageSquare, ThumbsUp, ThumbsDown, Minus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';


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

function AIHistoryStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    executed:    { color: 'bg-positive-soft text-positive', label: 'Saved' },
    confirmed:   { color: 'bg-positive-soft text-positive', label: 'Confirmed' },
    cancelled:   { color: 'bg-muted text-muted-foreground', label: 'Cancelled' },
    failed:      { color: 'bg-negative-soft text-negative', label: 'Failed' },
    parsed:      { color: 'bg-info-soft text-info', label: 'Parsed' },
    clarifying:  { color: 'bg-warning-soft text-warning', label: 'Clarifying' },
    not_configured: { color: 'bg-muted text-muted-foreground', label: 'Not Configured' },
  };
  const s = map[status] || { color: 'bg-muted text-muted-foreground', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-600 ${s.color}`}>
      {s.label}
    </span>
  );
}

export default function AIHistoryPage() {
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
      toast.error('Failed to load AI history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleDeleteTranscript = async (requestId: string) => {
    try {
      const supabase = createClient();
      await supabase
        .from('ai_requests')
        .update({ transcript: null, transcript_retained: false })
        .eq('id', requestId);
      toast.success('Transcript deleted');
      loadHistory();
    } catch {
      toast.error('Failed to delete transcript');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackForm) return;
    setSubmittingFeedback(feedbackForm.requestId);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await supabase.from('ai_feedback').upsert({
        user_id: user.id,
        request_id: feedbackForm.requestId,
        feedback_type: feedbackForm.type,
        wrong_fields: feedbackForm.wrongFields.length > 0 ? feedbackForm.wrongFields : null,
        notes: feedbackForm.notes || null,
      }, { onConflict: 'request_id' });

      toast.success('Feedback submitted. Thank you!');
      setFeedbackForm(null);
      loadHistory();
    } catch {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmittingFeedback(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getIntentLabel = (intent: string | null): string => {
    if (!intent) return 'Unknown';
    return intent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getSummary = (req: AIRequest): string => {
    if (req.raw_text) return req.raw_text.slice(0, 80) + (req.raw_text.length > 80 ? '...' : '');
    if (req.transcript) return req.transcript.slice(0, 80) + (req.transcript.length > 80 ? '...' : '');
    if (req.overall_intent) return getIntentLabel(req.overall_intent);
    return 'AI request';
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
      <div className="page-shell-readable page-section">
        <PageHeader
          title="AI History"
          description="Review recent AI-assisted entries, outcomes, transcript retention, and feedback."
          badge={<StatusBadge status="ai" label="AI activity" />}
          compact
          className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
          actionsClassName="w-full sm:w-auto"
          actions={
            <button
              onClick={loadHistory}
              className="btn-secondary max-[480px]:w-full"
              aria-label="Refresh"
            >
              <RotateCcw size={16} />
              Refresh
            </button>
          }
        />

        {requests.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Sparkles size={24} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-600 text-foreground mb-2">No AI history yet</p>
            <p className="text-sm text-muted-foreground">
              Use the AI assistant to enter transactions with voice or text.
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
                        {req.overall_intent && (
                          <span className="text-xs text-muted-foreground">· {getIntentLabel(req.overall_intent)}</span>
                        )}
                        {req.total_duration_ms && (
                          <span className="text-xs text-muted-foreground">· {req.total_duration_ms}ms</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <AIHistoryStatusBadge status={req.confirmation_status || req.status} />
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
                            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Transcript</p>
                            {req.transcript_retained && (
                              <button
                                onClick={() => handleDeleteTranscript(req.id)}
                                className="flex items-center gap-1 text-xs text-negative hover:text-negative/80 transition-colors"
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-foreground italic">"{req.transcript}"</p>
                        </div>
                      )}

                      {/* Provider info */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {req.language_provider_used && (
                          <span>Provider: {req.language_provider_used}</span>
                        )}
                        {req.fallback_used && (
                          <span className="text-warning">⚡ Fallback used</span>
                        )}
                        {req.confidence && (
                          <span>Confidence: {Math.round(req.confidence * 100)}%</span>
                        )}
                        <span>Language: {req.input_language}</span>
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
                          <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Created Records</p>
                          <div className="space-y-1">
                            {(req.executed_record_ids as Array<{ actionType: string; recordTable: string; recordId: string }>).map((r, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-foreground">
                                <CheckCircle size={12} className="text-positive" />
                                <span className="capitalize">{r.actionType?.replace(/_/g, ' ')}</span>
                                <span className="text-muted-foreground">in {r.recordTable}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Feedback */}
                      {req.status === 'executed' && (
                        <div>
                          <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Feedback</p>
                          {existingFeedback ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {existingFeedback.feedback_type === 'correct' && <ThumbsUp size={12} className="text-positive" />}
                              {existingFeedback.feedback_type === 'incorrect' && <ThumbsDown size={12} className="text-negative" />}
                              {existingFeedback.feedback_type === 'partially_correct' && <Minus size={12} className="text-warning" />}
                              <span className="capitalize">{existingFeedback.feedback_type.replace('_', ' ')}</span>
                              {existingFeedback.wrong_fields?.length && (
                                <span>· Wrong: {existingFeedback.wrong_fields.join(', ')}</span>
                              )}
                            </div>
                          ) : feedbackForm?.requestId === req.id ? (
                            <div className="space-y-3">
                              <div className="flex gap-2">
                                {(['correct', 'partially_correct', 'incorrect'] as const).map(t => (
                                  <button
                                    key={t}
                                    onClick={() => setFeedbackForm(prev => prev ? { ...prev, type: t } : null)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-600 transition-colors ${
                                      feedbackForm.type === t
                                        ? t === 'correct' ? 'bg-positive text-white'
                                          : t === 'incorrect'? 'bg-negative text-white' :'bg-warning text-white' :'bg-muted text-muted-foreground'
                                    }`}
                                  >
                                    {t === 'correct' ? '✓ Correct' : t === 'incorrect' ? '✗ Incorrect' : '~ Partial'}
                                  </button>
                                ))}
                              </div>
                              {feedbackForm.type !== 'correct' && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1.5">What was wrong?</p>
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
                                        {f}
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
                                  {submittingFeedback === req.id ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Submit'}
                                </button>
                                <button
                                  onClick={() => setFeedbackForm(null)}
                                  className="px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-600 hover:bg-muted/80 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setFeedbackForm({ requestId: req.id, type: 'correct', wrongFields: [], notes: '' })}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <MessageSquare size={12} />
                              Rate this result
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
    </AppLayout>
  );
}
