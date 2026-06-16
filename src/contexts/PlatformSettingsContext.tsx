'use client';

import { createContext, useContext } from 'react';
import {
  DEFAULT_PLATFORM_SETTINGS,
  type PlatformSettingsSnapshot,
} from '@/lib/platform-settings';

const PlatformSettingsContext = createContext<PlatformSettingsSnapshot>(DEFAULT_PLATFORM_SETTINGS);

export function PlatformSettingsProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: PlatformSettingsSnapshot;
}) {
  return (
    <PlatformSettingsContext.Provider value={value}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}

export function usePlatformSettings() {
  return useContext(PlatformSettingsContext);
}
