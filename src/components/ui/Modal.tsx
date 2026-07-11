'use client';
import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  mobileLayout?: 'sheet' | 'fullscreen';
  contentClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  stickyFooter?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
};

export default function Modal({
  open,
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  mobileLayout = 'sheet',
  contentClassName = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
  stickyFooter = false,
}: ModalProps) {
  const { t } = useTranslation('common');
  const isVisible = open || isOpen || false;
  const headingId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const mobileContentClassName = mobileLayout === 'fullscreen'
    ? 'max-[480px]:max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-0.5rem)] max-[480px]:rounded-[24px]'
    : 'max-[480px]:max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-0.5rem)] max-[480px]:rounded-[20px]';
  const mobileShellClassName = mobileLayout === 'sheet'
    ? 'px-2 pb-[calc(env(safe-area-inset-bottom)+0.2rem)] pt-[calc(env(safe-area-inset-top)+0.2rem)]'
    : 'px-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-[calc(env(safe-area-inset-top)+0.35rem)]';

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const id = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(id);
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, isVisible, onClose]);

  const handleBackdropClick = () => {
    if (closeOnBackdrop) {
      onClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-end justify-center ${mobileShellClassName} sm:items-center sm:p-5`}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm fade-in" onClick={handleBackdropClick} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative box-border flex w-full max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-0.75rem)] flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-card-lg scale-in sm:rounded-[24px] ${sizeClasses[size]} ${mobileContentClassName} ${contentClassName}`}
      >
        <div className={`flex flex-shrink-0 items-start justify-between border-b border-border bg-card p-5 max-[480px]:p-3 ${headerClassName}`}>
          <div>
            <h2 id={headingId} className="text-[1.02rem] font-800 leading-snug text-foreground sm:text-lg">{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost -mr-1 -mt-1 rounded-lg p-[5px]"
            aria-label={t('actions.close')}
          >
            <X size={17} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-5 scrollbar-thin max-[480px]:p-3 ${bodyClassName}`}>
          {children}
        </div>
        {footer ? (
          <div className={`safe-area-bottom shrink-0 border-t border-border bg-card ${stickyFooter ? 'sticky bottom-0' : ''} ${footerClassName}`}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
