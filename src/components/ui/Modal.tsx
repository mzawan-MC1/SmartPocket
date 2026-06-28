'use client';
import React, { useEffect } from 'react';
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
}: ModalProps) {
  const { t } = useTranslation('common');
  const isVisible = open || isOpen || false;
  const mobileContentClassName = mobileLayout === 'fullscreen'
    ? 'max-[480px]:max-h-[calc(100dvh-1rem)] max-[480px]:rounded-[24px]'
    : 'max-[480px]:max-h-[calc(100dvh-1rem)] max-[480px]:rounded-[22px]';

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-2 py-2 sm:items-center sm:p-5">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative box-border flex w-full max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-card-lg scale-in sm:max-h-[calc(100dvh-2rem)] sm:rounded-[24px] ${sizeClasses[size]} ${mobileContentClassName} ${contentClassName}`}
      >
        <div className={`flex flex-shrink-0 items-start justify-between border-b border-border bg-card p-6 max-[480px]:p-4 ${headerClassName}`}>
          <div>
            <h2 className="text-lg font-800 text-foreground">{title}</h2>
            {description && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="btn-ghost -mr-2 -mt-2 h-11 w-11 rounded-xl p-0"
            aria-label={t('actions.close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-6 scrollbar-thin max-[480px]:p-4 ${bodyClassName}`}>
          {children}
        </div>
        {footer ? (
          <div className={`safe-area-bottom shrink-0 border-t border-border bg-card ${footerClassName}`}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
