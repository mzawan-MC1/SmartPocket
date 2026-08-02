'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildDesktopAuthCallbackDeepLink } from '@/lib/auth/urls';

function launchDesktopDeepLink(url: string) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = url;
  document.body.appendChild(iframe);

  window.setTimeout(() => {
    iframe.remove();
  }, 1500);
}

export default function DesktopBrowserCompletePage() {
  const { t } = useTranslation(['auth', 'public']);
  const searchParams = useSearchParams();
  const launchAttemptedRef = useRef(false);
  const callbackSearchParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  );
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  useEffect(() => {
    if (launchAttemptedRef.current) {
      return;
    }
    launchAttemptedRef.current = true;

    try {
      const nextDeepLink = buildDesktopAuthCallbackDeepLink(callbackSearchParams);
      setDeepLinkUrl(nextDeepLink);

      const cleanUrl = new URL('/auth/desktop-browser-complete', window.location.origin);
      window.history.replaceState({}, document.title, cleanUrl.toString());

      launchDesktopDeepLink(nextDeepLink);
      window.setTimeout(() => {
        window.close();
      }, 1200);
    } catch (error) {
      const cleanUrl = new URL('/auth/desktop-browser-complete', window.location.origin);
      window.history.replaceState({}, document.title, cleanUrl.toString());
      setHandoffError(
        error instanceof Error
          ? error.message
          : 'Smart Pocket could not validate the browser sign-in response.'
      );
    }
  }, [callbackSearchParams]);

  const handleReturnToApp = () => {
    if (!deepLinkUrl) {
      return;
    }

    launchDesktopDeepLink(deepLinkUrl);
    window.setTimeout(() => {
      window.close();
    }, 1200);
  };

  return (
    <div className="page-shell py-6 sm:py-10">
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-[28px] border border-border bg-card px-6 py-10 text-center shadow-card-lg sm:px-10">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-positive-soft text-positive">
          {handoffError ? <Loader2 size={30} className="animate-spin" /> : <CheckCircle2 size={30} />}
        </div>
        <h1 className="text-2xl font-700 tracking-tight text-foreground">
          {handoffError
            ? t('authScreen.oauthCallbackErrorTitle', { ns: 'public', defaultValue: 'Completing sign-in' })
            : t('desktopBrowserComplete.title', {
              ns: 'auth',
              defaultValue: 'Sign-in complete',
            })}
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
          {handoffError
            ? handoffError
            : t('desktopBrowserComplete.message', {
              ns: 'auth',
              defaultValue: 'Smart Pocket is now open. You may close this browser tab.',
            })}
        </p>
        <button
          type="button"
          className="btn-primary mt-6"
          onClick={handleReturnToApp}
          disabled={!deepLinkUrl}
        >
          {t('desktopBrowserComplete.returnButton', {
            ns: 'auth',
            defaultValue: 'Return to Smart Pocket',
          })}
        </button>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('desktopBrowserComplete.closeHint', {
            ns: 'auth',
            defaultValue: 'If this tab does not close automatically, you can close it yourself after returning to the app.',
          })}
        </p>
      </div>
    </div>
  );
}
