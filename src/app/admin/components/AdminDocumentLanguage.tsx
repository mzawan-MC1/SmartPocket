'use client';

import { useEffect } from 'react';
import i18n from '@/i18n/config';

export default function AdminDocumentLanguage() {
  useEffect(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    if (i18n.language !== 'en') {
      void i18n.changeLanguage('en');
    }
  }, []);

  return null;
}
