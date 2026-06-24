'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, FileText, Image as ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import CurrencySelector from '@/components/CurrencySelector';
import { formatCurrencyText } from '@/lib/currency-formatting';
import TransactionDetailsModal from '@/components/transactions/TransactionDetailsModal';
import {
  TRANSACTION_DOCUMENT_ACCEPT_ATTRIBUTE,
  TRANSACTION_DOCUMENT_SUPPORTED_TYPES_LABEL,
  classifyTransactionDocumentError,
  formatTransactionDocumentFileSize,
  getTransactionDocumentMaxSizeLabel,
  getTransactionDocumentDisplayTitle,
  getTransactionDocumentLineItemTotal,
  getTransactionDocumentTotalSummary,
  transactionDocumentLineItemsHaveValidTotals,
  type TransactionDocumentErrorCode,
  type TransactionDocumentDuplicateMatch,
  type TransactionDocumentExtractResponse,
  type TransactionDocumentItemKind,
  type TransactionDocumentOptionCategory,
  type TransactionDocumentReviewInput,
  type TransactionDocumentSaveResponse,
  type TransactionDocumentSourceSurface,
} from '@/lib/transaction-documents';
import { prepareTransactionDocumentUpload } from '@/lib/transaction-documents-client';
import {
  getFinancialAccountDisplayLabel,
  getPreferredDocumentAccount,
} from '@/lib/financial-account-utils';

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

type ReceiptAllowanceSummary = {
  enabled: boolean;
  included: number;
  used: number;
  reserved: number;
  remaining: number;
  cycleEnd?: string | null;
};

