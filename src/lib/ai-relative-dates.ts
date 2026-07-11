import { DEFAULT_FINANCIAL_PERIOD_CONFIG, getCurrentBusinessDate } from './financial-periods';

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTH_NAME_PATTERN = [
  'jan(?:uary)?',
  'feb(?:ruary)?',
  'mar(?:ch)?',
  'apr(?:il)?',
  'may',
  'jun(?:e)?',
  'jul(?:y)?',
  'aug(?:ust)?',
  'sep(?:tember)?',
  'oct(?:ober)?',
  'nov(?:ember)?',
  'dec(?:ember)?',
].join('|');

const ABSOLUTE_DATE_PATTERN = new RegExp(
  [
    '\\b\\d{4}-\\d{2}-\\d{2}\\b',
    '\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b',
    `\\b\\d{1,2}\\s+(?:${MONTH_NAME_PATTERN})\\s+\\d{4}\\b`,
    `\\b(?:${MONTH_NAME_PATTERN})\\s+\\d{1,2},?\\s+\\d{4}\\b`,
  ].join('|'),
  'i'
);

const FUTURE_INTENT_PATTERN = /\b(plan(?:ned)?|upcoming|next|tomorrow|will|gonna|going to|later|schedule(?:d)?|future)\b/i;

export interface SmartEntryDateContext {
  currentDate: string;
  currentDateTime: string;
  timezone: string;
  locale?: string;
}

export interface RelativeDateResolution {
  resolvedDate: string | null;
  matchedPhrases: string[];
  usedRelativeDate: boolean;
  hasAbsoluteDate: boolean;
}

function sanitizeTimezone(value: string | undefined | null) {
  const normalized = (value || '').trim();
  if (!normalized) return DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date());
    return normalized;
  } catch {
    return DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone;
  }
}

function normalizeIsoDate(value: string | undefined | null) {
  const normalized = (value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function toUtcNoonDate(dateString: string) {
  const [yearText, monthText, dayText] = dateString.split('-');
  return new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), 12, 0, 0));
}

function formatUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, amount: number) {
  const date = toUtcNoonDate(dateString);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatUtcDate(date);
}

function addMonthsClamped(dateString: string, amount: number) {
  const date = toUtcNoonDate(dateString);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDayOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12, 0, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return formatUtcDate(date);
}

function getWeekStartMonday(dateString: string) {
  const weekday = toUtcNoonDate(dateString).getUTCDay();
  const daysFromMonday = (weekday + 6) % 7;
  return addDays(dateString, -daysFromMonday);
}

function getDateForWeekdayInWeek(dateString: string, weekday: number, weekOffset = 0) {
  const weekStart = getWeekStartMonday(dateString);
  const offsetFromMonday = (weekday + 6) % 7;
  return addDays(weekStart, weekOffset * 7 + offsetFromMonday);
}

function getPreviousWeekday(dateString: string, weekday: number) {
  const currentWeekday = toUtcNoonDate(dateString).getUTCDay();
  let offset = (currentWeekday - weekday + 7) % 7;
  if (offset === 0) {
    offset = 7;
  }
  return addDays(dateString, -offset);
}

function compareIsoDates(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '00';

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function getOffsetString(date: Date, timezone: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
      hour: '2-digit',
      minute: '2-digit',
    });
    const offsetValue = formatter
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')
      ?.value;

    const match = offsetValue?.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return 'Z';

    const hours = match[1].slice(1).padStart(2, '0');
    const sign = match[1].startsWith('-') ? '-' : '+';
    const minutes = match[2] || '00';
    return `${sign}${hours}:${minutes}`;
  } catch {
    return 'Z';
  }
}

