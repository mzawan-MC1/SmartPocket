'use client';

import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';

function buildAuthErrorDestination(args: {
  code: 'oauth_cancelled' | 'oauth_provider_error' | 'callback_error';
  message: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set('desktop', '1');
  searchParams.set('authError', args.code);
  searchParams.set('authMessage', args.message);
  return `/sign-up-login?${searchParams.toString()}`;
}

export default function DesktopAuthCallbackPage() {
  const { t } = useTranslation(['auth', 'public']);
  const searchParams = useSearchParams();
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;

    const supabase = createClient();
    const code = searchParams.get('code');
    const providerError = searchParams.get('error');
    const providerErrorDescription = searchParams.get('error_description');
    const navigateTo = (destination: string) => {
      window.location.replace(destination);
    };

    const waitForSession = async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data.session?.user) {
          return data.session;
        }

        if (attempt < 4) {
          await new Promise((resolve) => window.setTimeout(resolve, 150));
        }
      }

      return null;
    };

    if (providerError) {
      const isCancelled = providerError === 'access_denied';
      navigateTo(buildAuthErrorDestination({
        code: isCancelled ? 'oauth_cancelled' : 'oauth_provider_error',
        message: isCancelled
          ? 'Google sign-in was cancelled before completion.'
          : providerErrorDescription || 'Google sign-in could not be completed.',
      }));
      return;
    }

    if (!code) {
      navigateTo(buildAuthErrorDestination({
        code: 'callback_error',
        message: 'The Google sign-in callback was incomplete. Please try again.',
      }));
      return;
    }

    void (async () => {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) {
        navigateTo(buildAuthErrorDestination({
          code: 'callback_error',
          message: error?.message || 'Google sign-in could not be completed.',
        }));
        return;
      }

      const settledSession = await waitForSession();
      if (!settledSession?.user) {
        navigateTo(buildAuthErrorDestination({
          code: 'callback_error',
          message: 'Google sign-in completed, but the session was not ready. Please try again.',
        }));
        return;
      }

      navigateTo('/dashboard?desktop=1');
      })()
      .catch(() => {
        navigateTo(buildAuthErrorDestination({
          code: 'callback_error',
          message: 'We could not complete sign-in after returning from Google. Please try again.',
        }));
      });
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center shadow-card-lg">
        <Loader2 size={28} className="animate-spin text-accent" />
        <div className="space-y-1">
          <h1 className="text-lg font-700 text-foreground">
            {t('authScreen.oauthCallbackErrorTitle', { ns: 'public', defaultValue: 'Completing sign-in' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('authScreen.oauthCallbackErrorMessage', {
              ns: 'public',
              defaultValue: 'We are finalizing your Smart Pocket sign-in.',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
