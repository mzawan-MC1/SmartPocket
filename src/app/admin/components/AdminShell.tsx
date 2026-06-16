'use client';

import type { ReactNode } from 'react';
import React, { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import AdminSidebar from '@/app/admin/components/AdminSidebar';
import AdminTopbar from '@/app/admin/components/AdminTopbar';
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
    <div className="h-dvh w-full flex bg-background text-foreground">
      <div className="hidden lg:block h-full">
        <AdminSidebar collapsed={sidebarCollapsed} onToggle={onToggleSidebar} activeRoute={pathname} />
      </div>

      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
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

      <div className="flex-1 min-w-0 flex flex-col h-full">
        <AdminTopbar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setMobileNavOpen((v) => !v)} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="page-shell py-[var(--page-padding-y)]">
            {!isAdmin ? (
              <div className="card-elevated p-6 max-w-xl">
                <h1 className="text-lg font-700">Admin access required</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Your account does not have permission to view the admin portal.
                </p>
              </div>
            ) : (
              <div className="max-w-screen-2xl">{children}</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
