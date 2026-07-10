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

export function getAppRuntime(): AppRuntime {
  const capacitor = getCapacitorGlobal();
  if (!capacitor) {
    return 'web';
  }

  try {
    if (typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
      return 'native-shell';
    }

    const platform = typeof capacitor.getPlatform === 'function'
      ? capacitor.getPlatform()
      : typeof capacitor.platform === 'string'
        ? capacitor.platform
        : null;

    return platform && platform !== 'web' ? 'native-shell' : 'web';
  } catch {
    return 'web';
  }
}

export function isNativeShellRuntime() {
  return getAppRuntime() === 'native-shell';
}
