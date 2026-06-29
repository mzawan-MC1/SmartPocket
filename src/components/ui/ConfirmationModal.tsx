'use client';

import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useLanguage } from '@/contexts/LanguageContext';

type ConfirmationModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
  tone?: 'warning' | 'danger';
};

export default function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  pending = false,
  tone = 'warning',
}: ConfirmationModalProps) {
  const { isRTL } = useLanguage();
  const confirmClassName = tone === 'danger'
    ? 'btn-primary bg-negative hover:bg-negative/90'
    : 'btn-primary bg-warning hover:bg-warning/90';
  const iconClassName = tone === 'danger'
    ? 'bg-negative-soft text-negative'
    : 'bg-warning-soft text-warning';

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (!pending) {
          onClose();
        }
      }}
      title={title}
      description={description}
      size="md"
      closeOnBackdrop={!pending}
      closeOnEscape={!pending}
      stickyFooter
      footer={
        <div className={`flex gap-3 p-4 max-[480px]:flex-col-reverse max-[480px]:p-4 ${isRTL ? 'sm:flex-row-reverse' : 'sm:justify-end'}`}>
          <button
            type="button"
            className="btn-secondary max-[480px]:w-full"
            onClick={onClose}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${confirmClassName} max-[480px]:w-full`}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}>
          <AlertTriangle size={18} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-700 text-foreground">{title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </Modal>
  );
}
