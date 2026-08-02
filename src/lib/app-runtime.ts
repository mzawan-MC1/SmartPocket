import { isTauri } from '@tauri-apps/api/core';
import { TAURI_DESKTOP_USER_AGENT_MARKER } from '@/lib/desktop-shell';

export type AppRuntime = 'web' | 'native-shell';

type MaybeCapacitorGlobal = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  platform?: string;
};

function getCapacitorGlobal(): MaybeCapacitorGlobal | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidate = (window as typeof window & { Capacitor?: MaybeCapacitorGlobal }).Capacitor;
  return candidate && typeof candidate === 'object' ? candidate : null;
}

function hasTauriDesktopUserAgent() {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = window.navigator?.userAgent;
  return typeof userAgent === 'string' && userAgent.includes(TAURI_DESKTOP_USER_AGENT_MARKER);
}

function hasTauriRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return isTauri();
  } catch {
    return false;
  }
}

export function getAppRuntime(): AppRuntime {
  const capacitor = getCapacitorGlobal();
  if (capacitor) {
    try {
      if (typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
        return 'native-shell';
      }

      const platform = typeof capacitor.getPlatform === 'function'
        ? capacitor.getPlatform()
        : typeof capacitor.platform === 'string'
          ? capacitor.platform
          : null;

      if (platform && platform !== 'web') {
        return 'native-shell';
      }
    } catch {
      // Fall back to other runtime markers below.
    }
  }

  return hasTauriRuntime() || hasTauriDesktopUserAgent() ? 'native-shell' : 'web';
}

export function isNativeShellRuntime() {
  return getAppRuntime() === 'native-shell';
}

export function isTauriNativeShellRuntime() {
  return hasTauriRuntime() || hasTauriDesktopUserAgent();
}
