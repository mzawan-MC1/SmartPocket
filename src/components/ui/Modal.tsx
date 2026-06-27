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
    ? 'max-[480px]:h-[100dvh] max-[480px]:max-h-[100dvh] max-[480px]:rounded-none max-[480px]:border-0'
    : 'max-[480px]:max-h-[88vh] max-[480px]:rounded-t-[22px]';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-5">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden border border-border bg-card shadow-card-lg scale-in rounded-t-[24px] sm:rounded-[24px] ${sizeClasses[size]} ${mobileContentClassName} ${contentClassName}`}
      >
        <div className={`flex flex-shrink-0 items-start justify-between border-b border-border bg-card p-6 max-[480px]:p-4 ${headerClassName}`}>
          <div>
            <h2 className="text-lg font-800 text-foreground">{title}</h2>
            {description && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 -mr-1 -mt-1 rounded-lg"
            aria-label={t('actions.close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className={`safe-area-bottom min-h-0 flex-1 overflow-y-auto p-6 scrollbar-thin max-[480px]:p-4 ${bodyClassName}`}>
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
