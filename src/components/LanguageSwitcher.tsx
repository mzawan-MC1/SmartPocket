'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SupportedLanguage } from '@/i18n/config';
import { Globe, Check, ChevronDown } from 'lucide-react';

interface LanguageSwitcherProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export default function LanguageSwitcher({ variant = 'compact', className = '' }: LanguageSwitcherProps) {
  const { language, setLanguage, supportedLanguages } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = supportedLanguages.find((l) => l.code === language);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 btn-ghost px-2.5 py-1.5 rounded-lg text-sm font-500 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Select language"
        aria-expanded={open}
      >
        <Globe size={15} className="flex-shrink-0" />
        {variant === 'full' ? (
          <>
            <span>{current?.nativeName}</span>
            <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
          </>
        ) : (
          <span className="uppercase text-xs font-700 tracking-wide">{language}</span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 bg-card border border-border rounded-xl shadow-card-md z-50 min-w-[160px] py-1 overflow-hidden"
          style={{ [language === 'ar' ? 'right' : 'left']: 0 }}
        >
          {supportedLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code as SupportedLanguage)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted ${
                lang.code === language ? 'text-accent font-600' : 'text-foreground font-400'
              }`}
            >
              <span className="flex-1 text-start">{lang.nativeName}</span>
              {lang.code === language && <Check size={14} className="text-accent flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
