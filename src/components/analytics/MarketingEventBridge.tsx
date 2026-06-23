'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackMarketingEvent } from '@/lib/analytics';
import {
  decodeMarketingEventsCookie,
  MARKETING_EVENT_COOKIE_NAME,
} from '@/lib/marketing-event-cookie';

function readCookie(name: string) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? match[1] : '';
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export default function MarketingEventBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const cookieValue = readCookie(MARKETING_EVENT_COOKIE_NAME);
    if (!cookieValue) {
      return;
    }

    const events = decodeMarketingEventsCookie(cookieValue);
    clearCookie(MARKETING_EVENT_COOKIE_NAME);

    events.forEach((event) => {
      trackMarketingEvent(event.name, event.params || {});
    });
  }, [pathname]);

  return null;
}
