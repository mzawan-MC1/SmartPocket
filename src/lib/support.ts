import { createClientId } from '@/lib/uuid';
export { createClientId } from '@/lib/uuid';

export const CONTACT_ENQUIRY_STATUSES = [
  'new',
  'open',
  'in_progress',
  'waiting_for_customer',
  'resolved',
  'closed',
  'spam',
] as const;

export const CONTACT_ENQUIRY_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export const SUPPORT_TICKET_CATEGORIES = [
  'account',
  'transactions',
  'financial_accounts',
  'subscriptions',
  'payments',
  'reports',
  'smart_entry_ai',
  'technical_error',
  'feature_request',
  'security',
  'other',
] as const;

export const SUPPORT_TICKET_PRIORITIES = ['normal', 'high', 'urgent'] as const;

export const SUPPORT_TICKET_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'waiting_for_customer',
  'waiting_for_support',
  'resolved',
  'closed',
] as const;

export const SUPPORT_ATTACHMENT_BUCKET = 'support-attachments';
export const SUPPORT_ATTACHMENT_ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf'] as const;
export const SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;
export const SUPPORT_ATTACHMENT_REJECTED_MIME_TYPES = [
  'image/svg+xml',
  'text/html',
  'text/javascript',
  'application/javascript',
  'application/x-msdownload',
  'application/x-sh',
] as const;
export const SUPPORT_ATTACHMENT_MAX_FILES = 5;
export const SUPPORT_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const SUPPORT_TICKET_REOPEN_WINDOW_DAYS = 14;

export type ContactEnquiryStatus = typeof CONTACT_ENQUIRY_STATUSES[number];
export type ContactEnquiryPriority = typeof CONTACT_ENQUIRY_PRIORITIES[number];
export type SupportTicketCategory = typeof SUPPORT_TICKET_CATEGORIES[number];
export type SupportTicketPriority = typeof SUPPORT_TICKET_PRIORITIES[number];
export type SupportTicketStatus = typeof SUPPORT_TICKET_STATUSES[number];
export type SupportMessageKind = 'reply' | 'internal_note';
export type SupportTicketAction = 'close' | 'reopen';
export type SupportBulkAction = 'assign' | 'status';

export type FinalizedSupportUpload = {
  uploadIntentId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  extension: string;
};

export type SupportUploadIntentInput = {
  fileName: string;
  mimeType: string;
  size: number;
};

export type ParsedSupportFileDescriptor = {
  fileName: string;
  mimeType: string;
  size: number;
  extension: string;
};

export class SupportValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SupportValidationError';
    this.status = status;
  }
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function sanitizeSingleLineText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function sanitizeMultilineText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

export function normalizeNullableText(value: unknown, maxLength: number) {
  const sanitized = sanitizeSingleLineText(value, maxLength);
  return sanitized || null;
}

function parseEnumValue<T extends readonly string[]>(
  allowedValues: T,
  value: unknown,
  label: string
): T[number] {
  if (typeof value !== 'string') {
    throw new SupportValidationError(`Invalid ${label}.`);
  }

  const trimmed = value.trim();
  if (!allowedValues.includes(trimmed as T[number])) {
    throw new SupportValidationError(`Invalid ${label}.`);
  }

  return trimmed as T[number];
}

export function parseContactStatus(value: unknown): ContactEnquiryStatus {
  return parseEnumValue(CONTACT_ENQUIRY_STATUSES, value, 'contact status');
}

export function parseContactPriority(value: unknown): ContactEnquiryPriority {
  return parseEnumValue(CONTACT_ENQUIRY_PRIORITIES, value, 'contact priority');
}

export function parseTicketCategory(value: unknown): SupportTicketCategory {
  return parseEnumValue(SUPPORT_TICKET_CATEGORIES, value, 'ticket category');
}

export function parseTicketPriority(value: unknown): SupportTicketPriority {
  return parseEnumValue(SUPPORT_TICKET_PRIORITIES, value, 'ticket priority');
}

