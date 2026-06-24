'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { type SupportedLanguage } from '@/i18n/resources';
import { Globe, Check, ChevronDown } from 'lucide-react';

interface LanguageSwitcherProps {
  variant?: 'compact' | 'full';
  className?: string;
  theme?: 'default' | 'dark' | 'light';
}

export default function LanguageSwitcher({
  variant = 'compact',
  className = '',
  theme = 'default',
}: LanguageSwitcherProps) {
  const { t } = useTranslation('common');
  const { language, setLanguage, supportedLanguages, dir } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = supportedLanguages.find((l) => l.code === language);
  const isDark = theme === 'dark';
  const isLight = theme === 'light';

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
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-500 transition-colors ${
          isDark
            ? 'border border-white/12 bg-white/6 text-slate-100 hover:bg-white/10 hover:text-white'
            : isLight
              ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
              : 'btn-ghost text-muted-foreground hover:text-foreground'
        }`}
        aria-label={t('language.select')}
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
          className={`absolute top-full mt-1 z-50 min-w-[160px] overflow-hidden rounded-xl py-1 ${
            isDark
              ? 'border border-white/10 bg-[#071a34] text-slate-100 shadow-xl'
              : isLight
                ? 'border border-slate-200 bg-white text-slate-700 shadow-xl'
                : 'border border-border bg-card shadow-card-md'
          }`}
          style={{ [dir === 'rtl' ? 'right' : 'left']: 0 }}
        >
          {supportedLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code as SupportedLanguage)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                isDark
                  ? `hover:bg-white/10 ${
                      lang.code === language ? 'font-600 text-cyan-300' : 'font-400 text-slate-200'
                    }`
                  : isLight
                    ? `hover:bg-slate-100 ${
                        lang.code === language ? 'font-600 text-cyan-700' : 'font-400 text-slate-700'
                      }`
                  : `hover:bg-muted ${
                      lang.code === language ? 'font-600 text-accent' : 'font-400 text-foreground'
                    }`
              }`}
            >
              <span className="flex-1 text-start">{lang.nativeName}</span>
              {lang.code === language && (
                <Check
                  size={14}
                  className={`${
                    isDark ? 'text-cyan-300' : isLight ? 'text-cyan-700' : 'text-accent'
                  } flex-shrink-0`}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
