'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';

type SupportConfirmationModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
};

export default function SupportConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  pending = false,
}: SupportConfirmationModalProps) {
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
    >
      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          disabled={pending}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="btn-primary"
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
    </Modal>
  );
}