function createTransactionDocumentUiError(
  code: TransactionDocumentErrorCode | null,
  message: string
) {
  const error = new Error(message) as Error & { code: TransactionDocumentErrorCode | null };
  error.code = code;
  return error;
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
    case 'empty_file':
      return args.t('transactions.documentReview.errors.emptyFile', {
        ns: 'portal',
        defaultValue: 'This file appears to be empty or unreadable. Choose another file.',
      });
    case 'invalid_type':
      return args.t('transactions.documentReview.errors.invalidType', { ns: 'portal' });
    case 'document_too_large':
      return args.t('transactions.documentReview.errors.uploadTooLarge', {
        ns: 'portal',
        maxSize: getTransactionDocumentMaxSizeLabel(),
        defaultValue: 'The selected file exceeds the upload limit. Choose a file smaller than {{maxSize}}.',
      });
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
    case 'receipt_feature_unavailable':
      return args.t('transactions.documentReview.errors.receiptFeatureUnavailable', {
        ns: 'portal',
        defaultValue: 'Receipt Intelligence is not included in your current plan.',
      });
    case 'receipt_no_documents_included':
      return args.t('transactions.documentReview.errors.receiptNoDocumentsIncluded', {
        ns: 'portal',
        defaultValue: 'Your plan does not include any Receipt Intelligence documents.',
      });
    case 'receipt_allowance_exhausted':
      return args.t('transactions.documentReview.errors.receiptAllowanceExhausted', {
        ns: 'portal',
        defaultValue: 'You have reached your monthly Receipt Intelligence limit.',
      });
    case 'duplicate_request_in_progress':
      return args.t('transactions.documentReview.errors.duplicateRequestInProgress', { ns: 'portal' });
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
  const [extractErrorCode, setExtractErrorCode] = useState<TransactionDocumentErrorCode | null>(null);
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
  const [receiptAllowance, setReceiptAllowance] = useState<ReceiptAllowanceSummary | null>(null);
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  const [activeFile, setActiveFile] = useState<File | null>(file);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const parseReceiptAllowanceSummary = (value: unknown): ReceiptAllowanceSummary | null => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const summary = 'summary' in record && typeof record.summary === 'object' && record.summary !== null
      ? record.summary as Record<string, unknown>
      : record;
    const enabled = summary.receiptIntelligenceEnabled === true || summary.receipt_intelligence_enabled === true;
    const included = typeof summary.receiptExtractionsIncluded === 'number'
      ? summary.receiptExtractionsIncluded
      : typeof summary.receipt_extractions_included === 'number'
        ? summary.receipt_extractions_included
        : typeof summary.monthlyReceiptExtractions === 'number'
          ? summary.monthlyReceiptExtractions
          : typeof summary.monthly_receipt_extractions === 'number'
            ? summary.monthly_receipt_extractions
            : 0;
    const used = typeof summary.receiptExtractionsUsed === 'number'
      ? summary.receiptExtractionsUsed
      : typeof summary.receipt_extractions_used === 'number'
        ? summary.receipt_extractions_used
        : 0;
    const reserved = typeof summary.receiptExtractionsReserved === 'number'
      ? summary.receiptExtractionsReserved
      : typeof summary.receipt_extractions_reserved === 'number'
        ? summary.receipt_extractions_reserved
        : 0;
    const remaining = typeof summary.receiptExtractionsRemaining === 'number'
      ? summary.receiptExtractionsRemaining
      : typeof summary.receipt_extractions_remaining === 'number'
        ? summary.receipt_extractions_remaining
      : Math.max(0, included - used - reserved);

    return {
      enabled,
      included: enabled ? included : 0,
      used,
      reserved,
      remaining: enabled ? remaining : 0,
      cycleEnd: typeof summary.cycleEnd === 'string'
        ? summary.cycleEnd
        : typeof summary.cycle_end === 'string'
          ? summary.cycle_end
          : null,
    };
  };

  useEffect(() => {
    if (!isOpen) {
      setActiveFile(null);
      return;
    }

    setActiveFile(file);
  }, [file, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeFile) {
      setIsExtracting(false);
      setIsSaving(false);
      setExtractError('');
      setExtractErrorCode(null);
      setJobId('');
      setDocumentId('');
      setPreviewUrl('');
      setDuplicates([]);
      setDuplicateConfirmed(false);
      setAccounts([]);
      setCategories([]);
      setReviewTransactions([]);
      setDuplicateViewTransactionId(null);
      setReceiptAllowance(null);
      setIsCheckingAllowance(false);
      setRetryKey(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const runExtraction = async () => {
      setIsExtracting(true);
      setExtractError('');
      setExtractErrorCode(null);
      setJobId('');
      setDocumentId('');
      setPreviewUrl('');
      setDuplicates([]);
      setDuplicateConfirmed(false);
      setAccounts([]);
      setCategories([]);
      setReviewTransactions([]);
      setReceiptAllowance(null);
      setIsCheckingAllowance(true);
      try {
        const preparedUpload = await prepareTransactionDocumentUpload(activeFile);
        if (!preparedUpload.ok) {
          const message = (() => {
            if (preparedUpload.errorCode === 'document_too_large') {
              return t('transactions.documentReview.errors.fileTooLargeDetailed', {
                ns: 'portal',
                actualSize: formatTransactionDocumentFileSize(activeFile.size),
                maxSize: getTransactionDocumentMaxSizeLabel(),
                defaultValue: 'This file is {{actualSize}}. The maximum allowed size is {{maxSize}}. Choose a smaller file.',
              });
            }
            if (preparedUpload.errorCode === 'invalid_type') {
              return t('transactions.documentReview.errors.invalidTypeDetailed', {
                ns: 'portal',
                supportedTypes: TRANSACTION_DOCUMENT_SUPPORTED_TYPES_LABEL,
                defaultValue: 'Supported file types: {{supportedTypes}}. Choose another file.',
              });
            }
            if (preparedUpload.errorCode === 'empty_file') {
              return t('transactions.documentReview.errors.emptyFile', {
                ns: 'portal',
                defaultValue: 'This file appears to be empty or unreadable. Choose another file.',
              });
            }

            return getLocalizedTransactionDocumentError({
              t,
              errorCode: preparedUpload.errorCode,
              errorMessage: preparedUpload.errorMessage,
              fallbackKey: 'invalidFile',
            });
          })();

          throw createTransactionDocumentUiError(preparedUpload.errorCode, message);
        }

        const allowanceResponse = await fetch('/api/subscription/summary', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (allowanceResponse.status === 401) {
          throw createTransactionDocumentUiError('unauthorized', getLocalizedTransactionDocumentError({
            t,
            errorCode: 'unauthorized',
            fallbackKey: 'extractFailed',
          }));
        }

        if (allowanceResponse.ok) {
          const allowancePayload = await allowanceResponse.json().catch(() => null);
          const nextAllowance = parseReceiptAllowanceSummary(allowancePayload);
          if (nextAllowance) {
            setReceiptAllowance(nextAllowance);
          }
        }

        setIsCheckingAllowance(false);

        const formData = new FormData();
        formData.set('file', preparedUpload.file);
        formData.set('sourceSurface', sourceSurface);
        formData.set('language', 'en');
        formData.set('idempotencyKey', crypto.randomUUID());

        const response = await fetch('/api/transaction-documents/extract', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        if (response.status === 413) {
          throw createTransactionDocumentUiError('document_too_large', t('transactions.documentReview.errors.uploadTooLarge', {
            ns: 'portal',
            maxSize: getTransactionDocumentMaxSizeLabel(),
            defaultValue: 'The selected file exceeds the upload limit. Choose a file smaller than {{maxSize}}.',
          }));
        }

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
          const errorCode = typeof result?.errorCode === 'string'
            ? result.errorCode as TransactionDocumentErrorCode
            : classifyTransactionDocumentError(result?.errorMessage);
          throw createTransactionDocumentUiError(errorCode, getLocalizedTransactionDocumentError({
            t,
            errorCode,
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

        const defaultAccount = getPreferredDocumentAccount(
          payload.options.accounts || [],
          'expense',
          payload.options.defaultCurrency
        ) || (payload.options.accounts || [])[0];
        const mappedTransactions = (payload.extraction.transactions || []).map((draft) => {
          const preferredAccount = getPreferredDocumentAccount(
            payload.options.accounts || [],
            draft.transactionType,
            draft.currency || defaultAccount?.currency
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
        const errorCode = typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: TransactionDocumentErrorCode }).code
          : classifyTransactionDocumentError(error);
        setExtractError(error instanceof Error ? error.message : 'Failed to extract the uploaded document.');
        setExtractErrorCode(errorCode);
        setJobId('');
        setDocumentId('');
        setPreviewUrl('');
        setDuplicates([]);
        setAccounts([]);
        setCategories([]);
        setReviewTransactions([]);
      } finally {
        if (!cancelled) {
          setIsCheckingAllowance(false);
          setIsExtracting(false);
        }
      }
    };

    runExtraction();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeFile, isOpen, retryKey, sourceSurface, t]);

  const hasDuplicates = duplicates.length > 0;
  const allowanceUsed = receiptAllowance ? receiptAllowance.used + receiptAllowance.reserved : 0;
  const isPlanRestrictedError = extractErrorCode === 'receipt_feature_unavailable' || extractErrorCode === 'receipt_no_documents_included';
  const isReceiptLimitError = extractErrorCode === 'receipt_allowance_exhausted';
  const isSelectionError = extractErrorCode === 'document_too_large'
    || extractErrorCode === 'invalid_type'
    || extractErrorCode === 'empty_file';
  const canRetry = !!activeFile
    && !isExtracting
    && !isSaving
    && !isSelectionError
    && !isPlanRestrictedError
    && !isReceiptLimitError;
  const extractErrorTitle = (() => {
    if (extractErrorCode === 'document_too_large') {
      return t('transactions.documentReview.fileTooLargeTitle', {
        ns: 'portal',
        defaultValue: 'File too large',
      });
    }
    if (extractErrorCode === 'invalid_type') {
      return t('transactions.documentReview.unsupportedFileTypeTitle', {
        ns: 'portal',
        defaultValue: 'Unsupported file type',
      });
    }
    if (extractErrorCode === 'empty_file') {
      return t('transactions.documentReview.invalidFileTitle', {
        ns: 'portal',
        defaultValue: 'Invalid file',
      });
    }
    if (extractErrorCode === 'receipt_allowance_exhausted') {
      return t('transactions.documentReview.limitReachedTitle', {
        ns: 'portal',
        defaultValue: 'Monthly limit reached',
      });
    }
    if (extractErrorCode === 'receipt_feature_unavailable') {
      return t('transactions.documentReview.upgradeRequiredTitle', {
        ns: 'portal',
        defaultValue: 'Upgrade required',
      });
    }
    if (extractErrorCode === 'receipt_no_documents_included') {
      return t('transactions.documentReview.receiptUnavailableTitle', {
        ns: 'portal',
        defaultValue: 'Receipt Intelligence unavailable',
      });
    }
    return t('transactions.documentReview.extractErrorTitle', {
      ns: 'portal',
      defaultValue: 'Extraction failed',
    });
  })();
  const receiptLimitHint = extractErrorCode === 'receipt_allowance_exhausted'
    ? t('transactions.documentReview.receiptLimitHint', {
        ns: 'portal',
        limit: receiptAllowance?.included ?? 0,
        resetDate: receiptAllowance?.cycleEnd
          ? new Intl.DateTimeFormat(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }).format(new Date(receiptAllowance.cycleEnd))
          : t('transactions.documentReview.nextBillingCycle', {
              ns: 'portal',
              defaultValue: 'the next billing cycle',
            }),
        defaultValue: 'Limit: {{limit}} documents. Resets on {{resetDate}}.',
      })
    : '';
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
        defaultValue: 'Review the totals difference before saving.',
      });
    }

    if (hasDuplicates && !duplicateConfirmed) {
      return t('transactions.documentReview.confirmDuplicateWarning', {
        ns: 'portal',
        defaultValue: 'Please confirm the duplicate warning above before saving.',
      });
    }

    return '';
  }, [duplicateConfirmed, hasDuplicates, reviewTransactions, t]);

  const canSave = !isExtracting
    && !isSaving
    && !extractError
    && !validationError
    && reviewTransactions.length > 0
    && !!jobId;
  const footerMessage = validationError || t('transactions.documentReview.readyToSave', {
    ns: 'portal',
    defaultValue: 'Review looks complete and is ready to save.',
  });
  const footerHelpText = extractError
    ? (receiptLimitHint || extractError)
    : footerMessage;

  const handleChooseAnotherFile = () => {
    replaceFileInputRef.current?.click();
  };

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
      contentClassName="sm:w-[92vw] sm:max-w-[1160px] sm:max-h-[90vh]"
      bodyClassName="overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        <input
          ref={replaceFileInputRef}
          type="file"
          accept={TRANSACTION_DOCUMENT_ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            if (nextFile) {
              setActiveFile(nextFile);
              setRetryKey(0);
            }
            event.currentTarget.value = '';
          }}
        />
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {receiptAllowance ? (
            <div className={`mb-4 rounded-2xl border p-3 ${
              !receiptAllowance.enabled
                ? 'border-border bg-secondary/20'
                : receiptAllowance.remaining > 0
                ? 'border-accent/20 bg-accent/5'
                : 'border-negative/20 bg-negative-soft'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                    {t('transactions.documentReview.receiptAllowanceTitle', {
                      ns: 'portal',
                      defaultValue: 'Receipt Intelligence',
                    })}
                  </p>
                  <p className="mt-1 text-sm font-700 text-foreground">
                    {receiptAllowance.enabled ? (
                      t('transactions.documentReview.receiptAllowanceUsedIncluded', {
                        ns: 'portal',
                        used: allowanceUsed,
                        included: receiptAllowance.included,
                        defaultValue: '{{used}} / {{included}} documents used',
                      })
                    ) : (
                      t('subscriptionBilling.disabled', {
                        ns: 'portal',
                        defaultValue: 'Not included',
                      })
                    )}
                  </p>
                </div>
                {receiptAllowance.enabled ? (
                  <div className="text-end">
                    <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                      {t('transactions.documentReview.receiptAllowanceRemainingLabel', {
                        ns: 'portal',
                        defaultValue: 'Remaining',
                      })}
                    </p>
                    <p className={`mt-1 text-lg font-800 ${
                      receiptAllowance.remaining > 0 ? 'text-foreground' : 'text-negative'
                    }`}>
                      {receiptAllowance.remaining}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
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
                    defaultValue: 'Validating the file, checking your allowance, reading the document, and preparing a review draft.',
                  })}
                </p>
                {isCheckingAllowance ? (
                  <p className="mt-2 text-xs font-600 text-muted-foreground">
                    {t('transactions.documentReview.checkingAllowance', {
                      ns: 'portal',
                      defaultValue: 'Checking remaining Receipt Intelligence documents...',
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : extractError ? (
            <div className="rounded-2xl border border-negative/20 bg-negative-soft p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 text-negative" />
                <div>
                  <p className="text-sm font-700 text-negative">
                    {extractErrorTitle}
                  </p>
                  <p className="mt-1 text-sm text-negative">{extractError}</p>
                  {receiptLimitHint ? (
                    <p className="mt-2 text-xs font-600 text-negative/80">{receiptLimitHint}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,0.56fr)_minmax(0,1fr)] lg:gap-4 xl:grid-cols-[minmax(310px,0.52fr)_minmax(0,1fr)] xl:gap-5">
              <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                  <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                    {activeFile?.type === 'application/pdf' ? (
                      <FileText size={16} className="text-accent" />
                    ) : (
                      <ImageIcon size={16} className="text-accent" />
                    )}
                    <h3 className="text-sm font-700 text-foreground">
                      {t('transactions.documentReview.previewTitle', {
                        ns: 'portal',
                        defaultValue: 'Original Preview',
                      })}
                    </h3>
                    </div>
                  </div>
                  <div className="px-4 py-4 sm:px-5">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {activeFile?.type === 'application/pdf' ? (
                      <iframe
                        src={previewUrl}
                        title={activeFile?.name || 'document-preview'}
                        className="h-[22rem] w-full bg-white lg:h-[26rem]"
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt={activeFile?.name || 'document-preview'}
                        className="h-[22rem] w-full object-contain bg-white lg:h-[26rem]"
                      />
                    )}
                  </div>
                  {activeFile ? (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p className="truncate font-600 text-foreground">{activeFile.name}</p>
                      <p>{formatTransactionDocumentFileSize(activeFile.size)}</p>
                    </div>
                  ) : null}
                  </div>
                </section>

                {hasDuplicates ? (
                  <section className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="mt-0.5 text-amber-700" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-700 text-amber-900">
                          {t('transactions.documentReview.duplicateTitle', {
                            ns: 'portal',
                            defaultValue: 'Possible duplicate',
                          })}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-amber-900/85">
                          {t('transactions.documentReview.duplicateDescription', {
                            ns: 'portal',
                            defaultValue: 'This receipt looks similar to one you already saved. Check the existing transaction before continuing.',
                          })}
                        </p>
                        <p className="mt-2 text-xs font-600 leading-5 text-amber-800/90">
                          {t('transactions.documentReview.duplicateGuidance', {
                            ns: 'portal',
                            defaultValue: 'Click "Save Anyway" only if you are sure this is a different transaction.',
                          })}
                        </p>
                        <div className="mt-3 space-y-3">
                          {duplicates.map((duplicate) => (
                            <div key={`${duplicate.documentId}-${duplicate.reason}-${duplicate.transactionId || ''}`} className="rounded-2xl border border-amber-200/80 bg-white/90 p-3 text-xs text-foreground">
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
                                    className="btn-secondary h-11 px-3 text-xs"
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
                            onClick={() => setDuplicateConfirmed(true)}
                            className="btn-secondary h-11 w-full justify-center border-amber-300 bg-white text-amber-900 hover:bg-amber-100 sm:w-auto"
                          >
                            {t('transactions.documentReview.saveAnyway', {
                              ns: 'portal',
                              defaultValue: 'Save Anyway',
                            })}
                          </button>
                        </div>
                        {duplicateConfirmed ? (
                          <p className="mt-3 text-sm font-600 text-amber-900">
                            {t('transactions.documentReview.duplicateConfirmedLabel', {
                              ns: 'portal',
                              defaultValue: 'Duplicate warning confirmed. You can save when the rest of the review is ready.',
                            })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </section>
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
                    <section key={transaction.id} className="overflow-hidden rounded-3xl border border-blue-200/70 bg-[#F5F9FF]">
                      <div className="border-b border-blue-200/70 px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-700 text-foreground">
                            {t('transactions.documentReview.detectedTransaction', {
                              ns: 'portal',
                              index: index + 1,
                              defaultValue: 'Draft Transaction {{index}}',
                            })}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded-full px-2 py-1 font-600 ${
                              transaction.needsReview ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {transaction.needsReview
                                ? t('transactions.documentReview.needsReview', { ns: 'portal', defaultValue: 'Needs review' })
                                : t('transactions.documentReview.readyLabel', { ns: 'portal', defaultValue: 'Looks good' })}
                            </span>
                            <span className="rounded-full bg-white/80 px-2 py-1 font-600 text-muted-foreground ring-1 ring-blue-100">
                              {t('transactions.documentReview.confidenceLabel', {
                                ns: 'portal',
                                value: Math.round(transaction.confidence * 100),
                                defaultValue: 'Confidence {{value}}%',
                              })}
                            </span>
                            <span className="rounded-full bg-white/80 px-2 py-1 font-600 text-muted-foreground ring-1 ring-blue-100">
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
                            className="btn-ghost min-h-11 px-2 py-1 text-negative"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                      </div>

                      <div className="space-y-4 px-4 py-4 sm:px-5">
                      <div className="grid grid-cols-2 gap-2 sm:max-w-[18rem]">
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
                            className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-600 ${
                              transaction.transactionType === type
                                ? type === 'income'
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : 'border-rose-300 bg-rose-50 text-rose-700'
                                : 'border-blue-200 bg-white/80 text-muted-foreground'
                            }`}
                          >
                            {t(`transactions.types.${type}` as const, { ns: 'portal' })}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">
                            {t('transactions.merchantSource', { ns: 'portal' })}
                          </label>
                          <input
                            type="text"
                            className="input-base min-h-11 text-sm"
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
                            className="input-base min-h-11 text-sm"
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
                            className="input-base min-h-11 text-sm"
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
                            className="input-base min-h-11 text-sm"
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
                            className="input-base min-h-11 text-sm"
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
                                {getFinancialAccountDisplayLabel(account, {
                                  includeCurrency: true,
                                  includeDefaultLabel: true,
                                })}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">
                            {t('transactions.category', { ns: 'portal' })}
                          </label>
                          <select
                            className="input-base min-h-11 text-sm"
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
                            className="input-base min-h-11 text-sm"
                            value={transaction.receiptNumber}
                            onChange={(event) => updateTransaction(transaction.id, (current) => ({
                              ...current,
                              receiptNumber: event.target.value,
                            }))}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-600 text-foreground">
                          {t('settlements.descriptionLabel', { ns: 'portal' })} *
                        </label>
                        <input
                          type="text"
                          className="input-base min-h-11 text-sm"
                          value={transaction.description}
                          onChange={(event) => updateTransaction(transaction.id, (current) => ({
                            ...current,
                            description: event.target.value,
                          }))}
                        />
                      </div>

                      <div>
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

                      <section className="rounded-2xl border border-blue-200/70 bg-white/55 p-3.5 sm:p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h4 className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                            {t('transactions.documentReview.lineItemsTitle', {
                              ns: 'portal',
                              defaultValue: 'Detected line items',
                            })}
                          </h4>
                          <button
                            type="button"
                            onClick={() => addLineItem(transaction.id)}
                            className="btn-secondary min-h-11 px-3 text-xs"
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
                                <div key={`${transaction.id}-line-${itemIndex}`} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-3.5">
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_92px_132px_140px] md:items-end">
                                      <div className="min-w-0">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.itemName', {
                                          ns: 'portal',
                                          defaultValue: 'Item name',
                                        })}
                                        </label>
                                        <input
                                          type="text"
                                          className="input-base min-h-11 w-full min-w-0 text-[13px]"
                                          value={item.name}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            name: event.target.value,
                                          }))}
                                        />
                                      </div>
                                      <div className="min-w-0 md:w-[92px]">
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
                                          className="input-base min-h-11 w-full min-w-0 text-[13px]"
                                          value={formatOptionalNumberInput(item.quantity)}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            quantity: parseOptionalNumber(event.target.value),
                                          }))}
                                        />
                                      </div>
                                      <div className="min-w-0 md:w-[132px]">
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
                                          className="input-base min-h-11 w-full min-w-0 text-[13px]"
                                          value={formatOptionalNumberInput(item.unitPrice)}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            unitPrice: parseOptionalNumber(event.target.value),
                                          }))}
                                        />
                                      </div>
                                      <div className="min-w-0 md:w-[140px]">
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
                                          className="input-base min-h-11 w-full min-w-0 text-[13px]"
                                          value={formatOptionalNumberInput(item.total)}
                                          onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({
                                            ...current,
                                            total: parseOptionalNumber(event.target.value),
                                          }))}
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(150px,1fr)_132px] lg:items-end">
                                      <div className="min-w-0">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.itemCategory', {
                                          ns: 'portal',
                                          defaultValue: 'Item category',
                                        })}
                                        </label>
                                        <select
                                          className="input-base min-h-11 w-full min-w-0 pr-10 text-[13px]"
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
                                      <div className="min-w-0 lg:w-[132px]">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.itemType', {
                                          ns: 'portal',
                                          defaultValue: 'Item type',
                                        })}
                                        </label>
                                        <select
                                          className="input-base min-h-11 w-full min-w-0 pr-10 text-[13px]"
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

                                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                      <div className="min-w-0 sm:flex-1">
                                        <label className="mb-1 block whitespace-nowrap text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                                        {t('transactions.documentReview.computedLineTotal', {
                                          ns: 'portal',
                                          defaultValue: 'Calculated line total',
                                        })}
                                        </label>
                                        <div className="flex min-h-11 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-600 text-foreground whitespace-nowrap">
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
                                          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-xs font-600 text-rose-700 transition-colors hover:bg-rose-100 md:w-auto"
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

                        <section className="rounded-2xl border border-amber-200/80 bg-[#FFF9F0] p-3.5 sm:p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h4 className="text-xs font-700 uppercase tracking-wide text-amber-900/70">
                              {t('transactions.documentReview.totalsTitle', {
                                ns: 'portal',
                                defaultValue: 'Receipt totals',
                              })}
                            </h4>
                            {totalSummary.hasMismatch ? (
                              <span className={`rounded-full px-2 py-1 text-xs font-700 ${
                                totalSummary.requiresConfirmation || totalSummary.hasOnlyRoundingMismatch
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-white/80 text-muted-foreground'
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
                          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                            {[
                              ['subtotal', totalSummary.subtotal],
                              ['tax', totalSummary.tax],
                              ['discount', totalSummary.discount],
                              ['fee', totalSummary.fee],
                              ['calculatedTotal', totalSummary.calculatedTotal],
                              ['receiptTotal', totalSummary.receiptTotal],
                            ].map(([key, value]) => (
                              <div key={`${transaction.id}-${key}`} className={`rounded-2xl border px-3 py-3 ${
                                key === 'calculatedTotal' || key === 'receiptTotal'
                                  ? 'border-amber-300 bg-white'
                                  : 'border-amber-200/70 bg-white/70'
                              }`}>
                                <p className="text-xs font-700 uppercase tracking-wide text-amber-900/60">
                                  {t(`transactions.documentReview.${key}` as const, {
                                    ns: 'portal',
                                    defaultValue: key,
                                  })}
                                </p>
                                <p className={`mt-1 font-700 text-foreground ${
                                  key === 'calculatedTotal' || key === 'receiptTotal' ? 'text-base' : 'text-sm'
                                }`}>
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
                            <div className={`mt-3 rounded-2xl border p-3 text-sm ${
                              totalSummary.requiresConfirmation
                                ? 'border-amber-300 bg-amber-100 text-amber-900'
                                : totalSummary.hasOnlyRoundingMismatch
                                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                                  : 'border-amber-200 bg-white/80 text-muted-foreground'
                            }`}>
                              <p className="font-700">
                                {t('transactions.documentReview.mismatchTitle', {
                                  ns: 'portal',
                                  defaultValue: 'Totals do not match',
                                })}
                              </p>
                              <p className="mt-1 leading-6">
                                {t('transactions.documentReview.mismatchWarning', {
                                  ns: 'portal',
                                  defaultValue: 'The calculated total is different from the receipt total. Review the amounts before saving.',
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
                                      defaultValue: 'I reviewed the difference and still want to save.',
                                    })}
                                  </span>
                                </label>
                              ) : null}
                            </div>
                          ) : null}
                        </section>
                      </section>
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="safe-area-bottom border-t border-border/80 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className={`text-sm ${
              extractError
                ? 'text-muted-foreground'
                : validationError
                  ? 'text-amber-800'
                  : 'text-muted-foreground'
            }`}>
              {footerHelpText}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isExtracting}
              className="btn-secondary min-h-11 w-full sm:w-auto"
            >
              {t('actions.cancel', { ns: 'common' })}
            </button>
            {extractError ? (
              isSelectionError ? (
                <button
                  type="button"
                  onClick={handleChooseAnotherFile}
                  className="btn-primary min-h-11 w-full justify-center sm:w-auto"
                >
                  {t('transactions.documentReview.chooseAnotherFile', {
                    ns: 'portal',
                    defaultValue: 'Choose another file',
                  })}
                </button>
              ) : canRetry ? (
                <button
                  type="button"
                  onClick={() => setRetryKey((current) => current + 1)}
                  disabled={!canRetry}
                  className="btn-primary min-h-11 w-full justify-center sm:w-auto"
                >
                  {t('transactions.documentReview.tryAgain', {
                    ns: 'portal',
                    defaultValue: 'Try Again',
                  })}
                </button>
              ) : (extractErrorCode === 'receipt_feature_unavailable' || extractErrorCode === 'receipt_no_documents_included') ? (
                <Link href="/settings/subscription" className="btn-primary min-h-11 w-full justify-center sm:w-auto">
                  {t('subscriptionBilling.upgrade', {
                    ns: 'portal',
                    defaultValue: 'Upgrade',
                  })}
                </Link>
              ) : null
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="btn-primary min-h-11 w-full justify-center sm:w-auto"
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
