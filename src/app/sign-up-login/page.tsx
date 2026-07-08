import React from 'react';
import PublicBackToTop from '@/components/public/PublicBackToTop';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import AuthScreen from './components/AuthScreen';

export default function SignUpLoginPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        <div className="page-shell py-3 sm:py-6 lg:py-10">
          <div className="overflow-hidden rounded-[24px] border border-border bg-card shadow-card-lg sm:rounded-[32px]">
            <AuthScreen />
          </div>
        </div>
      </main>
      <PublicBackToTop />
      <PublicFooter />
    </div>
  );
}
