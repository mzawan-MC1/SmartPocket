export type TransactionDocumentProcessingStage =
  | 'preparing_file'
  | 'uploading_document'
  | 'reading_receipt'
  | 'extracting_details'
  | 'checking_results'
  | 'preparing_review'
  | 'ready';

type TransactionDocumentProcessingRange = {
  min: number;
  max: number;
};

export const TRANSACTION_DOCUMENT_PROGRESS_RANGES: Record<
  TransactionDocumentProcessingStage,
  TransactionDocumentProcessingRange
> = {
  preparing_file: { min: 0, max: 10 },
  uploading_document: { min: 10, max: 30 },
  reading_receipt: { min: 30, max: 45 },
  extracting_details: { min: 45, max: 75 },
  checking_results: { min: 75, max: 90 },
  preparing_review: { min: 90, max: 99 },
  ready: { min: 100, max: 100 },
};

export const TRANSACTION_DOCUMENT_STAGE_ORDER: TransactionDocumentProcessingStage[] = [
  'preparing_file',
  'uploading_document',
  'reading_receipt',
  'extracting_details',
  'checking_results',
  'preparing_review',
  'ready',
];

export function getTransactionDocumentStageProgress(
  stage: TransactionDocumentProcessingStage,
  ratio?: number
) {
  const range = TRANSACTION_DOCUMENT_PROGRESS_RANGES[stage];
  if (!range) {
    return 0;
  }

  if (range.min === range.max) {
    return range.max;
  }

  const safeRatio = typeof ratio === 'number' && Number.isFinite(ratio)
    ? Math.max(0, Math.min(1, ratio))
    : 1;

  return Math.round(range.min + (range.max - range.min) * safeRatio);
}

export function clampTransactionDocumentProgress(value: number, minimum = 0, maximum = 100) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

