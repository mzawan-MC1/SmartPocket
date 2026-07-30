'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { type SupportedLanguage } from '@/i18n/resources';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { getPreferredPointerDownEventName } from '@/lib/browser-compat';

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const pointerDownEvent = getPreferredPointerDownEventName();
    document.addEventListener(pointerDownEvent, handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener(pointerDownEvent, handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm font-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 ${
          isDark
            ? 'border border-white/12 bg-white/6 text-slate-100 hover:bg-white/10 hover:text-white'
            : isLight
              ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
              : 'border-border/80 bg-secondary/55 text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground'
        }`}
        aria-label={t('language.select')}
        aria-expanded={open}
        aria-haspopup="menu"
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
          className={`absolute top-full z-[70] mt-2 min-w-[176px] overflow-hidden rounded-2xl border p-1 ${
            isDark
              ? 'border-white/10 bg-[#071a34] text-slate-100 shadow-[0_18px_42px_-28px_rgba(2,12,27,0.9)]'
              : isLight
                ? 'border-slate-200 bg-white text-slate-700 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.28)]'
                : 'border-slate-200/80 bg-white text-slate-700 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.24)]'
          }`}
          style={{ [dir === 'rtl' ? 'right' : 'left']: 0 }}
          role="menu"
        >
          {supportedLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code as SupportedLanguage)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 ${
                isDark
                  ? `hover:bg-white/10 active:bg-white/12 ${
                      lang.code === language ? 'bg-cyan-400/12 font-700 text-cyan-200' : 'font-500 text-slate-200'
                    }`
                  : isLight
                    ? `hover:bg-slate-100 active:bg-slate-100 ${
                        lang.code === language ? 'bg-cyan-50/80 font-700 text-cyan-800' : 'font-500 text-slate-700'
                      }`
                  : `hover:bg-slate-100 active:bg-slate-100 ${
                      lang.code === language ? 'bg-cyan-50/80 font-700 text-cyan-800' : 'font-500 text-foreground'
                    }`
              }`}
              role="menuitemradio"
              aria-checked={lang.code === language}
            >
              <span className="flex-1 text-start">{lang.nativeName}</span>
              {lang.code === language && (
                <Check
                  size={14}
                  className={`${
                    isDark ? 'text-cyan-200' : isLight ? 'text-cyan-700' : 'text-cyan-600'
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
