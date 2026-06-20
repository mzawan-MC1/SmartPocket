'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  syncInAppNotificationSignals,
  type AppNotification,
} from '@/lib/notifications';
import { useSmartPocketDataChanged } from '@/lib/data-change';

const NOTIFICATION_STALE_MS = 60 * 1000;

function formatNotificationTime(value: string) {
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return formatter.format(diffDays, 'day');
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const lastLoadedAtRef = useRef<number | null>(null);
  const lightRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshLight = useCallback(async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
    if (lightRefreshInFlightRef.current) {
      return lightRefreshInFlightRef.current;
    }

    const shouldShowLoading = showLoading && !hasLoadedRef.current;
    const refreshPromise = (async () => {
      if (shouldShowLoading) {
        setLoading(true);
      }

      try {
        const [items, unread] = await Promise.all([
          listNotifications(),
          getUnreadNotificationCount(),
        ]);
        hasLoadedRef.current = true;
        lastLoadedAtRef.current = Date.now();
        setNotifications(items);
        setUnreadCount(unread);
        setError(null);
      } catch (refreshError) {
        if (!hasLoadedRef.current) {
          setError(refreshError instanceof Error ? refreshError.message : 'Failed to load notifications.');
        }
      } finally {
        if (shouldShowLoading) {
          setLoading(false);
        }
        lightRefreshInFlightRef.current = null;
      }
    })();

    lightRefreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, []);

  const runSignalSync = useCallback(async () => {
    if (syncInFlightRef.current) {
      return syncInFlightRef.current;
    }

    const syncPromise = (async () => {
      setSyncing(true);
      try {
        await syncInAppNotificationSignals();
      } catch (syncError) {
        if (!hasLoadedRef.current) {
          setError(syncError instanceof Error ? syncError.message : 'Failed to refresh alerts.');
        }
      } finally {
        setSyncing(false);
        syncInFlightRef.current = null;
      }
    })();

    syncInFlightRef.current = syncPromise;
    return syncPromise;
  }, []);

  const isDataStale = useCallback(() => {
    if (lastLoadedAtRef.current === null) {
      return true;
    }
    return Date.now() - lastLoadedAtRef.current > NOTIFICATION_STALE_MS;
  }, []);

  useEffect(() => {
    void refreshLight({ showLoading: true });
    void runSignalSync();
  }, [refreshLight, runSignalSync]);

  useSmartPocketDataChanged(['notifications'], 'NotificationBellNotifications', () => {
    void refreshLight();
  });

  useSmartPocketDataChanged(['profile', 'recurring_transactions', 'budgets'], 'NotificationBellSignals', () => {
    void runSignalSync();
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshLight();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [refreshLight]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const unreadDot = unreadCount > 0;

  const handleNotificationClick = useCallback(async (notification: AppNotification) => {
    try {
      if (!notification.is_read) {
        await markNotificationAsRead(notification.id);
      }
      setOpen(false);
      if (notification.action_url) {
        router.push(notification.action_url);
      }
    } catch (clickError) {
      setError(clickError instanceof Error ? clickError.message : 'Failed to open notification.');
    }
  }, [router]);

  const handleMarkAll = useCallback(async () => {
    setMarkingAll(true);
    setError(null);
    try {
      await markAllNotificationsAsRead();
      await refreshLight();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Failed to mark notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  }, [refreshLight]);

  const handleRetry = useCallback(async () => {
    await refreshLight({ showLoading: true });
    void runSignalSync();
  }, [refreshLight, runSignalSync]);

  const headerLabel = useMemo(() => {
    if (unreadCount <= 0) return 'No unread notifications';
    if (unreadCount === 1) return '1 unread notification';
    return `${unreadCount} unread notifications`;
  }, [unreadCount]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        className="btn-ghost relative h-12 w-12 shrink-0 p-0 max-[480px]:flex max-[480px]:h-10 max-[480px]:w-10 max-[480px]:items-center max-[480px]:justify-center max-[480px]:rounded-xl"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen && isDataStale()) {
            void refreshLight();
          }
        }}
      >
        <Bell className="h-[44px] w-[44px] max-[480px]:h-[22px] max-[480px]:w-[22px]" />
        {unreadDot ? (
          <span className="absolute end-1 top-1 flex min-h-2.5 min-w-2.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-700 text-white ring-2 ring-card max-[480px]:end-1.5 max-[480px]:top-1.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute end-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-card-lg max-[480px]:fixed max-[480px]:left-3 max-[480px]:right-3 max-[480px]:top-[calc(env(safe-area-inset-top)+4rem)] max-[480px]:mt-0 max-[480px]:w-auto max-[480px]:max-w-[calc(100vw-24px)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 max-[480px]:px-3.5 max-[480px]:py-3">
            <div>
              <p className="text-sm font-700 text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">{syncing ? 'Refreshing alerts...' : headerLabel}</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-700 text-accent hover:bg-accent/5 disabled:opacity-50"
              onClick={() => void handleMarkAll()}
              disabled={markingAll || unreadCount === 0}
            >
              {markingAll ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
              Mark all read
            </button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto max-[480px]:max-h-[min(26rem,calc(100dvh-6rem-env(safe-area-inset-top)))]">
            {loading ? (
              <div className="space-y-3 px-4 py-4 max-[480px]:px-3.5 max-[480px]:py-3.5">
                {[0, 1, 2].map((index) => (
                  <div key={`notification-skeleton-${index}`} className="animate-pulse rounded-xl border border-border/70 p-3">
                    <div className="mb-2 h-3 w-28 rounded bg-muted" />
                    <div className="mb-2 h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-center max-[480px]:px-3.5 max-[480px]:py-5">
                <p className="text-sm font-600 text-foreground">Could not load notifications</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                <button
                  type="button"
                  className="mt-3 btn-secondary text-sm"
                  onClick={() => void handleRetry()}
                >
                  Try again
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center max-[480px]:px-3.5 max-[480px]:py-6">
                <p className="text-sm font-600 text-foreground">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Budget alerts, recurring reminders, and Smart Entry failures will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40 max-[480px]:px-3.5 max-[480px]:py-3 ${
                      notification.is_read ? 'bg-card' : 'bg-accent/5'
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {!notification.is_read ? <span className="mt-0.5 h-2 w-2 rounded-full bg-accent" aria-hidden="true" /> : null}
                        <p className="text-sm font-700 text-foreground">{notification.title}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatNotificationTime(notification.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{notification.message}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
