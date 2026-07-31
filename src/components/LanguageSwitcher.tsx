'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { type SupportedLanguage } from '@/i18n/resources';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  const current = supportedLanguages.find((l) => l.code === language);
  const isDark = theme === 'dark';
  const isLight = theme === 'light';

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuPosition(null);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu]);

  const updateMenuPosition = useCallback(() => {
    if (!open || typeof window === 'undefined') return;

    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const viewportPadding = 8;
    const sideOffset = 8;
    const minWidth = variant === 'full' ? Math.max(rect.width, 188) : 176;
    const width = Math.min(Math.max(rect.width, minWidth), viewportWidth - viewportPadding * 2);
    const estimatedHeight = Math.min(240, 44 + supportedLanguages.length * 40);
    const spaceBelow = viewportOffsetTop + viewportHeight - rect.bottom;
    const spaceAbove = rect.top - viewportOffsetTop;
    const placement: 'top' | 'bottom' =
      spaceBelow < estimatedHeight + sideOffset && spaceAbove > spaceBelow
        ? 'top'
        : 'bottom';
    const unclampedTop = placement === 'top'
      ? rect.top - estimatedHeight - sideOffset
      : rect.bottom + sideOffset;
    const top = Math.min(
      Math.max(unclampedTop, viewportOffsetTop + viewportPadding),
      viewportOffsetTop + viewportHeight - estimatedHeight - viewportPadding
    );
    const unclampedLeft = dir === 'rtl' ? rect.right - width : rect.left;
    const left = Math.min(
      Math.max(unclampedLeft, viewportOffsetLeft + viewportPadding),
      viewportOffsetLeft + viewportWidth - width - viewportPadding
    );

    setMenuPosition({ top, left, width, placement });
  }, [dir, open, supportedLanguages.length, variant]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return undefined;
    }

    const pointerDownEvent = getPreferredPointerDownEventName();
    const handlePointerDown = (event: Event) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target) || ref.current?.contains(target)) {
        return;
      }
      closeMenu();
    };

    const update = () => updateMenuPosition();
    const frameId = window.requestAnimationFrame(update);

    document.addEventListener(pointerDownEvent, handlePointerDown);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener(pointerDownEvent, handlePointerDown);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [closeMenu, open, updateMenuPosition]);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    closeMenu();
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
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

      {open && menuPosition
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[69]" onClick={closeMenu} />
              <div
                ref={menuRef}
                className={`fixed z-[70] overflow-hidden rounded-2xl border p-1 ${
                  isDark
                    ? 'border-white/10 bg-[#071a34] text-slate-100 shadow-[0_18px_42px_-28px_rgba(2,12,27,0.9)]'
                    : isLight
                      ? 'border-slate-200 bg-white text-slate-700 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.28)]'
                      : 'border-slate-200/80 bg-white text-slate-700 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.24)]'
                }`}
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: menuPosition.width,
                  transformOrigin: menuPosition.placement === 'top' ? 'bottom' : 'top',
                }}
                role="menu"
              >
                {supportedLanguages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
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
            </>,
            document.body
          )
        : null}
    </div>
  );
}
