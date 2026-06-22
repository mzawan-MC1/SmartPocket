'use client';
import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import PortalFooter from './PortalFooter';
import QuickActionsProvider from '@/components/quick-actions/QuickActionsProvider';
import { useLanguage } from '@/contexts/LanguageContext';

interface AppLayoutProps {
  children: React.ReactNode;
  activeRoute: string;
}

export default function AppLayout({ children, activeRoute }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { dir } = useLanguage();
  const isRTL = dir === 'rtl';

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [activeRoute]);

  return (
    <QuickActionsProvider>
      <div className="min-h-screen overflow-x-hidden bg-background" dir={dir}>
        <div className={`flex min-h-screen w-full items-stretch ${isRTL ? 'lg:flex-row-reverse' : 'lg:flex-row'}`}>
          {/* Desktop Sidebar — left for LTR, right for RTL */}
          <div
            className={`hidden self-stretch bg-card lg:flex lg:flex-shrink-0 ${
              isRTL ? 'border-s border-border' : 'border-e border-border'
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
            <div className="fixed inset-0 z-40 lg:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-foreground/35 backdrop-blur-sm"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close navigation"
              />
              <div className={`absolute top-0 ${isRTL ? 'right-0' : 'left-0'} h-full`}>
                <Sidebar
                  collapsed={false}
                  onToggle={() => setMobileSidebarOpen(false)}
                  activeRoute={activeRoute}
                  isMobileDrawer
                />
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
            <Topbar
              onToggleSidebar={() => setMobileSidebarOpen((v) => !v)}
            />

            <main
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin"
              style={{ background: 'var(--background)' }}
            >
              <div className="flex min-h-full flex-col">
                <div className="page-shell flex-1 pt-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] max-[480px]:pt-3 max-[480px]:pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pt-5 sm:pb-9 lg:pt-5 lg:pb-9">
                  {children}
                </div>
                <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] max-[480px]:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
                  <PortalFooter />
                </div>
              </div>
            </main>
          </div>

          {/* Mobile Bottom Nav */}
          <div className="lg:hidden">
            <BottomNav activeRoute={activeRoute} />
          </div>
        </div>
      </div>
    </QuickActionsProvider>
  );
}
