'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  getTransactionDocumentLineItemValidation,
  getTransactionDocumentLineItemTotal,
  getTransactionDocumentTotalSummary,
  type TransactionDocumentErrorCode,
  type TransactionDocumentDuplicateMatch,
  type TransactionDocumentExtractResponse,
  type TransactionDocumentItemKind,
  type TransactionDocumentOptionCategory,
  type TransactionDocumentReviewInput,
  type TransactionDocumentSaveRequest,
  type TransactionDocumentSaveResponse,
  type TransactionDocumentSourceSurface,
} from '@/lib/transaction-documents';
import {
  prepareTransactionDocumentUpload,
  submitTransactionDocumentExtraction,
} from '@/lib/transaction-documents-client';
import {
  getFinancialAccountDisplayLabel,
  getPreferredDocumentAccount,
} from '@/lib/financial-account-utils';
import {
  clampTransactionDocumentProgress,
  getTransactionDocumentStageProgress,
  type TransactionDocumentProcessingStage,
} from '@/lib/transaction-document-processing';
import { trackReceiptScanUsed } from '@/lib/analytics';
import { createClientId } from '@/lib/uuid';

type EditableDocumentTransaction = TransactionDocumentReviewInput & {
  id: string;
  confidence: number;
  needsReview: boolean;
};

type TransactionDocumentSaveErrorResponse = {
  success?: false;
  duplicates?: TransactionDocumentDuplicateMatch[];
  errorCode?: string;
  errorMessage?: string;
  message?: string;
  referenceId?: string;
};

type TransactionDocumentSaveApiResponse =
  | TransactionDocumentSaveResponse
  | TransactionDocumentSaveErrorResponse;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTransactionDocumentDuplicateMatch(value: unknown): value is TransactionDocumentDuplicateMatch {
  return isObjectRecord(value) && typeof value.documentId === 'string';
}

function isTransactionDocumentSaveResponse(value: unknown): value is TransactionDocumentSaveResponse {
  return isObjectRecord(value)
    && value.success === true
    && typeof value.jobId === 'string'
    && typeof value.documentId === 'string'
    && (typeof value.primaryTransactionId === 'string' || value.primaryTransactionId === null)
    && Array.isArray(value.transactionIds)
    && value.transactionIds.every((transactionId) => typeof transactionId === 'string')
    && typeof value.savedCount === 'number';
}

function parseTransactionDocumentSaveApiResponse(value: unknown): TransactionDocumentSaveApiResponse {
  if (isTransactionDocumentSaveResponse(value)) {
    return value;
  }

  if (!isObjectRecord(value)) {
    return {};
  }

  return {
    success: value.success === false ? false : undefined,
    duplicates: Array.isArray(value.duplicates)
      ? value.duplicates.filter(isTransactionDocumentDuplicateMatch)
      : undefined,
    errorCode: typeof value.errorCode === 'string' ? value.errorCode : undefined,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    referenceId: typeof value.referenceId === 'string' ? value.referenceId : undefined,
  };
}

