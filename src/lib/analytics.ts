export type MarketingEventName =
  | 'sp_signup_click'
  | 'sp_account_created'
  | 'sp_pricing_viewed'
  | 'sp_contact_click'
  | 'sp_receipt_scan_used'
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

const PAGE_SESSION_EVENT_PREFIX = 'sp.analytics.page-session';

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

function getAnalyticsLanguage() {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const language = document.documentElement.lang?.trim();
  return language || undefined;
}

function getAnalyticsPagePath() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.location.pathname || '/';
}

function getSafeParams(params: MarketingEventParams = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  );
}

export function trackMarketingEvent(
  eventName: MarketingEventName,
  params: MarketingEventParams = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  const safeParams = getSafeParams(params);
  const payload = {
    event: eventName,
    page_path: getAnalyticsPagePath(),
    language: getAnalyticsLanguage(),
    ...safeParams,
  };

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, {
      page_path: payload.page_path,
      language: payload.language,
      ...safeParams,
    });
  }
}

export function trackMarketingEventOncePerPageSession(
  eventName: MarketingEventName,
  sessionKey: string,
  params: MarketingEventParams = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  const pagePath = getAnalyticsPagePath() || '/';
  const storageKey = `${PAGE_SESSION_EVENT_PREFIX}:${eventName}:${pagePath}:${sessionKey}`;

  try {
    if (window.sessionStorage.getItem(storageKey) === '1') {
      return;
    }

    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // Ignore sessionStorage failures and still attempt event delivery.
  }

  trackMarketingEvent(eventName, params);
}

export function trackSignupClick(params: MarketingEventParams = {}) {
  trackMarketingEvent('sp_signup_click', params);
}

export function trackAccountCreated(params: MarketingEventParams = {}) {
  trackMarketingEvent('sp_account_created', params);
}

export function trackPricingViewed(sessionKey: string, params: MarketingEventParams = {}) {
  trackMarketingEventOncePerPageSession('sp_pricing_viewed', sessionKey, params);
}

export function trackContactClick(params: MarketingEventParams = {}) {
  trackMarketingEvent('sp_contact_click', params);
}

export function trackReceiptScanUsed(params: MarketingEventParams = {}) {
  trackMarketingEvent('sp_receipt_scan_used', params);
}
