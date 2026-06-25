'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { usePathname } from 'next/navigation';

function matchesRoute(currentPath: string, href: string) {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function usePendingNavigation(activeRoute?: string) {
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const resolvedPath = activeRoute || pathname;

  useEffect(() => {
    if (pendingPath && matchesRoute(pathname, pendingPath)) {
      setPendingPath(null);
    }
  }, [pathname, pendingPath]);

  const isRouteActive = useCallback((href: string) => {
    return (
      pendingPath === href ||
      matchesRoute(resolvedPath, href) ||
      matchesRoute(pathname, href)
    );
  }, [pathname, pendingPath, resolvedPath]);

  const isRoutePending = useCallback((href: string) => pendingPath === href, [pendingPath]);

  const handleNavigationIntent = useCallback((href: string, event?: MouseEvent<HTMLElement>) => {
    if (pendingPath === href) {
      event?.preventDefault();
      return false;
    }

    // Keep parent routes visually active on child pages, but still allow clicks
    // to navigate back to the explicit parent route.
    if (pathname === href) {
      setPendingPath(null);
      event?.preventDefault();
      return false;
    }

    setPendingPath(href);
    return true;
  }, [pathname, pendingPath, resolvedPath]);

  return {
    pathname,
    pendingPath,
    setPendingPath,
    isRouteActive,
    isRoutePending,
    handleNavigationIntent,
  };
}
