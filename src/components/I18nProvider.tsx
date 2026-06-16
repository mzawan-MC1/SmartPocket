'use client';

import React, { useEffect } from 'react';
import '@/i18n/config';

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  // i18n is initialized by importing config
  return <>{children}</>;
}
