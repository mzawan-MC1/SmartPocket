import React from 'react';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import AuthScreen from './components/AuthScreen';

export default function SignUpLoginPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex flex-col">
        <AuthScreen />
      </main>
      <PublicFooter />
    </div>
  );
}