'use client';

import React from 'react';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

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
    <ConfirmationModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      pending={pending}
    />
  );
}
