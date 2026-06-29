'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal';

type ConfirmationModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
  confirmTone?: 'default' | 'warning' | 'danger';
  children?: React.ReactNode;
};

function getConfirmButtonClassName(confirmTone: ConfirmationModalProps['confirmTone']) {
  switch (confirmTone) {
    case 'warning':
      return 'bg-warning text-white hover:bg-warning/90';
    case 'danger':
      return 'bg-negative text-white hover:bg-negative/90';
    default:
      return 'btn-primary';
  }
}

export default function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  pending = false,
  confirmTone = 'default',
  children,
}: ConfirmationModalProps) {
  const { t } = useTranslation(['common', 'portal']);

  if (!open) {
    return null;
  }

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!pending) {
          onClose();
        }
      }}
      title={title}
      description={description}
      size="sm"
      footerClassName="px-4 py-4 sm:px-6"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn-secondary min-h-11 w-full sm:w-auto"
            onClick={onClose}
            disabled={pending}
          >
            {cancelLabel || t('actions.cancel', { ns: 'common' })}
          </button>
          <button
            type="button"
            className={`${getConfirmButtonClassName(confirmTone)} min-h-11 w-full justify-center sm:w-auto`}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {confirmLabel || t('actions.confirm', { ns: 'common', defaultValue: 'Confirm' })}
              </>
            ) : (
              confirmLabel || t('actions.confirm', { ns: 'common', defaultValue: 'Confirm' })
            )}
          </button>
        </div>
      )}
    >
      {children}
    </Modal>
  );
}
