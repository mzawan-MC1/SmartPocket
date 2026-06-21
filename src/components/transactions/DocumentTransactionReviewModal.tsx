'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, Image as ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import CurrencySelector from '@/components/CurrencySelector';
import { formatCurrencyText } from '@/lib/currency-formatting';
import TransactionDetailsModal from '@/components/transactions/TransactionDetailsModal';
import {
  classifyTransactionDocumentError,
  getTransactionDocumentDisplayTitle,
  getTransactionDocumentLineItemTotal,
  getTransactionDocumentTotalSummary,
  transactionDocumentLineItemsHaveValidTotals,
  type TransactionDocumentDuplicateMatch,
  type TransactionDocumentExtractResponse,
  type TransactionDocumentItemKind,
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

function createEditableLineItem() {
  return {
    name: '',
    description: '',
    quantity: 1,
    unitPrice: null,
    total: null,
    categoryId: null,
    itemKind: 'regular' as TransactionDocumentItemKind,
  };
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function formatOptionalNumberInput(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

const TRANSACTION_DOCUMENT_ITEM_KINDS: TransactionDocumentItemKind[] = [
  'regular',
  'discount',
  'tax',
  'fee',
];

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
    case 'migration_missing':
      return args.t('transactions.documentReview.errors.migrationMissing', { ns: 'portal' });
    case 'storage_bucket_failure':
      return args.t('transactions.documentReview.errors.storageBucketFailure', { ns: 'portal' });
    case 'openrouter_not_configured':
      return args.t('transactions.documentReview.errors.openrouterNotConfigured', { ns: 'portal' });
    case 'unsupported_multimodal_model':
      return args.t('transactions.documentReview.errors.unsupportedMultimodalModel', { ns: 'portal' });
    case 'provider_http_error':
      return args.t('transactions.documentReview.errors.providerHttpError', { ns: 'portal' });
    case 'invalid_ai_json_response':
      return args.t('transactions.documentReview.errors.invalidAiJsonResponse', { ns: 'portal' });
    case 'signed_url_failure':
      return args.t('transactions.documentReview.errors.signedUrlFailure', { ns: 'portal' });
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
  const [duplicateViewTransactionId, setDuplicateViewTransactionId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

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
      setDuplicateViewTransactionId(null);
      setRetryKey(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const runExtraction = async () => {
      setIsExtracting(true);
      setExtractError('');
      setJobId('');
      setDocumentId('');
      setPreviewUrl('');
      setDuplicates([]);
      setDuplicateConfirmed(false);
      setAccounts([]);
      setCategories([]);
      setReviewTransactions([]);
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
            lineItems: (draft.lineItems || []).map((lineItem) => ({
              name: lineItem.name || '',
              description: lineItem.description || '',
              quantity: typeof lineItem.quantity === 'number' ? lineItem.quantity : null,
              unitPrice: typeof lineItem.unitPrice === 'number' ? lineItem.unitPrice : null,
              total: typeof lineItem.total === 'number'
                ? lineItem.total
                : getTransactionDocumentLineItemTotal({
                    quantity: lineItem.quantity,
                    unitPrice: lineItem.unitPrice,
                    total: lineItem.total,
                  }) || null,
              categoryId: lineItem.categoryId || null,
              itemKind: lineItem.itemKind || 'regular',
            })),
            totalsConfirmed: false,
            confidence: draft.confidence,
            needsReview: draft.needsReview,
          } satisfies EditableDocumentTransaction;
        });

        setReviewTransactions(mappedTransactions);
      } catch (error) {
        if (cancelled) return;
        setExtractError(error instanceof Error ? error.message : 'Failed to extract the uploaded document.');
        setJobId('');
        setDocumentId('');
        setPreviewUrl('');
        setDuplicates([]);
        setAccounts([]);
        setCategories([]);
        setReviewTransactions([]);
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
  }, [file, isOpen, retryKey, sourceSurface, t]);

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

    const invalidLineItem = reviewTransactions.find((transaction) => transaction.lineItems.some((item) => {
      const computedTotal = getTransactionDocumentLineItemTotal(item);
      return !item.name.trim()
        || !Number.isFinite(computedTotal)
        || computedTotal <= 0
        || !transactionDocumentLineItemsHaveValidTotals([item]);
    }));
    if (invalidLineItem) {
      return t('transactions.documentReview.invalidLineItems', {
        ns: 'portal',
        defaultValue: 'Each saved receipt item needs a name and a valid total.',
      });
    }

    const requiresMismatchConfirmation = reviewTransactions.find((transaction) => {
      const totalSummary = getTransactionDocumentTotalSummary({
        amount: transaction.amount,
        tax: transaction.tax,
        lineItems: transaction.lineItems,
      });
      return totalSummary.requiresConfirmation && transaction.totalsConfirmed !== true;
    });
    if (requiresMismatchConfirmation) {
      return t('transactions.documentReview.confirmTotalsMismatch', {
        ns: 'portal',
        defaultValue: 'Confirm the meaningful total mismatch before saving.',
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

  const canRetry = !!file && !isExtracting && !isSaving;
  const canSave = !isExtracting
    && !isSaving
    && !extractError
    && !validationError
    && reviewTransactions.length > 0
    && !!jobId;

  const updateTransaction = (id: string, updater: (current: EditableDocumentTransaction) => EditableDocumentTransaction) => {
    setReviewTransactions((current) => current.map((transaction) => (
      transaction.id === id ? updater(transaction) : transaction
    )));
  };

  const updateLineItem = (
    transactionId: string,
    itemIndex: number,
    updater: (current: EditableDocumentTransaction['lineItems'][number]) => EditableDocumentTransaction['lineItems'][number]
  ) => {
    updateTransaction(transactionId, (current) => ({
      ...current,
      lineItems: current.lineItems.map((item, index) => (
        index === itemIndex ? updater(item) : item
      )),
      totalsConfirmed: false,
    }));
  };

  const addLineItem = (transactionId: string) => {
    updateTransaction(transactionId, (current) => ({
      ...current,
      lineItems: [...current.lineItems, createEditableLineItem()],
      totalsConfirmed: false,
    }));
  };

  const removeLineItem = (transactionId: string, itemIndex: number) => {
    updateTransaction(transactionId, (current) => ({
      ...current,
      lineItems: current.lineItems.filter((_, index) => index !== itemIndex),
      totalsConfirmed: false,
    }));
  };

  const handleSave = async () => {
    if (!canSave) {
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
            totalsConfirmed: transaction.totalsConfirmed === true,
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
    <>
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
      contentClassName="sm:w-[94vw] sm:max-w-[72rem] sm:max-h-[92vh]"
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
                  <button
                    type="button"
                    onClick={() => setRetryKey((current) => current + 1)}
                    disabled={!canRetry}
                    className="btn-secondary mt-3"
                  >
                    {t('transactions.documentReview.tryAgain', {
                      ns: 'portal',
                      defaultValue: 'Try Again',
                    })}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.45fr)] xl:gap-5">
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
                        <p className="mt-1 text-sm text-warning/90">
                          {t('transactions.documentReview.duplicateDescription', {
                            ns: 'portal',
                            defaultValue: 'This document appears to match an existing transaction. Review it before saving again.',
                          })}
                        </p>
                        <div className="mt-3 space-y-3">
                          {duplicates.map((duplicate) => (
                            <div key={`${duplicate.documentId}-${duplicate.reason}-${duplicate.transactionId || ''}`} className="rounded-xl bg-card/70 p-3 text-xs text-foreground">
                              <p className="text-sm font-600 leading-5 text-foreground">
                                {getTransactionDocumentDisplayTitle({
                                  merchant: duplicate.merchant,
                                  description: duplicate.description,
                                  hasDocument: true,
                                  fallbackLabel: t('transactions.documentReview.duplicateUnknownMerchant', {
                                    ns: 'portal',
                                    defaultValue: 'Existing document',
                                  }),
                                })}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span className="whitespace-nowrap">{duplicate.date || '—'}</span>
                                <span aria-hidden="true">·</span>
                                <span className="whitespace-nowrap">
                                  {typeof duplicate.total === 'number'
                                    ? formatCurrencyText(duplicate.total, {
                                        currencyCode: duplicate.currency || undefined,
                                        fallbackCurrencyCode: duplicate.currency || 'USD',
                                        textOnly: true,
                                      })
                                    : '—'}
                                </span>
                              </div>
                              {duplicate.transactionId ? (
                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setDuplicateViewTransactionId(duplicate.transactionId || null)}
                                    className="btn-secondary h-9 px-3 text-xs"
                                  >
                                    {t('transactions.documentReview.viewExistingTransaction', {
                                      ns: 'portal',
                                      defaultValue: 'View Existing Transaction',
                                    })}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            onClick={onClose}
                            className="btn-secondary w-full justify-center sm:w-auto"
                          >
                            {t('actions.cancel', { ns: 'common' })}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDuplicateConfirmed(true)}
                            className="btn-primary w-full justify-center sm:w-auto"
                          >
                            {t('transactions.documentReview.saveAnyway', {
                              ns: 'portal',
                              defaultValue: 'Save Anyway',
                            })}
                          </button>
                        </div>
                        {duplicateConfirmed ? (
                          <p className="mt-3 text-sm font-600 text-warning">
                            {t('transactions.documentReview.duplicateConfirmedLabel', {
                              ns: 'portal',
                              defaultValue: 'Duplicate warning confirmed. Saving still requires final review confirmation.',
                            })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                {reviewTransactions.map((transaction, index) => {
                  const lineItemCategories = transaction.transactionType === 'income'
                    ? filteredCategoriesByType.income
                    : filteredCategoriesByType.expense;
                  const totalSummary = getTransactionDocumentTotalSummary({
                    amount: transaction.amount,
                    tax: transaction.tax,
                    lineItems: transaction.lineItems,
                  });

                  return (
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
                            <span className="rounded-full bg-muted px-2 py-1 font-600 text-muted-foreground">
                              {t('transactions.documentReview.itemCountLabel', {
                                ns: 'portal',
                                count: transaction.lineItems.length,
                                defaultValue: '{{count}} items',
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
                              lineItems: current.lineItems.map((item) => ({
                                ...item,
                                categoryId: item.categoryId && categories.some((category) => category.id === item.categoryId && category.category_type === type)
                                  ? item.categoryId
                                  : null,
                              })),
                              totalsConfirmed: false,
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
                              totalsConfirmed: false,
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
                              totalsConfirmed: false,
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
                            {lineItemCategories.map((category) => (
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

                      <div className="mt-3 rounded-xl border border-border/70 bg-muted/10 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                            {t('transactions.documentReview.lineItemsTitle', {
                              ns: 'portal',
                              defaultValue: 'Detected line items',
                            })}
                          </p>
                          <button
                            type="button"
                            onClick={() => addLineItem(transaction.id)}
                            className="btn-secondary h-9 px-3 text-xs"
                          >
                            <Plus size={14} />
                            {t('transactions.documentReview.addItem', {
                              ns: 'portal',
                              defaultValue: 'Add Item',
                            })}
                          </button>
                        </div>

                        {transaction.lineItems.length === 0 ? (
                          <p className="mt-3 text-sm text-muted-foreground">
                            {t('transactions.documentReview.noLineItemsDetected', {
                              ns: 'portal',
                              defaultValue: 'No line items were detected. Add any missing items before saving.',
                            })}
                          </p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {transaction.lineItems.map((item, itemIndex) => {
                              const itemTotal = getTransactionDocumentLineItemTotal(item);

                              return (
                                <div key={`${transaction.id}-line-${itemIndex}`} className="rounded-xl border border-border/70 bg-card p-3">
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_120px] xl:items-end">
                                      <div className="min-w-0">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.itemName', {
                                          ns: 'portal',
                                          defaultValue: 'Item name',
                                        })}
                                        </label>
                                        <input
                                          type="text"
                                          className="input-base h-9 w-full min-w-0 text-[13px]"
                                          value={item.name}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            name: event.target.value,
                                          }))}
                                        />
                                      </div>
                                      <div className="min-w-0 xl:w-[120px]">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                          {t('transactions.documentReview.lineTotal', {
                                            ns: 'portal',
                                            defaultValue: 'Line total',
                                          })}
                                        </label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          className="input-base h-9 w-full min-w-0 text-[13px]"
                                          value={formatOptionalNumberInput(item.total)}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            total: parseOptionalNumber(event.target.value),
                                          }))}
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[82px_116px_minmax(145px,1fr)_116px] xl:items-end">
                                      <div className="min-w-0 xl:w-[82px]">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.quantity', {
                                          ns: 'portal',
                                          defaultValue: 'Quantity',
                                        })}
                                        </label>
                                        <input
                                          type="number"
                                          step="0.001"
                                          min="0"
                                          className="input-base h-9 w-full min-w-0 text-[13px]"
                                          value={formatOptionalNumberInput(item.quantity)}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            quantity: parseOptionalNumber(event.target.value),
                                          }))}
                                        />
                                      </div>
                                      <div className="min-w-0 xl:w-[116px]">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.unitPrice', {
                                          ns: 'portal',
                                          defaultValue: 'Unit price',
                                        })}
                                        </label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          className="input-base h-9 w-full min-w-0 text-[13px]"
                                          value={formatOptionalNumberInput(item.unitPrice)}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            unitPrice: parseOptionalNumber(event.target.value),
                                          }))}
                                        />
                                      </div>
                                      <div className="min-w-0">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.itemCategory', {
                                          ns: 'portal',
                                          defaultValue: 'Item category',
                                        })}
                                        </label>
                                        <select
                                          className="input-base h-9 w-full min-w-0 pr-10 text-[13px]"
                                          value={item.categoryId || ''}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            categoryId: event.target.value || null,
                                          }))}
                                        >
                                          <option value="">{t('transactions.noCategory', { ns: 'portal' })}</option>
                                          {lineItemCategories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                              {category.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="min-w-0 xl:w-[116px]">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.itemType', {
                                          ns: 'portal',
                                          defaultValue: 'Item type',
                                        })}
                                        </label>
                                        <select
                                          className="input-base h-9 w-full min-w-0 pr-10 text-[13px]"
                                          value={item.itemKind || 'regular'}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            itemKind: event.target.value as TransactionDocumentItemKind,
                                          }))}
                                        >
                                          {TRANSACTION_DOCUMENT_ITEM_KINDS.map((itemKind) => (
                                            <option key={`${transaction.id}-${itemIndex}-${itemKind}`} value={itemKind}>
                                              {t(`transactions.documentReview.itemKinds.${itemKind}` as const, {
                                                ns: 'portal',
                                                defaultValue: itemKind,
                                              })}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>

                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                      <div className="min-w-0 sm:flex-1">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.computedLineTotal', {
                                          ns: 'portal',
                                          defaultValue: 'Calculated line total',
                                        })}
                                        </label>
                                        <div className="flex h-9 items-center rounded-xl border border-border bg-muted/20 px-3 text-[13px] font-600 text-foreground whitespace-nowrap">
                                          {itemTotal > 0
                                            ? formatCurrencyText(itemTotal, {
                                                currencyCode: transaction.currency || undefined,
                                                fallbackCurrencyCode: transaction.currency || 'USD',
                                                textOnly: true,
                                              })
                                            : '—'}
                                        </div>
                                      </div>
                                      <div className="flex items-end justify-end">
                                        <button
                                          type="button"
                                          onClick={() => removeLineItem(transaction.id, itemIndex)}
                                          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-negative/30 bg-negative-soft px-3 text-xs font-600 text-negative transition-colors hover:bg-negative-soft/80 sm:w-auto"
                                        >
                                          <Trash2 size={14} />
                                          {t('transactions.documentReview.removeItem', {
                                            ns: 'portal',
                                            defaultValue: 'Remove',
                                          })}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-4 rounded-xl border border-border/70 bg-card p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                              {t('transactions.documentReview.totalsTitle', {
                                ns: 'portal',
                                defaultValue: 'Receipt totals',
                              })}
                            </p>
                            {totalSummary.hasMismatch ? (
                              <span className={`rounded-full px-2 py-1 text-xs font-700 ${
                                totalSummary.requiresConfirmation || totalSummary.hasOnlyRoundingMismatch
                                  ? 'bg-warning-soft text-warning'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {t('transactions.documentReview.mismatchAmountLabel', {
                                  ns: 'portal',
                                  amount: formatCurrencyText(Math.abs(totalSummary.mismatchAmount), {
                                    currencyCode: transaction.currency || undefined,
                                    fallbackCurrencyCode: transaction.currency || 'USD',
                                    textOnly: true,
                                  }),
                                  defaultValue: 'Mismatch {{amount}}',
                                })}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
                            {[
                              ['subtotal', totalSummary.subtotal],
                              ['tax', totalSummary.tax],
                              ['discount', totalSummary.discount],
                              ['fee', totalSummary.fee],
                              ['calculatedTotal', totalSummary.calculatedTotal],
                              ['receiptTotal', totalSummary.receiptTotal],
                            ].map(([key, value]) => (
                              <div key={`${transaction.id}-${key}`} className="rounded-xl bg-muted/20 px-3 py-2">
                                <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                                  {t(`transactions.documentReview.${key}` as const, {
                                    ns: 'portal',
                                    defaultValue: key,
                                  })}
                                </p>
                                <p className="mt-1 text-sm font-700 text-foreground">
                                  {formatCurrencyText(value as number, {
                                    currencyCode: transaction.currency || undefined,
                                    fallbackCurrencyCode: transaction.currency || 'USD',
                                    textOnly: true,
                                  })}
                                </p>
                              </div>
                            ))}
                          </div>

                          {totalSummary.hasMismatch ? (
                            <div className={`mt-3 rounded-xl border p-3 text-sm ${
                              totalSummary.requiresConfirmation
                                ? 'border-warning/30 bg-warning-soft text-warning'
                                : totalSummary.hasOnlyRoundingMismatch
                                  ? 'border-warning/20 bg-warning-soft/70 text-warning'
                                  : 'border-muted bg-muted/20 text-muted-foreground'
                            }`}>
                              <p className="font-600">
                                {t('transactions.documentReview.mismatchWarning', {
                                  ns: 'portal',
                                  defaultValue: 'Calculated total does not match the receipt total.',
                                })}
                              </p>
                              <p className="mt-1">
                                {totalSummary.hasOnlyRoundingMismatch
                                  ? t('transactions.documentReview.roundingMismatchHint', {
                                      ns: 'portal',
                                      defaultValue: 'This difference looks like a small rounding adjustment and will not block saving.',
                                    })
                                  : t('transactions.documentReview.meaningfulMismatchHint', {
                                      ns: 'portal',
                                      defaultValue: 'This difference is meaningful. Confirm it before saving.',
                                    })}
                              </p>
                              {totalSummary.requiresConfirmation ? (
                                <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
                                  <input
                                    type="checkbox"
                                    checked={transaction.totalsConfirmed === true}
                                    onChange={(event) => updateTransaction(transaction.id, (current) => ({
                                      ...current,
                                      totalsConfirmed: event.target.checked,
                                    }))}
                                    className="mt-0.5 rounded accent-accent"
                                  />
                                  <span>
                                    {t('transactions.documentReview.confirmMismatchLabel', {
                                      ns: 'portal',
                                      defaultValue: 'I confirmed this receipt total mismatch and still want to save.',
                                    })}
                                  </span>
                                </label>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}

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
            {extractError ? (
              <button
                type="button"
                onClick={() => setRetryKey((current) => current + 1)}
                disabled={!canRetry}
                className="btn-primary w-full justify-center sm:w-auto"
              >
                {t('transactions.documentReview.tryAgain', {
                  ns: 'portal',
                  defaultValue: 'Try Again',
                })}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
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
            )}
          </div>
        </div>
      </div>
      </Modal>
      <TransactionDetailsModal
        isOpen={!!duplicateViewTransactionId}
        transactionId={duplicateViewTransactionId}
        onClose={() => setDuplicateViewTransactionId(null)}
      />
    </>
  );
}
