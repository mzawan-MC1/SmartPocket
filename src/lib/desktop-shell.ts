export const TAURI_DESKTOP_USER_AGENT_MARKER = 'SmartPocketDesktop';
export const TAURI_STORE_USER_AGENT_MARKER = 'SmartPocketStore';
export const DESKTOP_MODE_COOKIE_NAME = 'sp-desktop-mode';
export const DESKTOP_ENTRY_PATH = '/sign-up-login?desktop=1';
export const DESKTOP_CALLBACK_PATH = '/auth/desktop-callback';
export const DESKTOP_OAUTH_LAUNCH_PATH = '/desktop/oauth-launch';
export const DESKTOP_CHECK_UPDATES_PATH = '/desktop/check-updates';

export function hasDirectDesktopShellUserAgent(userAgent: string | null | undefined) {
  return typeof userAgent === 'string' && userAgent.includes(TAURI_DESKTOP_USER_AGENT_MARKER);
}

export function hasStoreDesktopShellUserAgent(userAgent: string | null | undefined) {
  return typeof userAgent === 'string' && userAgent.includes(TAURI_STORE_USER_AGENT_MARKER);
}

export function hasDesktopShellUserAgent(userAgent: string | null | undefined) {
  return hasDirectDesktopShellUserAgent(userAgent) || hasStoreDesktopShellUserAgent(userAgent);
}

export function isDesktopShellModeEnabled(args: {
  userAgent: string | null | undefined;
  desktopQuery: string | null | undefined;
  desktopCookie: string | null | undefined;
}) {
  return hasDesktopShellUserAgent(args.userAgent)
    && (args.desktopQuery === '1' || args.desktopCookie === '1');
}

export function buildDesktopEntryPath(next?: string | null) {
  const searchParams = new URLSearchParams();
  searchParams.set('desktop', '1');
  if (next) {
    searchParams.set('next', next);
  }
  return `/sign-up-login?${searchParams.toString()}`;
}