export function parseTicketStatus(value: unknown): SupportTicketStatus {
  return parseEnumValue(SUPPORT_TICKET_STATUSES, value, 'ticket status');
}

export function parseSupportMessageKind(value: unknown): SupportMessageKind {
  return parseEnumValue(['reply', 'internal_note'] as const, value, 'message kind');
}

export function parseSupportTicketAction(value: unknown): SupportTicketAction {
  return parseEnumValue(['close', 'reopen'] as const, value, 'ticket action');
}

export function parseSupportBulkAction(value: unknown): SupportBulkAction {
  return parseEnumValue(['assign', 'status'] as const, value, 'bulk action');
}

export function normalizeContactStatus(value: unknown): ContactEnquiryStatus {
  return CONTACT_ENQUIRY_STATUSES.includes(value as ContactEnquiryStatus)
    ? (value as ContactEnquiryStatus)
    : 'new';
}

export function normalizeContactPriority(value: unknown): ContactEnquiryPriority {
  return CONTACT_ENQUIRY_PRIORITIES.includes(value as ContactEnquiryPriority)
    ? (value as ContactEnquiryPriority)
    : 'normal';
}

export function normalizeTicketCategory(value: unknown): SupportTicketCategory {
  return SUPPORT_TICKET_CATEGORIES.includes(value as SupportTicketCategory)
    ? (value as SupportTicketCategory)
    : 'other';
}

export function normalizeTicketPriority(value: unknown): SupportTicketPriority {
  return SUPPORT_TICKET_PRIORITIES.includes(value as SupportTicketPriority)
    ? (value as SupportTicketPriority)
    : 'normal';
}

export function normalizeTicketStatus(value: unknown): SupportTicketStatus {
  return SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus)
    ? (value as SupportTicketStatus)
    : 'open';
}

export function toTitleLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatSupportDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}

export function getAttachmentExtension(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() || '';
}

export function sanitizeUploadFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function ensureAllowedAttachmentMimeType(mimeType: string) {
  if (SUPPORT_ATTACHMENT_REJECTED_MIME_TYPES.includes(mimeType as (typeof SUPPORT_ATTACHMENT_REJECTED_MIME_TYPES)[number])) {
    throw new SupportValidationError('Unsupported attachment MIME type.');
  }

  if (!SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES.includes(mimeType as (typeof SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES)[number])) {
    throw new SupportValidationError('Unsupported attachment MIME type.');
  }
}

export function ensureAllowedAttachmentExtension(extension: string) {
  if (!SUPPORT_ATTACHMENT_ALLOWED_EXTENSIONS.includes(extension as (typeof SUPPORT_ATTACHMENT_ALLOWED_EXTENSIONS)[number])) {
    throw new SupportValidationError('Unsupported attachment type.');
  }
}

export function parseSupportUploadIntentInput(value: unknown): ParsedSupportFileDescriptor {
  if (!value || typeof value !== 'object') {
    throw new SupportValidationError('Invalid attachment upload request.');
  }

  const record = value as Record<string, unknown>;
  const fileName = sanitizeUploadFileName(sanitizeSingleLineText(record.fileName, 240));
  const mimeType = sanitizeSingleLineText(record.mimeType, 120).toLowerCase();
  const size = Number(record.size);
  const extension = getAttachmentExtension(fileName);

  if (!fileName) {
    throw new SupportValidationError('Attachment file name is required.');
  }

  if (!Number.isFinite(size) || size <= 0) {
    throw new SupportValidationError('Invalid attachment size.');
  }

  if (size > SUPPORT_ATTACHMENT_MAX_SIZE_BYTES) {
    throw new SupportValidationError('Attachment exceeds the 10 MB size limit.');
  }

  ensureAllowedAttachmentMimeType(mimeType);
  ensureAllowedAttachmentExtension(extension);

  return {
    fileName,
    mimeType,
    size,
    extension,
  };
}

