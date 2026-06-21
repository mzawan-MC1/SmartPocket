'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import CurrencySelector from '@/components/CurrencySelector';
import { formatCurrencyText } from '@/lib/currency-formatting';
import {
  classifyTransactionDocumentError,
  type TransactionDocumentDuplicateMatch,
  type TransactionDocumentExtractResponse,
  type TransactionDocumentOptionCategory,
  type TransactionDocumentReviewInput,
  type TransactionDocumentSaveResponse,
  type TransactionDocumentSourceSurface,
} from '@/lib/transaction-documents';

type EditableDocumentTransaction = TransactionDocumentReviewInput & {
  id: string;
  confidence: number;
  needsReview: boolean;
};

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `doc-tx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function matchCategoryId(
  categories: TransactionDocumentOptionCategory[],
  suggestion: string | undefined,
  transactionType: 'expense' | 'income'
) {
  const normalized = (suggestion || '').trim().toLowerCase();
  if (!normalized) return null;
  const exact = categories.find(
    (category) =>
      category.category_type === transactionType &&
      category.name.trim().toLowerCase() === normalized
  );
  if (exact) return exact.id;
  const partial = categories.find(
    (category) =>
      category.category_type === transactionType &&
      category.name.trim().toLowerCase().includes(normalized)
  );
  return partial?.id || null;
}

function getLocalizedTransactionDocumentError(args: {
  t: ReturnType<typeof useTranslation>['t'];
  errorCode?: unknown;
  errorMessage?: unknown;
  fallbackKey: 'extractFailed' | 'saveFailed' | 'invalidFile';
}) {
  const code = typeof args.errorCode === 'string'
    ? args.errorCode
    : classifyTransactionDocumentError(args.errorMessage);

  const fallback = (() => {
    switch (args.fallbackKey) {
      case 'invalidFile':
        return args.t('transactions.documentReview.errors.invalidType', {
          ns: 'portal',
        });
      case 'saveFailed':
        return args.t('transactions.documentReview.errors.saveFailed', {
          ns: 'portal',
        });
      case 'extractFailed':
      default:
        return args.t('transactions.documentReview.errors.extractFailed', {
          ns: 'portal',
        });
    }
  })();

  switch (code) {
    case 'unauthorized':
      return args.t('transactions.documentReview.errors.unauthorized', { ns: 'portal' });
    case 'file_required':
      return args.t('transactions.documentReview.errors.fileRequired', { ns: 'portal' });
    case 'invalid_type':
      return args.t('transactions.documentReview.errors.invalidType', { ns: 'portal' });
    case 'file_too_large':
      return args.t('transactions.documentReview.errors.fileTooLarge', { ns: 'portal' });
    case 'pdf_too_many_pages':
      return args.t('transactions.documentReview.errors.pdfTooManyPages', { ns: 'portal' });
    case 'pdf_extraction_unavailable':
      return args.t('transactions.documentReview.errors.pdfExtractionUnavailable', { ns: 'portal' });
    case 'extract_failed':
      return args.t('transactions.documentReview.errors.extractFailed', { ns: 'portal' });
    case 'job_required':
      return args.t('transactions.documentReview.errors.jobRequired', { ns: 'portal' });
    case 'review_required':
      return args.t('transactions.documentReview.errors.reviewRequired', { ns: 'portal' });
    case 'invalid_review_payload':
      return args.t('transactions.documentReview.errors.invalidReviewPayload', { ns: 'portal' });
    case 'invalid_amount':
      return args.t('transactions.documentReview.errors.invalidAmount', { ns: 'portal' });
    case 'invalid_account':
      return args.t('transactions.documentReview.errors.invalidAccount', { ns: 'portal' });
    case 'invalid_date':
      return args.t('transactions.documentReview.errors.invalidDate', { ns: 'portal' });
    case 'currency_mismatch':
      return args.t('transactions.documentReview.errors.currencyMismatch', { ns: 'portal' });
    case 'invalid_category':
      return args.t('transactions.documentReview.errors.invalidCategory', { ns: 'portal' });
    case 'already_saved':
      return args.t('transactions.documentReview.errors.alreadySaved', { ns: 'portal' });
    case 'job_not_found':
      return args.t('transactions.documentReview.errors.jobNotFound', { ns: 'portal' });
    case 'save_failed':
      return args.t('transactions.documentReview.errors.saveFailed', { ns: 'portal' });
    default:
      return fallback;
  }
}

export default function DocumentTransactionReviewModal({
  isOpen,
  file,
  sourceSurface,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  file: File | null;
  sourceSurface: TransactionDocumentSourceSurface;
  onClose: () => void;
  onSaved?: (result: TransactionDocumentSaveResponse) => void | Promise<void>;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [jobId, setJobId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [duplicates, setDuplicates] = useState<TransactionDocumentDuplicateMatch[]>([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [accounts, setAccounts] = useState<TransactionDocumentExtractResponse['options']['accounts']>([]);
  const [categories, setCategories] = useState<TransactionDocumentExtractResponse['options']['categories']>([]);
  const [reviewTransactions, setReviewTransactions] = useState<EditableDocumentTransaction[]>([]);

  useEffect(() => {
    if (!isOpen || !file) {
      setIsExtracting(false);
      setIsSaving(false);
      setExtractError('');
      setJobId('');
      setDocumentId('');
      setPreviewUrl('');
      setDuplicates([]);
      setDuplicateConfirmed(false);
      setAccounts([]);
      setCategories([]);
      setReviewTransactions([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const runExtraction = async () => {
      setIsExtracting(true);
      setExtractError('');
      setDuplicateConfirmed(false);
      try {
        const formData = new FormData();
        formData.set('file', file);
        formData.set('sourceSurface', sourceSurface);
        formData.set('language', 'en');

        const response = await fetch('/api/transaction-documents/extract', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
          throw new Error(getLocalizedTransactionDocumentError({
            t,
            errorCode: result?.errorCode,
            errorMessage: result?.errorMessage,
            fallbackKey: 'extractFailed',
          }));
        }

        if (cancelled) return;
        const payload = result as TransactionDocumentExtractResponse;
        setJobId(payload.jobId);
        setDocumentId(payload.documentId);
        setPreviewUrl(payload.previewUrl);
        setDuplicates(payload.duplicates || []);
        setAccounts(payload.options.accounts || []);
        setCategories(payload.options.categories || []);

        const defaultAccount = (payload.options.accounts || [])[0];
        const mappedTransactions = (payload.extraction.transactions || []).map((draft) => {
          const preferredAccount = (payload.options.accounts || []).find(
            (account) => account.currency === (draft.currency || defaultAccount?.currency)
          ) || defaultAccount;

          return {
            id: createLocalId(),
            transactionType: draft.transactionType,
            merchant: draft.merchant || '',
            transactionDate: draft.date || getTodayDate(),
            amount: typeof draft.total === 'number' ? draft.total : 0,
            tax: typeof draft.tax === 'number' ? draft.tax : null,
            currency: draft.currency || preferredAccount?.currency || payload.options.defaultCurrency,
            accountId: preferredAccount?.id || '',
            categoryId: matchCategoryId(
              payload.options.categories || [],
              draft.categorySuggestion,
              draft.transactionType
            ),
            categorySuggestion: draft.categorySuggestion,
            description: draft.description || draft.merchant || 'Document transaction',
            notes: draft.notes || '',
            receiptNumber: draft.receiptNumber || '',
            lineItems: draft.lineItems || [],
            confidence: draft.confidence,
            needsReview: draft.needsReview,
          } satisfies EditableDocumentTransaction;
        });

        setReviewTransactions(mappedTransactions);
      } catch (error) {
        if (cancelled) return;
        setExtractError(error instanceof Error ? error.message : 'Failed to extract the uploaded document.');
      } finally {
        if (!cancelled) {
          setIsExtracting(false);
        }
      }
    };

    runExtraction();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [file, isOpen, sourceSurface, t]);

  const hasDuplicates = duplicates.length > 0;
  const filteredCategoriesByType = useMemo(() => ({
    expense: categories.filter((category) => category.category_type === 'expense'),
    income: categories.filter((category) => category.category_type === 'income'),
  }), [categories]);

  const validationError = useMemo(() => {
    if (reviewTransactions.length === 0) {
      return t('transactions.documentReview.noTransactions', {
        ns: 'portal',
        defaultValue: 'No draft transactions were detected from this document.',
      });
    }

    const invalidRow = reviewTransactions.find(
      (transaction) =>
        !transaction.accountId ||
        !transaction.transactionDate ||
        !transaction.currency ||
        !(typeof transaction.amount === 'number' && Number.isFinite(transaction.amount) && transaction.amount > 0) ||
        !transaction.description.trim()
    );

    if (invalidRow) {
      return t('transactions.documentReview.completeRequiredFields', {
        ns: 'portal',
        defaultValue: 'Complete the required transaction fields before saving.',
      });
    }

    if (hasDuplicates && !duplicateConfirmed) {
      return t('transactions.documentReview.confirmDuplicateWarning', {
        ns: 'portal',
        defaultValue: 'Confirm that you want to continue despite the duplicate warning.',
      });
    }

    return '';
  }, [duplicateConfirmed, hasDuplicates, reviewTransactions, t]);

  const updateTransaction = (id: string, updater: (current: EditableDocumentTransaction) => EditableDocumentTransaction) => {
    setReviewTransactions((current) => current.map((transaction) => (
      transaction.id === id ? updater(transaction) : transaction
    )));
  };

  const handleSave = async () => {
    if (!jobId || validationError) {
      if (validationError) {
        toast.error(validationError);
      }
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/transaction-documents/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          duplicateConfirmed,
          transactions: reviewTransactions.map((transaction) => ({
            transactionType: transaction.transactionType,
            merchant: transaction.merchant,
            transactionDate: transaction.transactionDate,
            amount: transaction.amount,
            tax: transaction.tax,
            currency: transaction.currency,
            accountId: transaction.accountId,
            categoryId: transaction.categoryId,
            categorySuggestion: transaction.categorySuggestion,
            description: transaction.description,
            notes: transaction.notes,
            receiptNumber: transaction.receiptNumber,
            lineItems: transaction.lineItems,
          })),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(getLocalizedTransactionDocumentError({
          t,
          errorCode: result?.errorCode,
          errorMessage: result?.errorMessage,
          fallbackKey: 'saveFailed',
        }));
      }

      toast.success(t('transactions.documentReview.savedSuccessfully', {
        ns: 'portal',
        count: Array.isArray(result.transactionIds) ? result.transactionIds.length : 0,
        defaultValue: 'Document transactions saved successfully.',
      }));
      await onSaved?.(result as TransactionDocumentSaveResponse);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the reviewed document transactions.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (isSaving || isExtracting) return;
        onClose();
      }}
      title={t('transactions.documentReview.title', {
        ns: 'portal',
        defaultValue: 'Review Receipt / Document',
      })}
      size="xl"
      mobileLayout="fullscreen"
      contentClassName="sm:max-w-[62rem] sm:max-h-[92vh]"
      bodyClassName="overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {isExtracting ? (
            <div className="flex min-h-[22rem] flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Loader2 size={26} className="animate-spin" />
              </div>
              <div>
                <p className="text-sm font-700 text-foreground">
                  {t('transactions.documentReview.extractingTitle', {
                    ns: 'portal',
                    defaultValue: 'Extracting draft transactions',
                  })}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('transactions.documentReview.extractingDescription', {
                    ns: 'portal',
                    defaultValue: 'Validating the file, reading the document, and preparing a review draft.',
                  })}
                </p>
              </div>
            </div>
          ) : extractError ? (
            <div className="rounded-2xl border border-negative/20 bg-negative-soft p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 text-negative" />
                <div>
                  <p className="text-sm font-700 text-negative">
                    {t('transactions.documentReview.extractErrorTitle', {
                      ns: 'portal',
                      defaultValue: 'Document extraction failed',
                    })}
                  </p>
                  <p className="mt-1 text-sm text-negative">{extractError}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center gap-2">
                    {file?.type === 'application/pdf' ? (
                      <FileText size={16} className="text-accent" />
                    ) : (
                      <ImageIcon size={16} className="text-accent" />
                    )}
                    <p className="text-sm font-700 text-foreground">
                      {t('transactions.documentReview.previewTitle', {
                        ns: 'portal',
                        defaultValue: 'Original Preview',
                      })}
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border bg-muted/10">
                    {file?.type === 'application/pdf' ? (
                      <iframe
                        src={previewUrl}
                        title={file?.name || 'document-preview'}
                        className="h-[24rem] w-full bg-white"
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt={file?.name || 'document-preview'}
                        className="h-[24rem] w-full object-contain bg-white"
                      />
                    )}
                  </div>
                  {file ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {file.name}
                    </p>
                  ) : null}
                </div>

                {hasDuplicates ? (
                  <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="mt-0.5 text-warning" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-700 text-warning">
                          {t('transactions.documentReview.duplicateTitle', {
                            ns: 'portal',
                            defaultValue: 'Possible duplicate detected',
                          })}
                        </p>
                        <div className="mt-2 space-y-2">
                          {duplicates.map((duplicate) => (
                            <div key={`${duplicate.documentId}-${duplicate.reason}-${duplicate.transactionId || ''}`} className="rounded-xl bg-card/70 p-3 text-xs text-foreground">
                              <p className="font-600">
                                {duplicate.merchant || t('transactions.documentReview.duplicateUnknownMerchant', {
                                  ns: 'portal',
                                  defaultValue: 'Existing document',
                                })}
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                {duplicate.date || '—'} · {typeof duplicate.total === 'number'
                                  ? formatCurrencyText(duplicate.total, {
                                      currencyCode: duplicate.currency || undefined,
                                      fallbackCurrencyCode: duplicate.currency || 'USD',
                                      textOnly: true,
                                    })
                                  : '—'}
                              </p>
                            </div>
                          ))}
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={duplicateConfirmed}
                            onChange={(event) => setDuplicateConfirmed(event.target.checked)}
                            className="rounded accent-accent"
                          />
                          {t('transactions.documentReview.duplicateConfirmLabel', {
                            ns: 'portal',
                            defaultValue: 'I reviewed the warning and still want to save.',
                          })}
                        </label>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                {reviewTransactions.map((transaction, index) => (
                  <div key={transaction.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-700 text-foreground">
                          {t('transactions.documentReview.detectedTransaction', {
                            ns: 'portal',
                            index: index + 1,
                            defaultValue: 'Draft Transaction {{index}}',
                          })}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full px-2 py-1 font-600 ${
                            transaction.needsReview ? 'bg-warning-soft text-warning' : 'bg-positive-soft text-positive'
                          }`}>
                            {transaction.needsReview
                              ? t('transactions.documentReview.needsReview', { ns: 'portal', defaultValue: 'Needs review' })
                              : t('transactions.documentReview.readyLabel', { ns: 'portal', defaultValue: 'Looks good' })}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 font-600 text-muted-foreground">
                            {t('transactions.documentReview.confidenceLabel', {
                              ns: 'portal',
                              value: Math.round(transaction.confidence * 100),
                              defaultValue: 'Confidence {{value}}%',
                            })}
                          </span>
                        </div>
                      </div>
                      {reviewTransactions.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setReviewTransactions((current) => current.filter((item) => item.id !== transaction.id))}
                          className="btn-ghost px-2 py-1 text-negative"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {(['expense', 'income'] as const).map((type) => (
                        <button
                          key={`${transaction.id}-${type}`}
                          type="button"
                          onClick={() => updateTransaction(transaction.id, (current) => ({
                            ...current,
                            transactionType: type,
                            categoryId: current.categoryId && categories.some((category) => category.id === current.categoryId && category.category_type === type)
                              ? current.categoryId
                              : null,
                          }))}
                          className={`rounded-xl border px-3 py-2 text-sm font-600 ${
                            transaction.transactionType === type
                              ? type === 'income'
                                ? 'border-positive bg-positive-soft text-positive'
                                : 'border-negative bg-negative-soft text-negative'
                              : 'border-border text-muted-foreground'
                          }`}
                        >
                          {t(`transactions.types.${type}` as const, { ns: 'portal' })}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('transactions.merchantSource', { ns: 'portal' })}
                        </label>
                        <input
                          type="text"
                          className="input-base h-10 text-sm"
                          value={transaction.merchant}
                          onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, merchant: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('transactions.date', { ns: 'portal' })} *
                        </label>
                        <input
                          type="date"
                          className="input-base h-10 text-sm"
                          value={transaction.transactionDate}
                          onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, transactionDate: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('transactions.amount', { ns: 'portal' })} *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="input-base h-10 text-sm"
                          value={transaction.amount > 0 ? String(transaction.amount) : ''}
                          onChange={(event) => updateTransaction(transaction.id, (current) => ({
                            ...current,
                            amount: Number(event.target.value || 0),
                          }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('transactions.form.tax', { ns: 'portal', defaultValue: 'Tax' })}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input-base h-10 text-sm"
                          value={typeof transaction.tax === 'number' ? String(transaction.tax) : ''}
                          onChange={(event) => updateTransaction(transaction.id, (current) => ({
                            ...current,
                            tax: event.target.value ? Number(event.target.value) : null,
                          }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('transactions.currency', { ns: 'portal', defaultValue: 'Currency' })} *
                        </label>
                        <CurrencySelector
                          value={transaction.currency}
                          onChange={(currencyCode) => updateTransaction(transaction.id, (current) => ({ ...current, currency: currencyCode }))}
                          placeholder={t('settlements.chooseCurrency', { ns: 'portal' })}
                          disabled={!!transaction.accountId}
                          helperText={t('transactions.documentReview.accountCurrencyHint', {
                            ns: 'portal',
                            defaultValue: 'Currency follows the selected account.',
                          })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('transactions.account', { ns: 'portal' })} *
                        </label>
                        <select
                          className="input-base h-10 text-sm"
                          value={transaction.accountId}
                          onChange={(event) => {
                            const nextAccount = accounts.find((account) => account.id === event.target.value);
                            updateTransaction(transaction.id, (current) => ({
                              ...current,
                              accountId: event.target.value,
                              currency: nextAccount?.currency || current.currency,
                            }));
                          }}
                        >
                          <option value="">{t('transactions.selectAccount', { ns: 'portal' })}</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name} · {account.currency}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('transactions.category', { ns: 'portal' })}
                        </label>
                        <select
                          className="input-base h-10 text-sm"
                          value={transaction.categoryId || ''}
                          onChange={(event) => updateTransaction(transaction.id, (current) => ({
                            ...current,
                            categoryId: event.target.value || null,
                          }))}
                        >
                          <option value="">{t('transactions.noCategory', { ns: 'portal' })}</option>
                          {(transaction.transactionType === 'income'
                            ? filteredCategoriesByType.income
                            : filteredCategoriesByType.expense).map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('transactions.documentReview.receiptNumber', {
                            ns: 'portal',
                            defaultValue: 'Receipt / Reference Number',
                          })}
                        </label>
                        <input
                          type="text"
                          className="input-base h-10 text-sm"
                          value={transaction.receiptNumber}
                          onChange={(event) => updateTransaction(transaction.id, (current) => ({
                            ...current,
                            receiptNumber: event.target.value,
                          }))}
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-sm font-600 text-foreground">
                        {t('settlements.descriptionLabel', { ns: 'portal' })} *
                      </label>
                      <input
                        type="text"
                        className="input-base h-10 text-sm"
                        value={transaction.description}
                        onChange={(event) => updateTransaction(transaction.id, (current) => ({
                          ...current,
                          description: event.target.value,
                        }))}
                      />
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-sm font-600 text-foreground">
                        {t('transactions.notes', { ns: 'portal', defaultValue: 'Notes' })}
                      </label>
                      <textarea
                        rows={3}
                        className="input-base resize-none text-sm"
                        value={transaction.notes}
                        onChange={(event) => updateTransaction(transaction.id, (current) => ({
                          ...current,
                          notes: event.target.value,
                        }))}
                      />
                    </div>

                    {transaction.lineItems.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-border/70 bg-muted/10 p-3">
                        <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                          {t('transactions.documentReview.lineItemsTitle', {
                            ns: 'portal',
                            defaultValue: 'Detected line items',
                          })}
                        </p>
                        <div className="mt-2 space-y-2">
                          {transaction.lineItems.map((item, itemIndex) => (
                            <div key={`${transaction.id}-line-${itemIndex}`} className="flex items-start justify-between gap-3 rounded-xl bg-card px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="font-600 text-foreground">{item.name}</p>
                                {item.description ? (
                                  <p className="text-xs text-muted-foreground">{item.description}</p>
                                ) : null}
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                {typeof item.quantity === 'number' ? <p>Qty {item.quantity}</p> : null}
                                {typeof item.total === 'number' ? (
                                  <p>
                                    {formatCurrencyText(item.total, {
                                      currencyCode: transaction.currency || undefined,
                                      fallbackCurrencyCode: transaction.currency || 'USD',
                                      textOnly: true,
                                    })}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}

                {validationError ? (
                  <div className="rounded-xl border border-warning/20 bg-warning-soft p-3 text-sm text-warning">
                    {validationError}
                  </div>
                ) : (
                  <div className="rounded-xl border border-positive/20 bg-positive-soft p-3 text-sm text-positive">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} />
                      {t('transactions.documentReview.readyToSave', {
                        ns: 'portal',
                        defaultValue: 'Review looks complete and is ready to save.',
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isExtracting}
              className="btn-secondary w-full sm:w-auto"
            >
              {t('actions.cancel', { ns: 'common' })}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isExtracting || !!extractError || !!validationError}
              className="btn-primary w-full justify-center sm:w-auto"
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {t('transactions.documentReview.savingAction', {
                    ns: 'portal',
                    defaultValue: 'Saving...',
                  })}
                </>
              ) : (
                t('transactions.documentReview.confirmAndSave', {
                  ns: 'portal',
                  defaultValue: 'Confirm and Save',
                })
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
