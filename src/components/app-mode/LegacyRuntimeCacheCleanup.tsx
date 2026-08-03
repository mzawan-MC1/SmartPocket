'use client';

import { useEffect } from 'react';
import { runLegacyRuntimeCleanup } from '@/lib/runtime-cache';

export default function LegacyRuntimeCacheCleanup() {
  useEffect(() => {
    void runLegacyRuntimeCleanup().catch(() => {
      // Ignore cleanup failures and leave the normal page path intact.
    });
  }, []);

  return null;
}