export function assertSupportAttachmentCount(count: number) {
  if (!Number.isInteger(count) || count < 0 || count > SUPPORT_ATTACHMENT_MAX_FILES) {
    throw new SupportValidationError(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_FILES} files per message.`);
  }
}

export function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function assertValidUuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !isValidUuid(value.trim())) {
    throw new SupportValidationError(`Invalid ${label}.`);
  }
  return value.trim();
}

export function parseNullableUuid(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return assertValidUuid(value, label);
}

export function isSupportTerminalStatus(status: unknown) {
  return status === 'resolved' || status === 'closed';
}

export function validateBulkSupportStatusTarget(status: SupportTicketStatus) {
  if (!['assigned', 'in_progress', 'waiting_for_customer', 'waiting_for_support', 'resolved'].includes(status)) {
    throw new SupportValidationError('This status is not available for bulk updates.');
  }
}

export function validateBulkSupportStatusTransition(args: {
  currentStatus: SupportTicketStatus;
  nextStatus: SupportTicketStatus;
}) {
  validateBulkSupportStatusTarget(args.nextStatus);

  if (isSupportTerminalStatus(args.currentStatus) && args.currentStatus !== args.nextStatus) {
    throw new SupportValidationError('Resolved or closed tickets cannot be changed automatically in bulk.');
  }
}

export function buildSupportAttachmentStoragePath(args: {
  ownerUserId: string;
  ticketId: string;
  extension: string;
}) {
  ensureAllowedAttachmentExtension(args.extension);
  return `${args.ownerUserId}/${args.ticketId}/${createClientId()}.${args.extension}`;
}

export function sanitizeSearchTerm(value: unknown, maxLength = 120) {
  return sanitizeSingleLineText(value, maxLength)
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapePostgrestLikeTerm(value: string) {
  return value.replace(/[%_]/g, '\\$&');
}

export function buildPostgrestOrLikeFilter(columns: string[], rawValue: unknown) {
  const term = sanitizeSearchTerm(rawValue);
  if (!term) return null;
  const escaped = escapePostgrestLikeTerm(term);
  return columns.map((column) => `${column}.ilike.%${escaped}%`).join(',');
}

export function canReopenTicket(resolvedAt: string | null | undefined, closedAt: string | null | undefined) {
  const baseline = closedAt || resolvedAt;
  if (!baseline) return false;
  const parsed = new Date(baseline);
  if (Number.isNaN(parsed.getTime())) return false;
  const deadline = new Date(parsed.getTime());
  deadline.setDate(deadline.getDate() + SUPPORT_TICKET_REOPEN_WINDOW_DAYS);
  return Date.now() <= deadline.getTime();
}

export function getStatusBadgeTone(status: string) {
  switch (status) {
    case 'new':
      return 'bg-info-soft text-info border border-info/20';
    case 'open':
    case 'assigned':
      return 'bg-warning-soft text-warning border border-warning/20';
    case 'in_progress':
      return 'bg-accent/10 text-accent border border-accent/20';
    case 'waiting_for_customer':
    case 'waiting_for_support':
      return 'bg-secondary text-secondary-foreground border border-border';
    case 'resolved':
    case 'closed':
      return 'bg-positive-soft text-positive border border-positive/20';
    case 'spam':
      return 'bg-negative-soft text-negative border border-negative/20';
    default:
      return 'bg-muted text-muted-foreground border border-border';
  }
}

export function getPriorityBadgeTone(priority: string) {
  switch (priority) {
    case 'urgent':
      return 'bg-negative-soft text-negative border border-negative/20';
    case 'high':
      return 'bg-warning-soft text-warning border border-warning/20';
    case 'normal':
      return 'bg-info-soft text-info border border-info/20';
    case 'low':
      return 'bg-secondary text-secondary-foreground border border-border';
    default:
      return 'bg-muted text-muted-foreground border border-border';
  }
}

export function hasTooManyLinks(value: string) {
  const matches = value.match(/https?:\/\/|www\./gi);
  return (matches?.length || 0) >= 3;
}
