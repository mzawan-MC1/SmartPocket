export type MarketingEventName =
  | 'sign_up_started'
  | 'sign_up_completed'
  | 'email_confirmed'
  | 'trial_started'
  | 'pricing_viewed'
  | 'plan_selected'
  | 'checkout_started'
  | 'subscription_completed'
  | 'topup_completed'
  | 'login'
  | 'contact_submitted';

export type MarketingEventParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

export function isValidGoogleAnalyticsId(value?: string | null) {
  return Boolean(value && /^G-[A-Z0-9]{6,}$/i.test(value.trim()));
}

export function isValidGoogleTagManagerId(value?: string | null) {
  return Boolean(value && /^GTM-[A-Z0-9]{4,}$/i.test(value.trim()));
}

export function trackMarketingEvent(
  eventName: MarketingEventName,
  params: MarketingEventParams = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  const safeParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  );

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    ...safeParams,
  });

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, safeParams);
  }
}