function buildCurrentDateTimeIso(referenceDate: Date, timezone: string) {
  const parts = getZonedParts(referenceDate, timezone);
  const offset = getOffsetString(referenceDate, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function hasFutureIntent(text: string) {
  return FUTURE_INTENT_PATTERN.test(text);
}

function resolveRelativePhraseDate(phrase: string, currentDate: string, sourceText: string) {
  const normalizedPhrase = phrase.trim().toLowerCase();
  const futureIntent = hasFutureIntent(sourceText);

  if (normalizedPhrase === 'today') return currentDate;
  if (normalizedPhrase === 'yesterday') return addDays(currentDate, -1);
  if (normalizedPhrase === 'tomorrow') return addDays(currentDate, 1);
  if (normalizedPhrase === 'last week') return addDays(currentDate, -7);
  if (normalizedPhrase === 'this week') return futureIntent ? currentDate : currentDate;
  if (normalizedPhrase === 'last month') return addMonthsClamped(currentDate, -1);
  if (normalizedPhrase === 'this month') return currentDate;

  const lastWeekdayMatch = normalizedPhrase.match(/^last week\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (lastWeekdayMatch) {
    return getDateForWeekdayInWeek(currentDate, WEEKDAY_INDEX[lastWeekdayMatch[1]], -1);
  }

  const thisWeekdayMatch = normalizedPhrase.match(/^this week\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (thisWeekdayMatch) {
    const candidate = getDateForWeekdayInWeek(currentDate, WEEKDAY_INDEX[thisWeekdayMatch[1]], 0);
    if (!futureIntent && compareIsoDates(candidate, currentDate) > 0) {
      return addDays(candidate, -7);
    }
    return candidate;
  }

  const lastMatch = normalizedPhrase.match(/^last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (lastMatch) {
    return getPreviousWeekday(currentDate, WEEKDAY_INDEX[lastMatch[1]]);
  }

  const thisMatch = normalizedPhrase.match(/^this\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (thisMatch) {
    const candidate = getDateForWeekdayInWeek(currentDate, WEEKDAY_INDEX[thisMatch[1]], 0);
    if (!futureIntent && compareIsoDates(candidate, currentDate) > 0) {
      return addDays(candidate, -7);
    }
    return candidate;
  }

  return null;
}

export function buildSmartEntryDateContext(args?: {
  timezone?: string | null;
  locale?: string | null;
  currentDate?: string | null;
  currentDateTime?: string | null;
  referenceDate?: Date;
}): SmartEntryDateContext {
  const timezone = sanitizeTimezone(args?.timezone);
  const referenceDate = args?.referenceDate instanceof Date ? args.referenceDate : new Date();
  const currentDate = normalizeIsoDate(args?.currentDate) || getCurrentBusinessDate(timezone, referenceDate);
  const currentDateTime = args?.currentDateTime && !Number.isNaN(new Date(args.currentDateTime).getTime())
    ? args.currentDateTime
    : buildCurrentDateTimeIso(referenceDate, timezone);

  return {
    currentDate,
    currentDateTime,
    timezone,
    locale: (args?.locale || '').trim() || undefined,
  };
}

export function resolveRelativeDateFromText(args: {
  sourceText?: string | null;
  currentDate: string;
}): RelativeDateResolution {
  const sourceText = (args.sourceText || '').trim();
  if (!sourceText) {
    return {
      resolvedDate: null,
      matchedPhrases: [],
      usedRelativeDate: false,
      hasAbsoluteDate: false,
    };
  }

  const lowered = sourceText.toLowerCase();
  const hasAbsoluteDate = ABSOLUTE_DATE_PATTERN.test(lowered);
  const phrases: string[] = [];

  const pushMatch = (pattern: RegExp) => {
    const matches = lowered.matchAll(pattern);
    for (const match of matches) {
      if (match[0]) {
        phrases.push(match[0].trim());
      }
    }
  };

  pushMatch(/\blast week\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g);
  pushMatch(/\bthis week\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g);
  pushMatch(/\blast\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g);
  pushMatch(/\bthis\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g);
  pushMatch(/\b(?:today|yesterday|tomorrow|last week|this week|last month|this month)\b/g);

  if (phrases.length === 0) {
    return {
      resolvedDate: null,
      matchedPhrases: [],
      usedRelativeDate: false,
      hasAbsoluteDate,
    };
  }

  const uniquePhrases = Array.from(new Set(phrases)).filter((phrase) => {
    if (phrase === 'last week') {
      return !phrases.some((candidate) => candidate.startsWith('last week ') && candidate !== 'last week');
    }
    if (phrase === 'this week') {
      return !phrases.some((candidate) => candidate.startsWith('this week ') && candidate !== 'this week');
    }
    return true;
  });
  const resolvedDates = uniquePhrases
    .map((phrase) => resolveRelativePhraseDate(phrase, args.currentDate, lowered))
    .filter((value): value is string => !!value);
  const uniqueDates = Array.from(new Set(resolvedDates));

  return {
    resolvedDate: uniqueDates.length === 1 ? uniqueDates[0] : null,
    matchedPhrases: uniquePhrases,
    usedRelativeDate: uniquePhrases.length > 0,
    hasAbsoluteDate,
  };
}

type DateNormalizableAction = {
  actionType?: string;
  date?: string;
  startDate?: string;
};

export function applySmartEntryDateDefaults<T extends {
  actions: DateNormalizableAction[];
}>(args: {
  instruction: T;
  sourceText?: string | null;
  currentDate: string;
}): T {
  const resolution = resolveRelativeDateFromText({
    sourceText: args.sourceText,
    currentDate: args.currentDate,
  });

  const fallbackDate = resolution.resolvedDate || args.currentDate;
  const shouldForceResolvedDate = !!resolution.resolvedDate && resolution.usedRelativeDate && !resolution.hasAbsoluteDate;

  return {
    ...args.instruction,
    actions: args.instruction.actions.map((action) => {
      const actionType = typeof action.actionType === 'string' ? action.actionType : '';
      if (actionType === 'create_account' || actionType === 'create_managed_person') {
        return { ...action };
      }

      const nextAction = { ...action };
      const actionDate = typeof action.date === 'string' ? action.date : undefined;
      const actionStartDate = typeof action.startDate === 'string' ? action.startDate : undefined;

      nextAction.date = shouldForceResolvedDate
        ? fallbackDate
        : !actionDate || actionDate === 'today'
          ? fallbackDate
          : actionDate;

      if ('startDate' in nextAction) {
        nextAction.startDate = shouldForceResolvedDate
          ? fallbackDate
          : !actionStartDate || actionStartDate === 'today'
            ? fallbackDate
            : actionStartDate;
      }

      return nextAction;
    }),
  };
}
