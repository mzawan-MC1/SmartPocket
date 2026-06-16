'use client';
import React, { useState, Suspense } from 'react';
import LoginForm from './LoginForm';
import SignUpForm from './SignUpForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import AppLogo from '@/components/ui/AppLogo';
import { ShieldCheck, TrendingUp, PieChart, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Icon from '@/components/ui/AppIcon';


type AuthMode = 'login' | 'signup' | 'forgot';

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const { t } = useTranslation('auth');

  const features = [
    { id: 'feat-track', icon: TrendingUp, text: 'Track every dollar across all accounts' },
    { id: 'feat-budget', icon: PieChart, text: 'Set budgets and get spending alerts' },
    { id: 'feat-reports', icon: BarChart3, text: 'Professional reports and PDF statements' },
    { id: 'feat-secure', icon: ShieldCheck, text: 'Bank-level security with row-level access control' },
  ];

  return (
    <div className="flex flex-1 min-h-0 bg-[radial-gradient(circle_at_top_right,rgba(15,159,152,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,59,99,0.08),transparent_35%)]">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] gradient-navy flex-col justify-between p-10 xl:p-14 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white opacity-5" />
          <div className="absolute bottom-20 -left-10 w-60 h-60 rounded-full bg-teal-400 opacity-10" />
          <div className="absolute top-1/2 right-10 w-32 h-32 rounded-full bg-mint opacity-5" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <AppLogo size={40} />
            <span className="text-white text-xl font-700 tracking-tight">Smart Pocket</span>
          </div>
        </div>

        <div className="relative space-y-6">
          <div className="max-w-xl">
            <h2 className="text-4xl xl:text-5xl font-800 text-white leading-[1.05] text-balance">
              Take control of your finances
            </h2>
            <p className="text-white/78 mt-4 text-lg leading-relaxed">
              One clean dashboard for all your accounts, budgets, and financial goals.
            </p>
          </div>

          <div className="space-y-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-mint" />
                  </div>
                  <p className="text-white/85 text-sm">{f.text}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative">
          <p className="text-white/40 text-xs">
            © 2026 Smart Pocket. Your data stays yours.
          </p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto">
        {/* Mobile logo */}
        <div className="w-full max-w-[400px] flex justify-start items-center mb-6 lg:hidden">
          <div className="flex items-center gap-2">
            <AppLogo size={32} />
            <span className="font-700 text-lg text-primary">Smart Pocket</span>
          </div>
        </div>

        <div className="w-full max-w-[460px] rounded-[28px] border border-border bg-card/95 p-5 sm:p-7 shadow-card-lg">
          <Suspense fallback={<div className="w-full h-64 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin" /></div>}>
            {mode === 'login' && (
              <LoginForm
                onSwitchToSignUp={() => setMode('signup')}
                onForgotPassword={() => setMode('forgot')}
              />
            )}
            {mode === 'signup' && (
              <SignUpForm onSwitchToLogin={() => setMode('login')} />
            )}
            {mode === 'forgot' && (
              <ForgotPasswordForm onBack={() => setMode('login')} />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
