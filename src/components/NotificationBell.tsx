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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async (syncSignals = false) => {
    setError(null);
    setLoading(true);
    try {
      if (syncSignals) {
        setSyncing(true);
        await syncInAppNotificationSignals();
      }

      const [items, unread] = await Promise.all([
        listNotifications(),
        getUnreadNotificationCount(),
      ]);
      setNotifications(items);
      setUnreadCount(unread);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useSmartPocketDataChanged(['notifications'], 'NotificationBell', () => {
    void refresh();
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh(true);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [refresh]);

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
      await refresh();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Failed to mark notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  }, [refresh]);

  const headerLabel = useMemo(() => {
    if (unreadCount <= 0) return 'No unread notifications';
    if (unreadCount === 1) return '1 unread notification';
    return `${unreadCount} unread notifications`;
  }, [unreadCount]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="btn-ghost relative h-10 w-10 p-0"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            void refresh();
          }
        }}
      >
        <Bell size={18} />
        {unreadDot ? (
          <span className="absolute top-1.5 end-1.5 flex min-h-2.5 min-w-2.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-700 text-white ring-2 ring-card">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute end-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-card-lg"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
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

          <div className="max-h-[24rem] overflow-y-auto">
            {loading ? (
              <div className="space-y-3 px-4 py-4">
                {[0, 1, 2].map((index) => (
                  <div key={`notification-skeleton-${index}`} className="animate-pulse rounded-xl border border-border/70 p-3">
                    <div className="mb-2 h-3 w-28 rounded bg-muted" />
                    <div className="mb-2 h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-600 text-foreground">Could not load notifications</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                <button
                  type="button"
                  className="mt-3 btn-secondary text-sm"
                  onClick={() => void refresh(true)}
                >
                  Try again
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
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
                    className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
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
