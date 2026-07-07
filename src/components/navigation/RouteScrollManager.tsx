'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const SCROLL_CONTAINER_SELECTOR = '[data-route-scroll-container="true"]';

function scrollRegisteredContainersToTop() {
  const containers = document.querySelectorAll<HTMLElement>(SCROLL_CONTAINER_SELECTOR);
  containers.forEach((container) => {
    container.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
}

export default function RouteScrollManager() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      if (window.location.hash) {
        return;
      }

      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      scrollRegisteredContainersToTop();
    });
  }, [pathname, searchKey]);

  return null;
}
