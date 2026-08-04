'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

type OAuthProviderButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  icon: React.ReactNode;
};

export default function OAuthProviderButton({
  label,
  onClick,
  disabled = false,
  isLoading = false,
  icon,
}: OAuthProviderButtonProps) {
  return (
    <button
      type="button"
      className="btn-secondary w-full justify-center py-2.5"
      onClick={onClick}
      disabled={disabled}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      {label}
    </button>
  );
}
