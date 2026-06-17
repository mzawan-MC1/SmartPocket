'use client';
import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import PortalFooter from './PortalFooter';
import { useLanguage } from '@/contexts/LanguageContext';

interface AppLayoutProps {
  children: React.ReactNode;
  activeRoute: string;
}

export default function AppLayout({ children, activeRoute }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { dir } = useLanguage();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [activeRoute]);

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <div className="flex min-h-screen w-full items-stretch">
      {/* Desktop Sidebar — left for LTR, right for RTL */}
      <div className={`hidden lg:flex lg:h-screen lg:flex-shrink-0 ${dir === 'rtl' ? 'order-last' : ''}`}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          activeRoute={activeRoute}
        />
      </div>

      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/35 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close navigation"
          />
          <div className={`absolute top-0 ${dir === 'rtl' ? 'right-0' : 'left-0'} h-full`}>
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
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onToggleSidebar={() => setMobileSidebarOpen((v) => !v)}
        />

        <main
          className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
          style={{ background: 'var(--background)' }}
        >
          <div className="flex min-h-full flex-col">
            <div className="page-shell flex-1 pt-[calc(var(--page-padding-y)+0.25rem)] pb-[calc(var(--page-padding-y)+1rem)] lg:pb-[calc(var(--page-padding-y)+1.25rem)]">
              {children}
            </div>
            <div className="pb-[calc(var(--bottom-nav-height)+0.5rem)] lg:pb-0">
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
  );
}
