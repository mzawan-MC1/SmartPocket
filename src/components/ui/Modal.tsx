'use client';
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
};

export default function Modal({ open, isOpen, onClose, title, description, children, size = 'md' }: ModalProps) {
  const isVisible = open || isOpen || false;

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${sizeClasses[size]} bg-card rounded-t-[24px] sm:rounded-[24px] shadow-card-lg border border-border scale-in max-h-[92vh] flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between p-6 border-b border-border flex-shrink-0 bg-card">
          <div>
            <h2 className="text-lg font-800 text-foreground">{title}</h2>
            {description && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 -mr-1 -mt-1 rounded-lg" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
