'use client';
import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
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
    <div className="flex h-dvh overflow-hidden bg-background" dir={dir}>
      {/* Desktop Sidebar — left for LTR, right for RTL */}
      <div className={`hidden lg:flex flex-shrink-0 ${dir === 'rtl' ? 'order-last' : ''}`}>
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
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setMobileSidebarOpen((v) => !v)}
        />

        <main
          className="flex-1 overflow-y-auto scrollbar-thin pb-24 lg:pb-8"
          style={{ background: 'var(--background)' }}
        >
          <div className="page-shell page-shell-authenticated">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="lg:hidden">
        <BottomNav activeRoute={activeRoute} />
      </div>
    </div>
  );
}
