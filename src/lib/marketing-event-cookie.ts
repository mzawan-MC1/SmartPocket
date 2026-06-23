import type { MarketingEventName, MarketingEventParams } from '@/lib/analytics';

export const MARKETING_EVENT_COOKIE_NAME = 'sp_marketing_events';

export type QueuedMarketingEvent = {
  name: MarketingEventName;
  params?: MarketingEventParams;
};

export function encodeMarketingEventsCookie(events: QueuedMarketingEvent[]) {
  return encodeURIComponent(JSON.stringify(events));
}

export function decodeMarketingEventsCookie(value: string): QueuedMarketingEvent[] {
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is QueuedMarketingEvent => {
        return Boolean(entry && typeof entry === 'object' && typeof entry.name === 'string');
      })
      .map((entry) => ({
        name: entry.name,
        params: Object.fromEntries(
          Object.entries(entry.params || {}).filter(([, param]) => param !== undefined)
        ),
      }));
  } catch {
    return [];
  }
}
