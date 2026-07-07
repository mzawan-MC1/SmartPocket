'use client';

import type { ReactNode } from 'react';
import React, { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import AdminSidebar from '@/app/admin/components/AdminSidebar';
import AdminTopbar from '@/app/admin/components/AdminTopbar';
import PortalFooter from '@/components/PortalFooter';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useAuth();

  const onToggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

  const isAdmin = user?.app_metadata?.role === 'admin';

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="flex min-h-screen w-full items-stretch">
        <div
          className="hidden self-stretch border-e border-border bg-card lg:flex lg:flex-shrink-0"
          style={{ width: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
        >
          <AdminSidebar collapsed={sidebarCollapsed} onToggle={onToggleSidebar} activeRoute={pathname} />
        </div>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-foreground/35 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close admin navigation"
            />
            <div className="absolute left-0 top-0 h-full w-[86vw] max-w-[320px]">
              <AdminSidebar collapsed={false} onToggle={() => setMobileNavOpen(false)} activeRoute={pathname} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar onToggleSidebar={() => setMobileNavOpen((v) => !v)} />
          <main data-route-scroll-container="true" className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin">
            <div className="flex min-h-full flex-col">
              <div className="page-shell flex-1 pt-4 pb-8 sm:pt-5 sm:pb-10 lg:pt-5 lg:pb-10">
                {!isAdmin ? (
                  <div className="card-elevated max-w-xl p-6">
                    <h1 className="text-lg font-700">Admin access required</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your account does not have permission to view the admin portal.
                    </p>
                  </div>
                ) : (
                  <div className="max-w-screen-2xl">{children}</div>
                )}
              </div>
              <PortalFooter />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
