'use client';

import React from 'react';
import Link, { type LinkProps } from 'next/link';
import type { MarketingEventName, MarketingEventParams } from '@/lib/analytics';
import { trackMarketingEvent } from '@/lib/analytics';

type TrackedAnalyticsLinkProps = LinkProps & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  eventName: MarketingEventName;
  eventParams?: MarketingEventParams;
};

export default function TrackedAnalyticsLink({
  eventName,
  eventParams,
  onClick,
  children,
  ...linkProps
}: TrackedAnalyticsLinkProps) {
  return (
    <Link
      {...linkProps}
      onClick={(event) => {
        trackMarketingEvent(eventName, eventParams);
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
