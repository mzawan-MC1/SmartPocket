'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>
        <h1 className="text-2xl font-700 text-foreground mb-2">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Smart Pocket requires an internet connection to sync your financial data. Please check your connection and try again.
        </p>
        <button
          onClick={() => window.location?.reload()}
          className="btn-primary mx-auto"
        >
          Try Again
        </button>
        <p className="text-xs text-muted-foreground mt-4">
          Your data is safe and will sync when you reconnect.
        </p>
      </div>
    </div>
  );
}