function createLocalId() {
  return createClientId();
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

function formatDuplicateCandidateAmount(args: {
  amount: number;
  currency?: string | null;
  currencyUnavailableLabel: string;
}) {
  if (args.currency) {
    return formatCurrencyText(args.amount, {
      currencyCode: args.currency,
      textOnly: true,
    });
  }

  return `${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(args.amount)} · ${args.currencyUnavailableLabel}`;
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

type TransactionFieldKey =
  | 'transactionDate'
  | 'amount'
  | 'currency'
  | 'accountId'
  | 'description';

type LineItemFieldKey = 'name' | 'total';

type LineItemValidationState = {
  itemIndex: number;
  fields: LineItemFieldKey[];
  nameMessage: string;
  totalMessage: string;
};

type ReviewTransactionValidationState = {
  transactionId: string;
  transactionFields: TransactionFieldKey[];
  lineItemErrors: LineItemValidationState[];
  totalsMismatchActive: boolean;
  totalsMismatchBlocking: boolean;
  totalSummary: ReturnType<typeof getTransactionDocumentTotalSummary>;
};

type ReviewValidationState = {
  duplicateActive: boolean;
  duplicateBlocking: boolean;
  transactions: ReviewTransactionValidationState[];
  hasTransactionErrors: boolean;
  hasLineItemErrors: boolean;
  totalsMismatchBlocking: boolean;
  canSubmit: boolean;
  firstBlockingTargetId: string | null;
  footerMessage: string;
};

type TransactionDocumentExtractErrorBody = {
  success?: false;
  errorCode?: string;
  errorMessage?: string;
  referenceId?: string;
  message?: string;
};

type TransactionDocumentProcessingState = {
  active: boolean;
  stage: TransactionDocumentProcessingStage;
  progress: number;
  startedAt: number | null;
  completedAt: number | null;
};

function getTransactionFieldElementId(transactionId: string, field: TransactionFieldKey) {
  return `document-review-${transactionId}-${field}`;
}

function getLineItemFieldElementId(transactionId: string, itemIndex: number, field: LineItemFieldKey) {
  return `document-review-${transactionId}-line-${itemIndex}-${field}`;
}

function getTotalsElementId(transactionId: string) {
  return `document-review-${transactionId}-totals`;
}

function getFieldErrorClass(hasError: boolean) {
  return hasError
    ? 'border-negative/60 bg-negative-soft/40 text-foreground focus:border-negative focus:ring-negative/20'
    : '';
}

function getLineItemValidationIssue(item: EditableDocumentTransaction['lineItems'][number]) {
  const validation = getTransactionDocumentLineItemValidation(item);

  if (!validation.hasName) {
    return 'name';
  }

  if (!validation.hasResolvableTotal || !validation.totalAligned || !validation.hasValidTotal) {
    return 'total';
  }

  return null;
}

function buildEditableTransactionDescription(draft: {
  description?: string;
  merchant?: string;
  lineItems?: Array<{ name?: string }>;
}) {
  const directDescription = (draft.description || '').trim();
  if (directDescription) {
    return directDescription;
  }

  const merchant = (draft.merchant || '').trim();
  if (merchant) {
    return merchant;
  }

  const lineItemNames = Array.isArray(draft.lineItems)
    ? draft.lineItems
        .map((lineItem) => (lineItem.name || '').trim())
        .filter((name) => name.length > 0)
        .slice(0, 3)
    : [];

  return lineItemNames.join(', ');
}

function createTransactionDocumentUiError(
  code: TransactionDocumentErrorCode | null,
  message: string,
  referenceId?: string | null
) {
  const error = new Error(message) as Error & {
    code: TransactionDocumentErrorCode | null;
    referenceId?: string | null;
  };
  error.code = code;
  error.referenceId = referenceId;
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTransactionDocumentExtractResponseBody(
  value: unknown
): value is TransactionDocumentExtractResponse {
  return isRecord(value)
    && value.success === true
    && typeof value.jobId === 'string'
    && typeof value.documentId === 'string'
    && typeof value.previewUrl === 'string'
    && isRecord(value.extraction)
    && isRecord(value.options);
}

function getTransactionDocumentExtractErrorBody(
  value: unknown
): TransactionDocumentExtractErrorBody {
  if (!isRecord(value)) {
    return {};
  }

  return {
    success: value.success === false ? false : undefined,
    errorCode: typeof value.errorCode === 'string' ? value.errorCode : undefined,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    referenceId: typeof value.referenceId === 'string' ? value.referenceId : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
  };
}

function formatElapsedDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
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
    case 'provider_timeout':
      return args.t('transactions.documentReview.errors.providerTimeout', {
        ns: 'portal',
        defaultValue: 'Receipt extraction is taking longer than expected. Please try again.',
      });
    case 'provider_rate_limited':
      return args.t('transactions.documentReview.errors.providerRateLimited', {
        ns: 'portal',
        defaultValue: 'Receipt extraction is temporarily rate limited. Please try again shortly.',
      });
    case 'provider_unavailable':
      return args.t('transactions.documentReview.errors.providerUnavailable', {
        ns: 'portal',
        defaultValue: 'Receipt extraction is temporarily unavailable. Please try again.',
      });
    case 'invalid_ai_json_response':
      return args.t('transactions.documentReview.errors.invalidAiJsonResponse', { ns: 'portal' });
    case 'invalid_extraction_response':
      return args.t('transactions.documentReview.errors.invalidExtractionResponse', {
        ns: 'portal',
        defaultValue: 'The receipt was processed, but the extracted data could not be validated.',
      });
    case 'unreadable_document':
      return args.t('transactions.documentReview.errors.unreadableDocument', {
        ns: 'portal',
        defaultValue: 'We could not read enough information from this document. Try a clearer photo.',
      });
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
    case 'duplicate_confirmation_required':
      return args.t('transactions.documentReview.errors.duplicateConfirmLabel', {
        ns: 'portal',
        defaultValue: 'Confirm the duplicate warning before saving.',
      });
    case 'invalid_amount':
      return args.t('transactions.documentReview.errors.invalidAmount', { ns: 'portal' });
    case 'invalid_line_item':
      return args.t('transactions.documentReview.errors.invalidLineItem', {
        ns: 'portal',
        defaultValue: 'One or more reviewed line items are invalid.',
      });
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
    case 'database_conflict':
      return args.t('transactions.documentReview.errors.databaseConflict', {
        ns: 'portal',
        defaultValue: 'This document could not be saved because of a data conflict. Please refresh and try again.',
      });
    case 'database_unavailable':
      return args.t('transactions.documentReview.errors.databaseUnavailable', {
        ns: 'portal',
        defaultValue: 'Receipt saving is temporarily unavailable. Please try again shortly.',
      });
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
  const { t, i18n } = useTranslation(['portal', 'common']);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractErrorCode, setExtractErrorCode] = useState<TransactionDocumentErrorCode | null>(null);
  const [extractReferenceId, setExtractReferenceId] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveErrorCode, setSaveErrorCode] = useState<TransactionDocumentErrorCode | null>(null);
  const [saveReferenceId, setSaveReferenceId] = useState('');
  const [jobId, setJobId] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [duplicates, setDuplicates] = useState<TransactionDocumentDuplicateMatch[]>([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [accounts, setAccounts] = useState<TransactionDocumentExtractResponse['options']['accounts']>([]);
  const [categories, setCategories] = useState<TransactionDocumentExtractResponse['options']['categories']>([]);
  const [reviewTransactions, setReviewTransactions] = useState<EditableDocumentTransaction[]>([]);
  const [duplicateViewTransactionId, setDuplicateViewTransactionId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [receiptAllowance, setReceiptAllowance] = useState<ReceiptAllowanceSummary | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  const [activeFile, setActiveFile] = useState<File | null>(file);
  const [expandedTransactionDetails, setExpandedTransactionDetails] = useState<Record<string, boolean>>({});
  const [expandedLineItems, setExpandedLineItems] = useState<Record<string, number | null>>({});
  const [showOnlyInvalidItems, setShowOnlyInvalidItems] = useState<Record<string, boolean>>({});
  const [processingState, setProcessingState] = useState<TransactionDocumentProcessingState>({
    active: false,
    stage: 'preparing_file',
    progress: 0,
    startedAt: null,
    completedAt: null,
  });
  const [processingMessageIndex, setProcessingMessageIndex] = useState(0);
  const [processingNow, setProcessingNow] = useState(() => Date.now());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const lineItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const extractionAbortControllerRef = useRef<AbortController | null>(null);
  const extractionRequestSequenceRef = useRef(0);

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

  const refreshReceiptAllowanceSummary = useCallback(async (signal?: AbortSignal) => {
    const allowanceResponse = await fetch('/api/subscription/summary', {
      cache: 'no-store',
      signal,
    });

    if (allowanceResponse.status === 401) {
      throw createTransactionDocumentUiError('unauthorized', getLocalizedTransactionDocumentError({
        t,
        errorCode: 'unauthorized',
        fallbackKey: 'extractFailed',
      }));
    }

    if (!allowanceResponse.ok) {
      return null;
    }

    const allowancePayload = await allowanceResponse.json().catch(() => null);
    const nextAllowance = parseReceiptAllowanceSummary(allowancePayload);
    if (nextAllowance) {
      setReceiptAllowance(nextAllowance);
    }
    return nextAllowance;
  }, [t]);

  const resetProcessingState = useCallback(() => {
    setProcessingState({
      active: false,
      stage: 'preparing_file',
      progress: 0,
      startedAt: null,
      completedAt: null,
    });
    setProcessingMessageIndex(0);
  }, []);

  const updateProcessingState = useCallback((
    stage: TransactionDocumentProcessingStage,
    options?: {
      ratio?: number;
      progress?: number;
      active?: boolean;
      completedAt?: number | null;
    }
  ) => {
    setProcessingState((current) => {
      const nextProgress = clampTransactionDocumentProgress(
        Math.max(
          current.progress,
          typeof options?.progress === 'number'
            ? options.progress
            : getTransactionDocumentStageProgress(stage, options?.ratio)
        ),
        0,
        stage === 'ready' ? 100 : 99
      );

      return {
        active: options?.active ?? true,
        stage,
        progress: nextProgress,
        startedAt: current.startedAt ?? Date.now(),
        completedAt: options?.completedAt ?? (stage === 'ready' ? Date.now() : null),
      };
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    applyPreference();
    mediaQuery.addEventListener('change', applyPreference);
    return () => {
      mediaQuery.removeEventListener('change', applyPreference);
    };
  }, []);

  useEffect(() => {
    if (!isExtracting || !processingState.active) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setProcessingNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [isExtracting, processingState.active]);

  useEffect(() => {
    setProcessingMessageIndex(0);
  }, [processingState.stage]);

  useEffect(() => {
    if (!isExtracting || !processingState.active || prefersReducedMotion) {
      return undefined;
    }

    const stageSoftCaps: Partial<Record<TransactionDocumentProcessingStage, number>> = {
      reading_receipt: getTransactionDocumentStageProgress('reading_receipt', 0.92),
      extracting_details: getTransactionDocumentStageProgress('extracting_details', 0.95),
      checking_results: getTransactionDocumentStageProgress('checking_results', 0.9),
      preparing_review: getTransactionDocumentStageProgress('preparing_review', 0.85),
    };
    const incrementByStage: Partial<Record<TransactionDocumentProcessingStage, number>> = {
      reading_receipt: 1,
      extracting_details: 1,
      checking_results: 1,
      preparing_review: 1,
    };
    const cap = stageSoftCaps[processingState.stage];
    const increment = incrementByStage[processingState.stage];
    if (typeof cap !== 'number' || typeof increment !== 'number') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setProcessingState((current) => {
        if (!current.active || current.stage !== processingState.stage) {
          return current;
        }
        if (current.progress >= cap) {
          return current;
        }
        return {
          ...current,
          progress: Math.min(cap, current.progress + increment),
        };
      });
    }, processingState.stage === 'extracting_details' ? 700 : 900);

    return () => {
      window.clearInterval(interval);
    };
  }, [isExtracting, prefersReducedMotion, processingState.active, processingState.stage]);

  useEffect(() => {
    if (!isOpen) {
      setActiveFile(null);
      return;
    }

    setActiveFile(file);
  }, [file, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeFile) {
      extractionAbortControllerRef.current?.abort();
      extractionAbortControllerRef.current = null;
      setIsExtracting(false);
      setIsSaving(false);
      setExtractError('');
      setExtractErrorCode(null);
      setExtractReferenceId('');
      setSaveError('');
      setSaveErrorCode(null);
      setSaveReferenceId('');
      setJobId('');
      setPreviewUrl('');
      setDuplicateConfirmed(false);
      setAccounts([]);
      setCategories([]);
      setReviewTransactions([]);
      setDuplicateViewTransactionId(null);
      setReceiptAllowance(null);
      setExtractionWarnings([]);
      setIsCheckingAllowance(false);
      setRetryKey(0);
      setExpandedTransactionDetails({});
      setExpandedLineItems({});
      setShowOnlyInvalidItems({});
      resetProcessingState();
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    extractionAbortControllerRef.current = controller;
    const requestSequence = extractionRequestSequenceRef.current + 1;
    extractionRequestSequenceRef.current = requestSequence;

    const runExtraction = async () => {
      const extractionStartedAt = Date.now();
      setIsExtracting(true);
      setExtractError('');
      setExtractErrorCode(null);
      setExtractReferenceId('');
      setSaveError('');
      setSaveErrorCode(null);
      setSaveReferenceId('');
      setJobId('');
      setPreviewUrl('');
      setDuplicates([]);
      setDuplicateConfirmed(false);
      setAccounts([]);
      setCategories([]);
      setReviewTransactions([]);
      setReceiptAllowance(null);
      setExtractionWarnings([]);
      setIsCheckingAllowance(true);
      setExpandedTransactionDetails({});
      setExpandedLineItems({});
      setShowOnlyInvalidItems({});
      setProcessingNow(extractionStartedAt);
      setProcessingMessageIndex(0);
      setProcessingState({
        active: true,
        stage: 'preparing_file',
        progress: 0,
        startedAt: extractionStartedAt,
        completedAt: null,
      });
      try {
        updateProcessingState('preparing_file', { ratio: 0.25 });
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

        updateProcessingState('preparing_file', { ratio: preparedUpload.optimized ? 1 : 0.75 });

        void refreshReceiptAllowanceSummary(controller.signal)
          .catch(() => undefined)
          .finally(() => {
            if (!cancelled && extractionRequestSequenceRef.current === requestSequence) {
              setIsCheckingAllowance(false);
            }
          });

        updateProcessingState('uploading_document', { progress: 10 });
        const response = await submitTransactionDocumentExtraction({
          request: {
            file: preparedUpload.file,
            sourceSurface,
            language: i18n.resolvedLanguage || i18n.language || 'en',
            idempotencyKey: createClientId(),
          },
          signal: controller.signal,
          onUploadProgress: (progress) => {
            if (cancelled || extractionRequestSequenceRef.current !== requestSequence) {
              return;
            }
            updateProcessingState('uploading_document', { ratio: progress.progress });
          },
          onUploadFinished: () => {
            if (cancelled || extractionRequestSequenceRef.current !== requestSequence) {
              return;
            }
            trackReceiptScanUsed({
              source: sourceSurface,
              method: activeFile?.type === 'application/pdf' ? 'pdf' : 'image',
            });
            updateProcessingState('reading_receipt', { progress: 30 });
            window.setTimeout(() => {
              if (cancelled || extractionRequestSequenceRef.current !== requestSequence) {
                return;
              }
              updateProcessingState('extracting_details', {
                progress: getTransactionDocumentStageProgress('extracting_details', 0.2),
              });
            }, prefersReducedMotion ? 500 : 900);
          },
        });
        if (response.status === 413) {
          throw createTransactionDocumentUiError('document_too_large', t('transactions.documentReview.errors.uploadTooLarge', {
            ns: 'portal',
            maxSize: getTransactionDocumentMaxSizeLabel(),
            defaultValue: 'The selected file exceeds the upload limit. Choose a file smaller than {{maxSize}}.',
          }));
        }
        const responseBody = response.body;
        if (response.status < 200 || response.status >= 300 || !isTransactionDocumentExtractResponseBody(responseBody)) {
          const errorBody = getTransactionDocumentExtractErrorBody(responseBody);
          const errorCode = errorBody.errorCode
            ? errorBody.errorCode as TransactionDocumentErrorCode
            : classifyTransactionDocumentError(errorBody.errorMessage);
          const referenceId = errorBody.referenceId || '';
          const safeMessage = errorBody.message || errorBody.errorMessage || '';
          throw createTransactionDocumentUiError(errorCode, safeMessage || getLocalizedTransactionDocumentError({
            t,
            errorCode,
            errorMessage: safeMessage || errorBody.errorMessage,
            fallbackKey: 'extractFailed',
          }), referenceId);
        }

        if (cancelled || extractionRequestSequenceRef.current !== requestSequence) return;
        const payload = responseBody;
        updateProcessingState('checking_results', { progress: 82 });
        setJobId(payload.jobId);
        setSaveError('');
        setSaveErrorCode(null);
        setSaveReferenceId('');
        setPreviewUrl(payload.previewUrl);
        setDuplicates(payload.duplicates || []);
        setExtractionWarnings(
          Array.isArray(payload.extraction.warnings)
            ? payload.extraction.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
            : []
        );
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
            transactionDate: draft.date || '',
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
            description: buildEditableTransactionDescription(draft),
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

        updateProcessingState('preparing_review', { progress: 93 });
        setReviewTransactions(mappedTransactions);
        void refreshReceiptAllowanceSummary(controller.signal).catch(() => undefined);
        const readyStartedAt = Date.now();
        updateProcessingState('ready', { progress: 100, completedAt: readyStartedAt });
        const visibleDelayMs = readyStartedAt - extractionStartedAt < 500
          ? 500 - (readyStartedAt - extractionStartedAt)
          : 0;
        if (visibleDelayMs > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, visibleDelayMs));
        } else {
          await new Promise((resolve) => window.setTimeout(resolve, 450));
        }
      } catch (error) {
        if (cancelled || extractionRequestSequenceRef.current !== requestSequence) return;
        if (isAbortError(error)) {
          setExtractError(t('transactions.documentReview.processingCancelled', {
            ns: 'portal',
            defaultValue: 'Receipt processing was cancelled. You can retry when you are ready.',
          }));
          setExtractErrorCode(null);
          setExtractReferenceId('');
          setJobId('');
          setPreviewUrl('');
          setDuplicates([]);
          setExtractionWarnings([]);
          setAccounts([]);
          setCategories([]);
          setReviewTransactions([]);
          resetProcessingState();
          return;
        }
        const errorCode = typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: TransactionDocumentErrorCode }).code
          : classifyTransactionDocumentError(error);
        const referenceId = typeof error === 'object'
          && error !== null
          && 'referenceId' in error
          && typeof (error as { referenceId?: unknown }).referenceId === 'string'
            ? (error as { referenceId: string }).referenceId
            : '';
        setExtractError(error instanceof Error ? error.message : 'Failed to extract the uploaded document.');
        setExtractErrorCode(errorCode);
        setExtractReferenceId(referenceId);
        setJobId('');
        setPreviewUrl('');
        setDuplicates([]);
        setExtractionWarnings([]);
        setAccounts([]);
        setCategories([]);
        setReviewTransactions([]);
        resetProcessingState();
        void refreshReceiptAllowanceSummary().catch(() => undefined);
      } finally {
        if (!cancelled && extractionRequestSequenceRef.current === requestSequence) {
          extractionAbortControllerRef.current = null;
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
  }, [
    activeFile,
    i18n.language,
    i18n.resolvedLanguage,
    isOpen,
    refreshReceiptAllowanceSummary,
    resetProcessingState,
    retryKey,
    sourceSurface,
    t,
    updateProcessingState,
  ]);

  const allowanceUsed = receiptAllowance ? receiptAllowance.used + receiptAllowance.reserved : 0;
  const isPlanRestrictedError = extractErrorCode === 'receipt_feature_unavailable' || extractErrorCode === 'receipt_no_documents_included';
  const isReceiptLimitError = extractErrorCode === 'receipt_allowance_exhausted';
  const isSelectionError = extractErrorCode === 'document_too_large'
    || extractErrorCode === 'invalid_type'
    || extractErrorCode === 'empty_file';
  const shouldShowReferenceId = Boolean(extractReferenceId) && (
    extractErrorCode === 'provider_http_error'
    || extractErrorCode === 'provider_timeout'
    || extractErrorCode === 'provider_rate_limited'
    || extractErrorCode === 'provider_unavailable'
    || extractErrorCode === 'invalid_ai_json_response'
    || extractErrorCode === 'invalid_extraction_response'
    || extractErrorCode === 'extract_failed'
    || extractErrorCode === 'openrouter_not_configured'
    || extractErrorCode === 'unsupported_multimodal_model'
    || extractErrorCode === 'migration_missing'
    || extractErrorCode === 'storage_bucket_failure'
    || extractErrorCode === 'signed_url_failure'
  );
  const canRetry = !!activeFile
    && !isExtracting
    && !isSaving
    && !isSelectionError
    && !isPlanRestrictedError
    && !isReceiptLimitError;
  const processingElapsedSeconds = processingState.startedAt
    ? Math.max(0, Math.floor((processingNow - processingState.startedAt) / 1000))
    : 0;
  const showProcessingElapsed = isExtracting && processingElapsedSeconds >= 2;
  const isSlowProcessing = isExtracting && processingElapsedSeconds >= 7;
  const processingMessagesByStage: Record<TransactionDocumentProcessingStage, string[]> = {
    preparing_file: [
      t('transactions.documentReview.progressMessages.preparingFile', {
        ns: 'portal',
        defaultValue: 'Preparing your file for a faster review',
      }),
    ],
    uploading_document: [
      t('transactions.documentReview.progressMessages.uploadingSecurely', {
        ns: 'portal',
        defaultValue: 'Uploading your receipt securely',
      }),
    ],
    reading_receipt: [
      t('transactions.documentReview.progressMessages.readingMerchantDateTotals', {
        ns: 'portal',
        defaultValue: 'Reading merchant, date, and totals',
      }),
      t('transactions.documentReview.progressMessages.scanningReceiptStructure', {
        ns: 'portal',
        defaultValue: 'Scanning the receipt layout for key details',
      }),
    ],
    extracting_details: [
      t('transactions.documentReview.progressMessages.detectingItems', {
        ns: 'portal',
        defaultValue: 'Detecting purchased items',
      }),
      t('transactions.documentReview.progressMessages.extractingDetails', {
        ns: 'portal',
        defaultValue: 'Extracting transaction details from your document',
      }),
    ],
    checking_results: [
      t('transactions.documentReview.progressMessages.checkingAmounts', {
        ns: 'portal',
        defaultValue: 'Checking the extracted amounts',
      }),
      t('transactions.documentReview.progressMessages.reviewingDuplicates', {
        ns: 'portal',
        defaultValue: 'Checking for possible duplicates',
      }),
    ],
    preparing_review: [
      t('transactions.documentReview.progressMessages.preparingReview', {
        ns: 'portal',
        defaultValue: 'Preparing everything for your review',
      }),
    ],
    ready: [
      t('transactions.documentReview.processingStageReady', {
        ns: 'portal',
        defaultValue: 'Ready',
      }),
    ],
  };
  const currentProcessingMessages = processingMessagesByStage[processingState.stage];
  const currentProcessingMessage = currentProcessingMessages[
    Math.min(processingMessageIndex, Math.max(currentProcessingMessages.length - 1, 0))
  ];
  const processingStageTitle = (() => {
    switch (processingState.stage) {
      case 'preparing_file':
        return t('transactions.documentReview.processingStages.preparingFile', {
          ns: 'portal',
          defaultValue: 'Preparing file',
        });
      case 'uploading_document':
        return t('transactions.documentReview.processingStages.uploadingDocument', {
          ns: 'portal',
          defaultValue: 'Uploading document',
        });
      case 'reading_receipt':
        return t('transactions.documentReview.processingStages.readingReceipt', {
          ns: 'portal',
          defaultValue: 'Reading receipt',
        });
      case 'extracting_details':
        return t('transactions.documentReview.processingStages.extractingDetails', {
          ns: 'portal',
          defaultValue: 'Extracting transaction details',
        });
      case 'checking_results':
        return t('transactions.documentReview.processingStages.checkingResults', {
          ns: 'portal',
          defaultValue: 'Checking totals and duplicates',
        });
      case 'preparing_review':
        return t('transactions.documentReview.processingStages.preparingReview', {
          ns: 'portal',
          defaultValue: 'Preparing your review',
        });
      case 'ready':
      default:
        return t('transactions.documentReview.processingStageReady', {
          ns: 'portal',
          defaultValue: 'Ready',
        });
    }
  })();
  const processingDescription = isSlowProcessing
    ? t('transactions.documentReview.processingSlowNotice', {
        ns: 'portal',
        defaultValue: 'This receipt is taking a little longer to read, but processing is still active.',
      })
    : currentProcessingMessage;
  const handleCancelExtraction = useCallback(() => {
    extractionAbortControllerRef.current?.abort();
  }, []);
  useEffect(() => {
    if (!isExtracting || currentProcessingMessages.length <= 1 || prefersReducedMotion) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setProcessingMessageIndex((current) => (current + 1) % currentProcessingMessages.length);
    }, 2200);

    return () => {
      window.clearInterval(interval);
    };
  }, [currentProcessingMessages.length, isExtracting, prefersReducedMotion, processingState.stage]);
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
  const shouldShowSaveReferenceId = Boolean(saveReferenceId) && (
    saveErrorCode === 'save_failed'
    || saveErrorCode === 'database_conflict'
    || saveErrorCode === 'database_unavailable'
    || saveErrorCode === null
  );
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

  const reviewValidation = useMemo<ReviewValidationState>(() => {
    const noTransactions = reviewTransactions.length === 0;
    const duplicateActive = duplicates.length > 0;
    const duplicateBlocking = duplicateActive && !duplicateConfirmed;
    const transactions = reviewTransactions.map((transaction) => {
      const transactionFields: TransactionFieldKey[] = [];

      if (!transaction.transactionDate) {
        transactionFields.push('transactionDate');
      }
      if (!(typeof transaction.amount === 'number' && Number.isFinite(transaction.amount) && transaction.amount > 0)) {
        transactionFields.push('amount');
      }
      if (!transaction.currency) {
        transactionFields.push('currency');
      }
      if (!transaction.accountId) {
        transactionFields.push('accountId');
      }
      if (!transaction.description.trim()) {
        transactionFields.push('description');
      }

      const lineItemErrors = transaction.lineItems.flatMap((item, itemIndex) => {
        const lineItemValidation = getTransactionDocumentLineItemValidation(item);
        const fields: LineItemFieldKey[] = [];
        let totalMessage = '';

        if (!lineItemValidation.hasName) {
          fields.push('name');
        }

        if (!lineItemValidation.hasResolvableTotal) {
          fields.push('total');
          totalMessage = t('transactions.documentReview.lineItemTotalRequired', {
            ns: 'portal',
            defaultValue: 'Enter a line total, or both quantity and unit price.',
          });
        } else if (!lineItemValidation.totalAligned) {
          fields.push('total');
          totalMessage = t('transactions.documentReview.lineItemTotalMismatch', {
            ns: 'portal',
            defaultValue: 'Line total differs from quantity x unit price by more than the allowed tolerance.',
          });
        } else if (!lineItemValidation.hasValidTotal) {
          fields.push('total');
          totalMessage = t('transactions.documentReview.lineItemTotalInvalid', {
            ns: 'portal',
            defaultValue: 'Enter a valid line total.',
          });
        }

        if (fields.length === 0) {
          return [];
        }

        return [{
          itemIndex,
          fields,
          nameMessage: t('transactions.documentReview.lineItemNameRequired', {
            ns: 'portal',
            defaultValue: 'Item name is required.',
          }),
          totalMessage,
        }];
      });

      const totalSummary = getTransactionDocumentTotalSummary({
        amount: transaction.amount,
        tax: transaction.tax,
        lineItems: transaction.lineItems,
      });

      return {
        transactionId: transaction.id,
        transactionFields,
        lineItemErrors,
        totalsMismatchActive: totalSummary.hasMismatch,
        totalsMismatchBlocking: totalSummary.requiresConfirmation && transaction.totalsConfirmed !== true,
        totalSummary,
      };
    });

    const hasTransactionErrors = transactions.some((transaction) => transaction.transactionFields.length > 0);
    const hasLineItemErrors = transactions.some((transaction) => transaction.lineItemErrors.length > 0);
    const totalsMismatchBlocking = transactions.some((transaction) => transaction.totalsMismatchBlocking);

    let firstBlockingTargetId: string | null = null;
    if (duplicateBlocking) {
      firstBlockingTargetId = 'document-review-duplicate-warning';
    } else {
      for (const transaction of transactions) {
        if (transaction.transactionFields.length > 0) {
          firstBlockingTargetId = getTransactionFieldElementId(
            transaction.transactionId,
            transaction.transactionFields[0]
          );
          break;
        }
        if (transaction.lineItemErrors.length > 0) {
          const firstLineItemError = transaction.lineItemErrors[0];
          firstBlockingTargetId = getLineItemFieldElementId(
            transaction.transactionId,
            firstLineItemError.itemIndex,
            firstLineItemError.fields[0]
          );
          break;
        }
        if (transaction.totalsMismatchBlocking) {
          firstBlockingTargetId = getTotalsElementId(transaction.transactionId);
          break;
        }
      }
    }

    const canSubmit = !extractError
      && !isExtracting
      && !isSaving
      && !noTransactions
      && !!jobId
      && !duplicateBlocking
      && !hasTransactionErrors
      && !hasLineItemErrors
      && !totalsMismatchBlocking;

    let footerMessage = t('transactions.documentReview.readyToSave', {
      ns: 'portal',
      defaultValue: 'Review looks complete and is ready to save.',
    });

    if (noTransactions) {
      footerMessage = t('transactions.documentReview.noTransactions', {
        ns: 'portal',
        defaultValue: 'No draft transactions were detected from this document.',
      });
    } else if (hasTransactionErrors) {
      footerMessage = t('transactions.documentReview.completeRequiredFields', {
        ns: 'portal',
        defaultValue: 'Complete the highlighted transaction fields before saving.',
      });
    } else if (hasLineItemErrors) {
      footerMessage = t('transactions.documentReview.fixLineItemErrors', {
        ns: 'portal',
        defaultValue: 'Fix the highlighted receipt items before saving.',
      });
    } else if (totalsMismatchBlocking) {
      footerMessage = t('transactions.documentReview.confirmTotalsMismatch', {
        ns: 'portal',
        defaultValue: 'Review the totals difference before saving.',
      });
    } else if (duplicateBlocking) {
      footerMessage = t('transactions.documentReview.confirmDuplicateWarning', {
        ns: 'portal',
        defaultValue: 'Please confirm the duplicate warning above before saving.',
      });
    }

    return {
      duplicateActive,
      duplicateBlocking,
      transactions,
      hasTransactionErrors,
      hasLineItemErrors,
      totalsMismatchBlocking,
      canSubmit,
      firstBlockingTargetId,
      footerMessage,
    };
  }, [
    duplicateConfirmed,
    duplicates.length,
    extractError,
    isExtracting,
    isSaving,
    jobId,
    reviewTransactions,
    t,
  ]);

  const canSave = !isExtracting
    && !isSaving
    && !extractError
    && reviewTransactions.length > 0
    && !!jobId;
  const footerMessage = reviewValidation.footerMessage || t('transactions.documentReview.readyToSave', {
    ns: 'portal',
    defaultValue: 'Review looks complete and is ready to save.',
  });
  const footerHelpText = extractError
    ? (receiptLimitHint || extractError)
    : isExtracting
      ? processingDescription
    : saveError
      ? saveError
      : footerMessage;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setExpandedTransactionDetails((current) => {
      const next: Record<string, boolean> = {};
      for (const transaction of reviewTransactions) {
        next[transaction.id] = current[transaction.id] === true;
      }
      return next;
    });

    setExpandedLineItems((current) => {
      const next: Record<string, number | null> = {};
      for (const transaction of reviewTransactions) {
        const maxIndex = transaction.lineItems.length - 1;
        const currentIndex = current[transaction.id];
        next[transaction.id] =
          typeof currentIndex === 'number' && currentIndex >= 0 && currentIndex <= maxIndex
            ? currentIndex
            : null;
      }
      return next;
    });

    setShowOnlyInvalidItems((current) => {
      const next: Record<string, boolean> = {};
      for (const transaction of reviewTransactions) {
        next[transaction.id] = current[transaction.id] === true;
      }
      return next;
    });
  }, [isOpen, reviewTransactions]);

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
    setExpandedLineItems((current) => {
      const nextIndex = current[transactionId];
      if (nextIndex == null) {
        return current;
      }
      if (nextIndex === itemIndex) {
        return { ...current, [transactionId]: null };
      }
      if (nextIndex > itemIndex) {
        return { ...current, [transactionId]: nextIndex - 1 };
      }
      return current;
    });
  };

  const toggleTransactionDetails = (transactionId: string) => {
    setExpandedTransactionDetails((current) => ({
      ...current,
      [transactionId]: current[transactionId] !== true,
    }));
  };

  const toggleLineItem = (transactionId: string, itemIndex: number) => {
    setExpandedLineItems((current) => ({
      ...current,
      [transactionId]: current[transactionId] === itemIndex ? null : itemIndex,
    }));
  };

  const focusLineItem = (transactionId: string, itemIndex: number) => {
    setExpandedLineItems((current) => ({
      ...current,
      [transactionId]: itemIndex,
    }));

    requestAnimationFrame(() => {
      const element = lineItemRefs.current[`${transactionId}:${itemIndex}`];
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleNextIssue = (transactionId: string, invalidIndices: number[]) => {
    if (invalidIndices.length === 0) {
      return;
    }

    const activeIndex = expandedLineItems[transactionId];
    const currentPosition = typeof activeIndex === 'number'
      ? invalidIndices.indexOf(activeIndex)
      : -1;
    const nextIndex = invalidIndices[(currentPosition + 1) % invalidIndices.length];

    focusLineItem(transactionId, nextIndex);
  };

  const handleSave = async () => {
    if (isSaving) {
      return;
    }
    if (!canSave) {
      toast.error(footerMessage);
      return;
    }

    if (!reviewValidation.canSubmit) {
      toast.error(reviewValidation.footerMessage);
      const targetId = reviewValidation.firstBlockingTargetId;
      if (targetId) {
        requestAnimationFrame(() => {
          const target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
            if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
              target.focus({ preventScroll: true });
            }
          }
        });
      }
      return;
    }

    setIsSaving(true);
    setSaveError('');
    setSaveErrorCode(null);
    setSaveReferenceId('');
    try {
      const payload: TransactionDocumentSaveRequest = {
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
      };
      const response = await fetch('/api/transaction-documents/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const rawResult: unknown = await response.json().catch(() => null);
      const result = parseTransactionDocumentSaveApiResponse(rawResult);
      const saveSuccessResult = response.ok && isTransactionDocumentSaveResponse(result) ? result : null;

      if (!saveSuccessResult) {
        const saveErrorResult: TransactionDocumentSaveErrorResponse =
          isTransactionDocumentSaveResponse(result) ? {} : result;
        const refreshedDuplicates = saveErrorResult?.duplicates ?? null;
        if (refreshedDuplicates) {
          setDuplicates(refreshedDuplicates);
          if (
            typeof saveErrorResult?.errorCode === 'string'
            && saveErrorResult.errorCode === 'duplicate_confirmation_required'
          ) {
            setDuplicateConfirmed(false);
          }
        }
        const errorCode = typeof saveErrorResult?.errorCode === 'string'
          ? saveErrorResult.errorCode as TransactionDocumentErrorCode
          : classifyTransactionDocumentError(saveErrorResult?.errorMessage);
        const referenceId = typeof saveErrorResult?.referenceId === 'string' ? saveErrorResult.referenceId : '';
        const safeMessage = typeof saveErrorResult?.message === 'string'
          ? saveErrorResult.message
          : typeof saveErrorResult?.errorMessage === 'string'
            ? saveErrorResult.errorMessage
            : '';
        const localizedMessage = safeMessage || getLocalizedTransactionDocumentError({
          t,
          errorCode,
          errorMessage: safeMessage || saveErrorResult?.errorMessage,
          fallbackKey: 'saveFailed',
        });
        setSaveError(localizedMessage);
        setSaveErrorCode(errorCode);
        setSaveReferenceId(referenceId);
        throw createTransactionDocumentUiError(errorCode, localizedMessage, referenceId);
      }

      setSaveError('');
      setSaveErrorCode(null);
      setSaveReferenceId('');
      toast.success(t('transactions.documentReview.savedSuccessfully', {
        ns: 'portal',
        count: saveSuccessResult.transactionIds.length,
        defaultValue: 'Document transactions saved successfully.',
      }));
      await onSaved?.(saveSuccessResult);
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
      contentClassName="sm:w-[92vw] sm:max-w-[1160px] sm:max-h-[min(calc(100dvh-2.5rem),920px)]"
      bodyClassName="min-h-0 overflow-x-hidden overflow-y-auto p-0"
      stickyFooter
      footerClassName="px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-5 lg:px-6"
      footer={(
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between lg:items-center">
          <div
            role={!extractError && !reviewValidation.canSubmit ? 'alert' : undefined}
            className={`min-w-0 flex-1 text-sm ${
            extractError
              ? 'text-muted-foreground'
              : !reviewValidation.canSubmit
                ? 'text-amber-800'
                : 'text-muted-foreground'
            }`}
          >
            {footerHelpText}
          </div>
          <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={isExtracting ? handleCancelExtraction : onClose}
              disabled={isSaving}
              className="btn-secondary min-h-10 w-full sm:w-auto"
            >
              {isExtracting
                ? t('transactions.documentReview.cancelProcessing', {
                    ns: 'portal',
                    defaultValue: 'Cancel',
                  })
                : t('actions.cancel', { ns: 'common' })}
            </button>
            {extractError ? (
              isSelectionError ? (
                <button
                  type="button"
                  onClick={handleChooseAnotherFile}
                  className="btn-primary min-h-10 w-full justify-center sm:w-auto"
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
                  className="btn-primary min-h-10 w-full justify-center sm:w-auto"
                >
                  {t('transactions.documentReview.tryAgain', {
                    ns: 'portal',
                    defaultValue: 'Try Again',
                  })}
                </button>
              ) : (extractErrorCode === 'receipt_feature_unavailable' || extractErrorCode === 'receipt_no_documents_included') ? (
                <Link href="/settings/subscription" className="btn-primary min-h-10 w-full justify-center sm:w-auto">
                  {t('subscriptionBilling.upgrade', {
                    ns: 'portal',
                    defaultValue: 'Upgrade',
                  })}
                </Link>
              ) : null
            ) : isExtracting ? null : (
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || !reviewValidation.canSubmit}
                className="btn-primary min-h-10 w-full justify-center sm:w-auto"
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
      )}
    >
      <>
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
        <div className="px-4 py-3 sm:px-5 sm:py-4 lg:px-6">
          <div className="space-y-4 pb-5 sm:pb-6">
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
          {!extractError && extractionWarnings.length > 0 ? (
            <div className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 text-amber-700" />
                <div className="min-w-0">
                  <p className="font-700">
                    {t('transactions.documentReview.reviewNoticeTitle', {
                      ns: 'portal',
                      defaultValue: 'Review recommended',
                    })}
                  </p>
                  <div className="mt-1 space-y-1">
                    {extractionWarnings.map((warning, index) => (
                      <p key={`document-warning-${index}`} className="leading-6">
                        {warning}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {isExtracting ? (
            <div className="flex min-h-[22rem] items-center justify-center">
              <section className="w-full max-w-2xl rounded-3xl border border-accent/20 bg-gradient-to-b from-accent/5 to-card p-4 shadow-sm sm:p-5">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                    <FileText size={22} className="motion-safe:animate-pulse motion-reduce:animate-none" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex min-w-0 items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-700 text-foreground">
                          {processingStageTitle}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          {processingDescription}
                        </p>
                        {showProcessingElapsed ? (
                          <p className="mt-2 text-xs font-600 text-muted-foreground">
                            {t('transactions.documentReview.processingElapsed', {
                              ns: 'portal',
                              elapsed: formatElapsedDuration(processingElapsedSeconds),
                              defaultValue: 'Elapsed: {{elapsed}}',
                            })}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-sm font-800 text-foreground">
                        {processingState.progress}%
                      </span>
                    </div>
                    <div
                      className="mt-4"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={processingState.progress}
                      aria-valuetext={`${processingStageTitle} ${processingState.progress}%`}
                    >
                      <div className="h-2.5 overflow-hidden rounded-full bg-accent/10">
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
                          style={{ width: `${processingState.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {isCheckingAllowance
                          ? t('transactions.documentReview.checkingAllowance', {
                              ns: 'portal',
                              defaultValue: 'Checking remaining Receipt Intelligence documents...',
                            })
                          : t('transactions.documentReview.processingKeepOpen', {
                              ns: 'portal',
                              defaultValue: 'Keep this window open while we prepare your review.',
                            })}
                      </p>
                      <button
                        type="button"
                        onClick={handleCancelExtraction}
                        className="btn-secondary min-h-10 w-full justify-center sm:w-auto"
                      >
                        {t('transactions.documentReview.cancelProcessing', {
                          ns: 'portal',
                          defaultValue: 'Cancel',
                        })}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
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
                  {shouldShowReferenceId ? (
                    <p className="mt-2 text-xs font-600 text-negative/80">
                      {t('transactions.documentReview.referenceId', {
                        ns: 'portal',
                        defaultValue: 'Reference: {{referenceId}}',
                        referenceId: extractReferenceId,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                  <div className="border-b border-slate-200 px-4 py-2.5 sm:px-5">
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
                  <div className="px-4 py-3 sm:px-5">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {activeFile?.type === 'application/pdf' ? (
                      <iframe
                        src={previewUrl}
                        title={activeFile?.name || 'document-preview'}
                        className="h-[18rem] w-full bg-white sm:h-[20rem] lg:h-[22rem]"
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt={activeFile?.name || 'document-preview'}
                        className="h-[18rem] w-full bg-white object-contain sm:h-[20rem] lg:h-[22rem]"
                      />
                    )}
                  </div>
                  {activeFile ? (
                    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      <p className="break-all font-600 text-foreground sm:break-words">{activeFile.name}</p>
                      <p>{formatTransactionDocumentFileSize(activeFile.size)}</p>
                    </div>
                  ) : null}
                  </div>
              </section>

              {reviewValidation.duplicateBlocking ? (
                <section
                  id="document-review-duplicate-warning"
                  className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 sm:px-5"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 text-amber-700" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-700 text-amber-900">
                        {t('transactions.documentReview.duplicateTitle', {
                          ns: 'portal',
                          defaultValue: 'Possible duplicate',
                        })}
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-amber-900/85">
                        {t('transactions.documentReview.duplicateDescription', {
                          ns: 'portal',
                          defaultValue: 'This receipt looks similar to one you already saved. Check the existing transaction before continuing.',
                        })}
                      </p>
                      <p className="mt-1.5 text-xs font-600 leading-4 text-amber-800/90">
                        {t('transactions.documentReview.duplicateGuidance', {
                          ns: 'portal',
                          defaultValue: 'Click "Save Anyway" only if you are sure this is a different transaction.',
                        })}
                      </p>
                      <div className="mt-2.5 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {duplicates.map((duplicate) => (
                          <div key={duplicate.transactionId || duplicate.documentId} className="rounded-2xl border border-amber-200/80 bg-white/90 p-2.5 text-xs text-foreground">
                            <p className="break-words text-sm font-600 leading-5 text-foreground">
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
                                  ? formatDuplicateCandidateAmount({
                                      amount: duplicate.total,
                                      currency: duplicate.currency,
                                      currencyUnavailableLabel: t('transactions.documentReview.currencyUnavailable', {
                                        ns: 'portal',
                                        defaultValue: 'Currency unavailable',
                                      }),
                                    })
                                  : '—'}
                              </span>
                            </div>
                            {duplicate.receiptNumber ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t('transactions.documentReview.receiptNumberShort', {
                                  ns: 'portal',
                                  defaultValue: 'Ref: {{value}}',
                                  value: duplicate.receiptNumber,
                                })}
                              </p>
                            ) : null}
                            {duplicate.transactionId ? (
                              <div className="mt-2 flex justify-end">
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
                      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          onClick={() => setDuplicateConfirmed(true)}
                          className="btn-secondary h-10 w-full justify-center border-amber-300 bg-white px-3 text-xs text-amber-900 hover:bg-amber-100 sm:w-auto"
                        >
                          {t('transactions.documentReview.saveAnyway', {
                            ns: 'portal',
                            defaultValue: 'Save Anyway',
                          })}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              ) : reviewValidation.duplicateActive ? (
                <section className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:px-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-4 w-4 rounded-full bg-emerald-500/80" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-700 text-emerald-900">
                        {t('transactions.documentReview.duplicateConfirmedLabel', {
                          ns: 'portal',
                          defaultValue: 'Duplicate warning confirmed. You can save when the rest of the review is ready.',
                        })}
                      </h3>
                      <p className="mt-1 text-sm text-emerald-900/80">
                        {t('transactions.documentReview.duplicateConfirmedSummary', {
                          ns: 'portal',
                          count: duplicates.length,
                          defaultValue: '{{count}} possible matches remain visible in this review session, but they no longer block saving.',
                        })}
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              {saveError ? (
                <section className="rounded-3xl border border-negative/30 bg-negative-soft/50 px-4 py-3 sm:px-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 text-negative" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-700 text-foreground">
                        {t('transactions.documentReview.saveErrorTitle', {
                          ns: 'portal',
                          defaultValue: 'Save failed',
                        })}
                      </h3>
                      <p className="mt-1 text-sm text-negative">{saveError}</p>
                      {shouldShowSaveReferenceId ? (
                        <p className="mt-2 text-xs font-600 text-negative/80">
                          {t('transactions.documentReview.referenceId', {
                            ns: 'portal',
                            defaultValue: 'Reference: {{referenceId}}',
                            referenceId: saveReferenceId,
                          })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {reviewTransactions.map((transaction, index) => {
                const lineItemCategories = transaction.transactionType === 'income'
                  ? filteredCategoriesByType.income
                  : filteredCategoriesByType.expense;
                const transactionValidation = reviewValidation.transactions.find(
                  (entry) => entry.transactionId === transaction.id
                );
                const totalSummary = transactionValidation?.totalSummary || getTransactionDocumentTotalSummary({
                  amount: transaction.amount,
                  tax: transaction.tax,
                  lineItems: transaction.lineItems,
                });
                const hasTransactionFieldError = (field: TransactionFieldKey) =>
                  transactionValidation?.transactionFields.includes(field) ?? false;
                const getLineItemError = (itemIndex: number) =>
                  transactionValidation?.lineItemErrors.find((item) => item.itemIndex === itemIndex);
                const invalidItemIndices = transaction.lineItems
                  .map((item, itemIndex) => ({ itemIndex, issue: getLineItemValidationIssue(item) }))
                  .filter((entry) => entry.issue !== null)
                  .map((entry) => entry.itemIndex);
                const invalidItemCount = invalidItemIndices.length;
                const transactionIssueCount = (transactionValidation?.transactionFields.length || 0)
                  + invalidItemCount
                  + (transactionValidation?.totalsMismatchBlocking ? 1 : 0);
                const summaryStatusLabel = transactionIssueCount > 0
                  ? t('transactions.documentReview.itemsNeedAttention', {
                    ns: 'portal',
                    count: transactionIssueCount,
                    defaultValue: '{{count}} items need attention',
                  })
                  : transaction.needsReview
                    ? t('transactions.documentReview.needsReview', { ns: 'portal', defaultValue: 'Needs review' })
                    : t('transactions.documentReview.readyLabel', { ns: 'portal', defaultValue: 'Looks good' });
                const detailsOpen = expandedTransactionDetails[transaction.id] === true;
                const visibleItemIndices = transaction.lineItems
                  .map((_, itemIndex) => itemIndex)
                  .filter((itemIndex) => !showOnlyInvalidItems[transaction.id] || invalidItemIndices.includes(itemIndex))
                  .sort((left, right) => {
                    const leftPriority = invalidItemIndices.includes(left) ? 0 : 1;
                    const rightPriority = invalidItemIndices.includes(right) ? 0 : 1;
                    return leftPriority - rightPriority || left - right;
                  });

                return (
                  <section key={transaction.id} className="overflow-hidden rounded-3xl border border-blue-200/70 bg-[#F5F9FF]">
                    <div className="border-b border-blue-200/70 px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-700 text-foreground">
                            {t('transactions.documentReview.detectedTransaction', {
                              ns: 'portal',
                              index: index + 1,
                              defaultValue: 'Draft Transaction {{index}}',
                            })}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded-full px-2 py-1 font-600 ${
                              transactionIssueCount > 0 || transaction.needsReview
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {summaryStatusLabel}
                            </span>
                            <span className="rounded-full bg-white/80 px-2 py-1 font-600 text-muted-foreground ring-1 ring-blue-100">
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
                            className="btn-ghost min-h-11 px-2 py-1 text-negative"
                            aria-label={t('transactions.documentReview.removeDraftTransaction', {
                              ns: 'portal',
                              defaultValue: 'Remove draft transaction',
                            })}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4 px-4 py-3 pb-5 sm:px-5 sm:pb-6">
                      <section className="rounded-2xl border border-blue-200/70 bg-white/75 p-3 sm:p-3.5">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                          <div className="min-w-0">
                            <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                              {t('transactions.merchantSource', { ns: 'portal' })}
                            </p>
                            <p className="mt-1 truncate text-sm font-700 text-foreground">{transaction.merchant || transaction.description || '—'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                              {t('transactions.date', { ns: 'portal' })}
                            </p>
                            <p className="mt-1 text-sm font-600 text-foreground">{transaction.transactionDate || '—'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                              {t('transactions.amount', { ns: 'portal' })}
                            </p>
                            <p className="mt-1 text-sm font-700 text-foreground">
                              {typeof transaction.amount === 'number' && transaction.amount > 0
                                ? formatCurrencyText(transaction.amount, {
                                  currencyCode: transaction.currency || undefined,
                                  fallbackCurrencyCode: transaction.currency || 'USD',
                                  textOnly: true,
                                })
                                : '—'}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                              {t('transactions.currency', { ns: 'portal', defaultValue: 'Currency' })}
                            </p>
                            <p className="mt-1 text-sm font-600 text-foreground">{transaction.currency || '—'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                              {t('transactions.documentReview.receiptNumber', {
                                ns: 'portal',
                                defaultValue: 'Receipt / Reference Number',
                              })}
                            </p>
                            <p className="mt-1 truncate text-sm font-600 text-foreground">{transaction.receiptNumber || '—'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                              {t('transactions.documentReview.itemCountLabel', {
                                ns: 'portal',
                                count: transaction.lineItems.length,
                                defaultValue: '{{count}} items',
                              })}
                            </p>
                            <p className="mt-1 text-sm font-600 text-foreground">{summaryStatusLabel}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleTransactionDetails(transaction.id)}
                            aria-expanded={detailsOpen}
                            aria-controls={`document-review-details-${transaction.id}`}
                            className="btn-secondary min-h-10 px-3 text-xs"
                          >
                            {t('transactions.documentReview.editReceiptDetails', {
                              ns: 'portal',
                              defaultValue: 'Edit receipt details',
                            })}
                          </button>
                          <div className="grid grid-cols-2 gap-2 sm:max-w-[16rem]">
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
                                className={`min-h-10 rounded-2xl border px-3 py-2 text-sm font-600 ${
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
                        </div>
                        {transactionIssueCount > 0 ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
                            {invalidItemCount > 0
                              ? t('transactions.documentReview.invalidItemsSummary', {
                                ns: 'portal',
                                invalidCount: invalidItemCount,
                                totalCount: transaction.lineItems.length,
                                defaultValue: '{{invalidCount}} of {{totalCount}} items need attention.',
                              })
                              : summaryStatusLabel}
                          </div>
                        ) : null}
                      </section>

                      {detailsOpen ? (
                        <section
                          id={`document-review-details-${transaction.id}`}
                          className="space-y-3 rounded-2xl border border-blue-200/70 bg-white/55 p-3 sm:p-3.5"
                        >
                          <div className="grid grid-cols-1 gap-x-3 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
                            <div className="min-w-0">
                              <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.merchantSource', { ns: 'portal' })}</label>
                              <input type="text" className="input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm" value={transaction.merchant} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, merchant: event.target.value }))} />
                            </div>
                            <div className="min-w-0">
                              <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.date', { ns: 'portal' })} *</label>
                              <input id={getTransactionFieldElementId(transaction.id, 'transactionDate')} type="date" aria-invalid={hasTransactionFieldError('transactionDate')} className={`input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm ${getFieldErrorClass(hasTransactionFieldError('transactionDate'))}`} value={transaction.transactionDate} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, transactionDate: event.target.value }))} />
                            </div>
                            <div className="min-w-0">
                              <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.amount', { ns: 'portal' })} *</label>
                              <input id={getTransactionFieldElementId(transaction.id, 'amount')} type="number" step="0.01" min="0.01" aria-invalid={hasTransactionFieldError('amount')} className={`input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm ${getFieldErrorClass(hasTransactionFieldError('amount'))}`} value={transaction.amount > 0 ? String(transaction.amount) : ''} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, amount: Number(event.target.value || 0), totalsConfirmed: false }))} />
                            </div>
                            <div className="min-w-0">
                              <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.form.tax', { ns: 'portal', defaultValue: 'Tax' })}</label>
                              <input type="number" step="0.01" min="0" className="input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm" value={typeof transaction.tax === 'number' ? String(transaction.tax) : ''} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, tax: event.target.value ? Number(event.target.value) : null, totalsConfirmed: false }))} />
                            </div>
                            <div className="min-w-0">
                              <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.currency', { ns: 'portal', defaultValue: 'Currency' })} *</label>
                              <div id={getTransactionFieldElementId(transaction.id, 'currency')}>
                                <CurrencySelector value={transaction.currency} onChange={(currencyCode) => updateTransaction(transaction.id, (current) => ({ ...current, currency: currencyCode }))} placeholder={t('settlements.chooseCurrency', { ns: 'portal' })} disabled={!!transaction.accountId} helperText={t('transactions.documentReview.accountCurrencyHint', { ns: 'portal', defaultValue: 'Currency follows the selected account.' })} className={`${hasTransactionFieldError('currency') ? '[&>button]:border-negative/60 [&>button]:bg-negative-soft/40' : ''} [&>button]:h-10 [&>button]:min-h-10 [&>button]:px-3 [&>button]:py-2 [&>button]:text-sm [&>button]:gap-2 [&>button>div:first-child]:hidden [&>button>div:nth-child(2)]:min-w-0 [&>button>div:nth-child(2)>div>span]:text-sm [&>button>div:nth-child(2)>p]:text-xs [&>p]:mt-0.5 [&>p]:text-[11px] [&>p]:leading-3`} />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.account', { ns: 'portal' })} *</label>
                              <select id={getTransactionFieldElementId(transaction.id, 'accountId')} aria-invalid={hasTransactionFieldError('accountId')} className={`input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm ${getFieldErrorClass(hasTransactionFieldError('accountId'))}`} value={transaction.accountId} onChange={(event) => { const nextAccount = accounts.find((account) => account.id === event.target.value); updateTransaction(transaction.id, (current) => ({ ...current, accountId: event.target.value, currency: nextAccount?.currency || current.currency })); }}>
                                <option value="">{t('transactions.selectAccount', { ns: 'portal' })}</option>
                                {accounts.map((account) => (
                                  <option key={account.id} value={account.id}>
                                    {getFinancialAccountDisplayLabel(account, { includeCurrency: true, includeDefaultLabel: true })}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="min-w-0">
                              <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.category', { ns: 'portal' })}</label>
                              <select className="input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm" value={transaction.categoryId || ''} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, categoryId: event.target.value || null }))}>
                                <option value="">{t('transactions.noCategory', { ns: 'portal' })}</option>
                                {lineItemCategories.map((category) => (
                                  <option key={category.id} value={category.id}>{category.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="min-w-0">
                              <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.documentReview.receiptNumber', { ns: 'portal', defaultValue: 'Receipt / Reference Number' })}</label>
                              <input type="text" className="input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm" value={transaction.receiptNumber} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, receiptNumber: event.target.value }))} />
                            </div>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs font-600 text-foreground">{t('settlements.descriptionLabel', { ns: 'portal' })} *</label>
                            <input id={getTransactionFieldElementId(transaction.id, 'description')} type="text" aria-invalid={hasTransactionFieldError('description')} className={`input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm ${getFieldErrorClass(hasTransactionFieldError('description'))}`} value={transaction.description} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, description: event.target.value }))} />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs font-600 text-foreground">{t('transactions.notes', { ns: 'portal', defaultValue: 'Notes' })}</label>
                            <textarea rows={2} className="input-base min-h-[3.75rem] w-full min-w-0 resize-none px-3 py-2 text-sm" value={transaction.notes} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, notes: event.target.value }))} />
                          </div>
                        </section>
                      ) : null}

                      <section className="rounded-2xl border border-blue-200/70 bg-white/55 p-3 sm:p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('transactions.documentReview.lineItemsTitle', { ns: 'portal', defaultValue: 'Detected line items' })}</h4>
                            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-700 text-muted-foreground ring-1 ring-blue-100">{t('transactions.documentReview.itemCountLabel', { ns: 'portal', count: transaction.lineItems.length, defaultValue: '{{count}} items' })}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {invalidItemCount > 0 ? (
                              <>
                                <button type="button" onClick={() => setShowOnlyInvalidItems((current) => ({ ...current, [transaction.id]: current[transaction.id] !== true }))} className="btn-secondary min-h-10 px-3 text-xs">
                                  {showOnlyInvalidItems[transaction.id]
                                    ? t('transactions.documentReview.showAllItems', { ns: 'portal', count: transaction.lineItems.length, defaultValue: 'Show all {{count}} items' })
                                    : t('transactions.documentReview.showItemsNeedingAttention', { ns: 'portal', defaultValue: 'Show items needing attention' })}
                                </button>
                                <button type="button" onClick={() => handleNextIssue(transaction.id, invalidItemIndices)} className="btn-secondary min-h-10 px-3 text-xs">
                                  {t('transactions.documentReview.nextIssue', { ns: 'portal', defaultValue: 'Next issue' })}
                                </button>
                              </>
                            ) : null}
                            <button type="button" onClick={() => addLineItem(transaction.id)} className="btn-secondary min-h-10 px-3 text-xs">
                              <Plus size={14} />
                              {t('transactions.documentReview.addItem', { ns: 'portal', defaultValue: 'Add Item' })}
                            </button>
                          </div>
                        </div>

                        {invalidItemCount > 0 ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
                            {t('transactions.documentReview.invalidItemsSummary', { ns: 'portal', invalidCount: invalidItemCount, totalCount: transaction.lineItems.length, defaultValue: '{{invalidCount}} of {{totalCount}} items need attention.' })}
                          </div>
                        ) : null}

                        {transaction.lineItems.length === 0 ? (
                          <p className="mt-3 text-sm text-muted-foreground">{t('transactions.documentReview.noLineItemsDetected', { ns: 'portal', defaultValue: 'No line items were detected. Add any missing items before saving.' })}</p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {visibleItemIndices.map((itemIndex) => {
                              const item = transaction.lineItems[itemIndex];
                              const itemTotal = getTransactionDocumentLineItemTotal(item);
                              const lineItemValidation = getTransactionDocumentLineItemValidation(item);
                              const itemError = getLineItemError(itemIndex);
                              const hasNameError = itemError?.fields.includes('name') ?? false;
                              const hasTotalError = itemError?.fields.includes('total') ?? false;
                              const isExpanded = expandedLineItems[transaction.id] === itemIndex;
                              const itemKey = `${transaction.id}:${itemIndex}`;
                              const itemCategoryName = item.categoryId ? lineItemCategories.find((category) => category.id === item.categoryId)?.name || t('transactions.noCategory', { ns: 'portal' }) : t('transactions.noCategory', { ns: 'portal' });
                              const displayedTotal = typeof item.total === 'number' && Number.isFinite(item.total) ? formatCurrencyText(item.total, { currencyCode: transaction.currency || undefined, fallbackCurrencyCode: transaction.currency || 'USD', textOnly: true }) : '—';
                              const expectedTotal = lineItemValidation.hasResolvableTotal && itemTotal != null
                                ? formatCurrencyText(itemTotal, { currencyCode: transaction.currency || undefined, fallbackCurrencyCode: transaction.currency || 'USD', textOnly: true })
                                : '—';

                              return (
                                <div key={itemKey} ref={(node) => { lineItemRefs.current[itemKey] = node; }} className={`rounded-2xl border bg-white ${hasNameError || hasTotalError ? 'border-negative/40' : 'border-slate-200'}`}>
                                  <div className="flex flex-col gap-3 p-3.5">
                                    <div className="flex items-start justify-between gap-3">
                                      <button type="button" onClick={() => toggleLineItem(transaction.id, itemIndex)} aria-expanded={isExpanded} aria-controls={`document-review-line-panel-${transaction.id}-${itemIndex}`} className="min-w-0 flex-1 text-left">
                                        <p className="truncate text-sm font-700 text-foreground">{itemIndex + 1}. {item.name || t('transactions.documentReview.unnamedItem', { ns: 'portal', defaultValue: 'Unnamed item' })}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{`${formatOptionalNumberInput(item.quantity)} x ${formatOptionalNumberInput(item.unitPrice)} = ${displayedTotal}`}</p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                          <span className={`rounded-full px-2 py-0.5 font-700 ${hasNameError || hasTotalError ? 'bg-negative-soft text-negative' : 'bg-emerald-50 text-emerald-700'}`}>{hasNameError || hasTotalError ? t('transactions.documentReview.needsReview', { ns: 'portal', defaultValue: 'Needs review' }) : t('transactions.documentReview.readyLabel', { ns: 'portal', defaultValue: 'Looks good' })}</span>
                                          <span className="rounded-full bg-slate-50 px-2 py-0.5 font-600 text-muted-foreground">{itemCategoryName}</span>
                                        </div>
                                      </button>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <button type="button" onClick={() => toggleLineItem(transaction.id, itemIndex)} className="btn-secondary min-h-10 px-3 text-xs">{isExpanded ? t('common:actions.close', { defaultValue: 'Close' }) : t('common:actions.edit', { defaultValue: 'Edit' })}</button>
                                        <button type="button" aria-label={t('transactions.documentReview.removeItem', { ns: 'portal', defaultValue: 'Remove item' })} title={t('transactions.documentReview.removeItem', { ns: 'portal', defaultValue: 'Remove item' })} onClick={() => removeLineItem(transaction.id, itemIndex)} className="btn-ghost inline-flex h-10 min-h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14} /></button>
                                      </div>
                                    </div>

                                    {isExpanded ? (
                                      <div id={`document-review-line-panel-${transaction.id}-${itemIndex}`} className="space-y-3 border-t border-slate-200 pt-3">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                                          <div className="min-w-0 md:col-span-5">
                                            <label className="mb-0.5 block text-[10px] font-700 uppercase leading-3 text-muted-foreground">{t('transactions.documentReview.itemName', { ns: 'portal', defaultValue: 'Item name' })}</label>
                                            <input id={getLineItemFieldElementId(transaction.id, itemIndex, 'name')} type="text" aria-invalid={hasNameError} className={`input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm ${getFieldErrorClass(hasNameError)}`} value={item.name} onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({ ...current, name: event.target.value }))} />
                                          </div>
                                          <div className="min-w-0 md:col-span-2">
                                            <label className="mb-0.5 block text-[10px] font-700 uppercase leading-3 text-muted-foreground">{t('transactions.documentReview.quantity', { ns: 'portal', defaultValue: 'Quantity' })}</label>
                                            <input type="number" step="0.001" min="0" className="input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm" value={formatOptionalNumberInput(item.quantity)} onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({ ...current, quantity: parseOptionalNumber(event.target.value) }))} />
                                          </div>
                                          <div className="min-w-0 md:col-span-2">
                                            <label className="mb-0.5 block text-[10px] font-700 uppercase leading-3 text-muted-foreground">{t('transactions.documentReview.unitPrice', { ns: 'portal', defaultValue: 'Unit price' })}</label>
                                            <input type="number" step="0.01" min="0" className="input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm" value={formatOptionalNumberInput(item.unitPrice)} onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({ ...current, unitPrice: parseOptionalNumber(event.target.value) }))} />
                                          </div>
                                          <div className="min-w-0 md:col-span-3">
                                            <label className="mb-0.5 block text-[10px] font-700 uppercase leading-3 text-muted-foreground">{t('transactions.documentReview.lineTotal', { ns: 'portal', defaultValue: 'Line total' })}</label>
                                            <input id={getLineItemFieldElementId(transaction.id, itemIndex, 'total')} type="number" step="0.01" min="0" aria-invalid={hasTotalError} className={`input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 text-sm ${getFieldErrorClass(hasTotalError)}`} value={formatOptionalNumberInput(item.total)} onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({ ...current, total: parseOptionalNumber(event.target.value) }))} />
                                          </div>
                                        </div>

                                        {hasTotalError ? (
                                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                            <p className="font-700">{t('transactions.documentReview.lineItemIssueTitle', { ns: 'portal', defaultValue: 'Line total needs review' })}</p>
                                            <p className="mt-1">{itemError?.totalMessage}</p>
                                            <p className="mt-2 text-xs font-600 text-amber-900/80">{t('transactions.documentReview.extractedTotalLabel', { ns: 'portal', value: displayedTotal, defaultValue: 'Extracted total: {{value}}' })}</p>
                                            <p className="mt-1 text-xs font-600 text-amber-900/80">{t('transactions.documentReview.expectedTotalLabel', { ns: 'portal', value: expectedTotal, defaultValue: 'Expected total: {{value}}' })}</p>
                                            {lineItemValidation.hasResolvableTotal && itemTotal != null ? (
                                              <button type="button" onClick={() => updateLineItem(transaction.id, itemIndex, (current) => ({ ...current, total: itemTotal }))} className="btn-secondary mt-3 min-h-10 px-3 text-xs">
                                                {t('transactions.documentReview.useExpectedTotal', { ns: 'portal', defaultValue: 'Use expected total' })}
                                              </button>
                                            ) : null}
                                          </div>
                                        ) : null}

                                        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-12">
                                          <div className="min-w-0 md:col-span-5">
                                            <label className="mb-0.5 block text-[10px] font-700 uppercase leading-3 text-muted-foreground">{t('transactions.documentReview.itemCategory', { ns: 'portal', defaultValue: 'Item category' })}</label>
                                            <select className="input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 pr-9 text-sm" value={item.categoryId || ''} onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({ ...current, categoryId: event.target.value || null }))}>
                                              <option value="">{t('transactions.noCategory', { ns: 'portal' })}</option>
                                              {lineItemCategories.map((category) => (
                                                <option key={`${transaction.id}-${itemIndex}-${category.id}`} value={category.id}>{category.name}</option>
                                              ))}
                                            </select>
                                          </div>
                                          <div className="min-w-0 md:col-span-3">
                                            <label className="mb-0.5 block text-[10px] font-700 uppercase leading-3 text-muted-foreground">{t('transactions.documentReview.itemType', { ns: 'portal', defaultValue: 'Item type' })}</label>
                                            <select className="input-base h-10 min-h-10 w-full min-w-0 px-3 py-2 pr-9 text-sm" value={item.itemKind || 'regular'} onChange={(event) => updateLineItem(transaction.id, itemIndex, (current) => ({ ...current, itemKind: event.target.value as TransactionDocumentItemKind }))}>
                                              {TRANSACTION_DOCUMENT_ITEM_KINDS.map((itemKind) => (
                                                <option key={`${transaction.id}-${itemIndex}-${itemKind}`} value={itemKind}>{t(`transactions.documentReview.itemKinds.${itemKind}` as const, { ns: 'portal', defaultValue: itemKind })}</option>
                                              ))}
                                            </select>
                                          </div>
                                          <div className="min-w-0 md:col-span-4">
                                            <label className="mb-0.5 block text-[10px] font-700 uppercase leading-3 text-muted-foreground">{t('transactions.documentReview.computedLineTotal', { ns: 'portal', defaultValue: 'Calculated line total' })}</label>
                                            <div className={`flex h-10 min-h-10 items-center whitespace-nowrap rounded-xl border px-3 text-sm font-600 ${hasTotalError ? 'border-negative/60 bg-negative-soft/40 text-negative' : 'border-slate-200 bg-slate-50 text-foreground'}`}>
                                              {lineItemValidation.hasResolvableTotal && itemTotal != null ? formatCurrencyText(itemTotal, { currencyCode: transaction.currency || undefined, fallbackCurrencyCode: transaction.currency || 'USD', textOnly: true }) : '—'}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <section id={getTotalsElementId(transaction.id)} className="mt-3 rounded-2xl border border-amber-200/80 bg-[#FFF9F0] p-3 sm:p-3.5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h4 className="text-xs font-700 uppercase tracking-wide text-amber-900/70">{t('transactions.documentReview.totalsTitle', { ns: 'portal', defaultValue: 'Receipt totals' })}</h4>
                            {totalSummary.hasMismatch ? (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-700 text-amber-800">
                                {t('transactions.documentReview.mismatchAmountLabel', { ns: 'portal', amount: formatCurrencyText(Math.abs(totalSummary.mismatchAmount), { currencyCode: transaction.currency || undefined, fallbackCurrencyCode: transaction.currency || 'USD', textOnly: true }), defaultValue: 'Mismatch {{amount}}' })}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2.5 rounded-2xl border border-amber-200/70 bg-white/60 p-3">
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              {[
                                ['subtotal', totalSummary.subtotal],
                                ['tax', totalSummary.tax],
                                ['discount', totalSummary.discount],
                                ['fee', totalSummary.fee],
                                ['calculatedTotal', totalSummary.calculatedTotal],
                                ['receiptTotal', totalSummary.receiptTotal],
                              ].map(([key, value]) => (
                                <div key={`${transaction.id}-${key}`} className="min-w-0">
                                  <p className="text-[11px] font-700 uppercase tracking-wide text-amber-900/60">{t(`transactions.documentReview.${key}` as const, { ns: 'portal', defaultValue: key })}</p>
                                  <p className={`mt-0.5 break-words font-800 text-foreground ${key === 'calculatedTotal' || key === 'receiptTotal' ? 'text-base' : 'text-sm'}`}>
                                    {formatCurrencyText(value as number, { currencyCode: transaction.currency || undefined, fallbackCurrencyCode: transaction.currency || 'USD', textOnly: true })}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {totalSummary.hasMismatch ? (
                            <div className="mt-2.5 rounded-2xl border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900">
                              <p className="font-700">{t('transactions.documentReview.mismatchTitle', { ns: 'portal', defaultValue: 'Totals do not match' })}</p>
                              <p className="mt-1 leading-6">{t('transactions.documentReview.mismatchWarning', { ns: 'portal', defaultValue: 'The calculated total is different from the receipt total. Review the amounts before saving.' })}</p>
                              {totalSummary.requiresConfirmation ? (
                                <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
                                  <input type="checkbox" checked={transaction.totalsConfirmed === true} onChange={(event) => updateTransaction(transaction.id, (current) => ({ ...current, totalsConfirmed: event.target.checked }))} className="mt-0.5 rounded accent-accent" />
                                  <span>{t('transactions.documentReview.confirmMismatchLabel', { ns: 'portal', defaultValue: 'I reviewed the difference and still want to save.' })}</span>
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
          )}
          </div>
        </div>
      </>
      </Modal>
      <TransactionDetailsModal
        isOpen={!!duplicateViewTransactionId}
        transactionId={duplicateViewTransactionId}
        onClose={() => setDuplicateViewTransactionId(null)}
      />
    </>
  );
}
