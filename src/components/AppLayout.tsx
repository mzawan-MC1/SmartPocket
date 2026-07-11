'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import PortalFooter from './PortalFooter';
import QuickActionsProvider from '@/components/quick-actions/QuickActionsProvider';
import { SubscriptionSummaryProvider } from '@/contexts/SubscriptionSummaryContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { subscribeToMediaQueryChange } from '@/lib/browser-compat';

interface AppLayoutProps {
  children: React.ReactNode;
  activeRoute: string;
  hideMobileTopbar?: boolean;
  hideMobileFooter?: boolean;
  mobileContentPaddingBottomClassName?: string;
}

export default function AppLayout({
  children,
  activeRoute,
  hideMobileTopbar = false,
  hideMobileFooter = false,
  mobileContentPaddingBottomClassName,
}: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState(false);
  const [isMdUp, setIsMdUp] = useState(false);
  const closeSidebarTimerRef = useRef<number | null>(null);
  const { dir } = useLanguage();
  const isRTL = dir === 'rtl';
  const { t } = useTranslation('common');

  const clearSidebarCloseTimer = useCallback(() => {
    if (closeSidebarTimerRef.current !== null) {
      window.clearTimeout(closeSidebarTimerRef.current);
      closeSidebarTimerRef.current = null;
    }
  }, []);

  const openMobileSidebar = useCallback(() => {
    clearSidebarCloseTimer();
    setMobileSidebarOpen(true);
    window.requestAnimationFrame(() => setMobileSidebarVisible(true));
  }, [clearSidebarCloseTimer]);

  const closeMobileSidebar = useCallback(() => {
    clearSidebarCloseTimer();
    setMobileSidebarVisible(false);
    closeSidebarTimerRef.current = window.setTimeout(() => {
      setMobileSidebarOpen(false);
      closeSidebarTimerRef.current = null;
    }, 200);
  }, [clearSidebarCloseTimer]);

  const toggleMobileSidebar = useCallback(() => {
    if (mobileSidebarOpen && mobileSidebarVisible) {
      closeMobileSidebar();
      return;
    }

    openMobileSidebar();
  }, [closeMobileSidebar, mobileSidebarOpen, mobileSidebarVisible, openMobileSidebar]);

  useEffect(() => {
    if (mobileSidebarOpen) {
      closeMobileSidebar();
    }
  }, [activeRoute, closeMobileSidebar, mobileSidebarOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const updateMatch = () => setIsMdUp(mediaQuery.matches);
    updateMatch();
    return subscribeToMediaQueryChange(mediaQuery, updateMatch);
  }, []);

  useEffect(() => {
    if (!isMdUp) return;
    clearSidebarCloseTimer();
    setMobileSidebarVisible(false);
    setMobileSidebarOpen(false);
  }, [clearSidebarCloseTimer, isMdUp]);

  useEffect(() => () => clearSidebarCloseTimer(), [clearSidebarCloseTimer]);

  const resolvedMobileContentPaddingBottomClassName =
    mobileContentPaddingBottomClassName
      || 'pb-[calc(6.25rem+env(safe-area-inset-bottom))] max-[480px]:pb-[calc(6.75rem+env(safe-area-inset-bottom))] sm:pb-9 lg:pb-9';
  const shouldRenderTopbar = !hideMobileTopbar || isMdUp;
  const shouldRenderFooter = !hideMobileFooter || isMdUp;

  return (
    <SubscriptionSummaryProvider>
      <QuickActionsProvider>
        <div className="min-h-screen min-h-[100dvh] overflow-x-hidden bg-background lg:h-screen lg:overflow-hidden" dir={dir}>
          <div className="flex min-h-screen min-h-[100dvh] w-full items-stretch lg:h-screen lg:flex-row lg:overflow-hidden">
            {/* Desktop Sidebar — left for LTR, right for RTL */}
            <div
              className={`print:hidden hidden self-stretch bg-card lg:flex lg:h-screen lg:flex-shrink-0 lg:overflow-hidden ${
                isRTL ? 'border-l border-border' : 'border-r border-border'
              }`}
              style={{ width: sidebarCollapsed ? '60px' : '244px' }}
            >
              <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                activeRoute={activeRoute}
              />
            </div>

            {mobileSidebarOpen && (
              <div className="fixed inset-0 z-40 print:hidden lg:hidden">
                <button
                  type="button"
                  className={`absolute inset-0 bg-foreground/35 backdrop-blur-sm transition-opacity duration-200 ${
                    mobileSidebarVisible ? 'opacity-100' : 'opacity-0'
                  }`}
                  onClick={closeMobileSidebar}
                  aria-label={t('actions.close')}
                />
                <div
                  className={`absolute inset-y-0 ${isRTL ? 'right-0' : 'left-0'} min-h-0 h-[100dvh] max-h-[100dvh] transition-transform duration-200 ease-out ${
                    mobileSidebarVisible
                      ? 'translate-x-0'
                      : isRTL
                        ? 'translate-x-full'
                        : '-translate-x-full'
                  }`}
                >
                  <Sidebar
                    collapsed={false}
                    onToggle={closeMobileSidebar}
                    activeRoute={activeRoute}
                    isMobileDrawer
                    onNavigateItem={closeMobileSidebar}
                  />
                </div>
              </div>
            )}

            {/* Main Content Area */}
            <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden lg:h-screen lg:min-h-0 lg:overflow-hidden">
              {shouldRenderTopbar ? (
                <div className={`print:hidden ${hideMobileTopbar ? 'hidden md:block' : ''}`}>
                  <Topbar
                    onToggleSidebar={toggleMobileSidebar}
                  />
                </div>
              ) : null}

              <main
                data-route-scroll-container="true"
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin lg:h-full"
                style={{ background: 'var(--background)' }}
              >
                <div className="flex min-h-full flex-col">
                  <div className={`page-shell page-shell-authenticated flex-1 ${resolvedMobileContentPaddingBottomClassName}`}>
                    {children}
                  </div>
                  {shouldRenderFooter ? (
                    <div className={`print:hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] max-[480px]:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0 ${hideMobileFooter ? 'hidden md:block' : ''}`}>
                      <PortalFooter />
                    </div>
                  ) : null}
                </div>
              </main>
            </div>

            {/* Mobile Bottom Nav */}
            <div className="print:hidden lg:hidden">
              <BottomNav activeRoute={activeRoute} />
            </div>
          </div>
        </div>
      </QuickActionsProvider>
    </SubscriptionSummaryProvider>
  );
}
