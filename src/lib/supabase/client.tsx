import { createBrowserClient } from '@supabase/ssr';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

// #region debug-point home-first-visit-blank:supabase-client-report
function reportHomeFirstVisitBlankEvent(payload: Record<string, unknown>) {
  try {
    if (process.env.NEXT_PUBLIC_SP_DEBUG !== '1') return;
    if (typeof window === 'undefined') return;

    const url =
      process.env.NEXT_PUBLIC_SP_DEBUG_URL
      || `http://${window.location.hostname}:7777/event`;
    if (!url) return;

    const body = JSON.stringify({
      sessionId: 'home-first-visit-blank',
      ts: Date.now(),
      source: 'supabase-client',
      ...payload,
    });

    if ('sendBeacon' in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }

    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {}
}
// #endregion debug-point home-first-visit-blank:supabase-client-report

function createSafeBrowserAuthStorage() {
  const memory = new Map<string, string>();

  return {
    getItem: (key: string) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem: (key: string, value: string) => {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        reportHomeFirstVisitBlankEvent({
          point: 'authStorage.setItem.fallback',
          key,
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        memory.set(key, value);
      }
    },
    removeItem: (key: string) => {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        reportHomeFirstVisitBlankEvent({
          point: 'authStorage.removeItem.fallback',
          key,
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        memory.delete(key);
      }
    },
  };
}

/**
 * Returns a stable singleton browser Supabase client.
 * Creating a new client on every call causes multiple GoTrueClient instances
 * which can race against each other when reading/writing auth cookies.
 */
export function createClient() {
  if (!browserClient) {
    try {
      browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        , {
          auth: {
            storage: createSafeBrowserAuthStorage(),
          },
        }
      );
    } catch (error) {
      reportHomeFirstVisitBlankEvent({
        point: 'createBrowserClient',
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }
  }
  return browserClient;
}
