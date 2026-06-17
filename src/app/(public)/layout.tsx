'use client';
import React from 'react';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import PublicBackToTop from '@/components/public/PublicBackToTop';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        {children}
      </main>
      <PublicBackToTop />
      <PublicFooter />
    </div>
  );
}
