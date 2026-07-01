'use client';

import React, { useMemo, useState } from 'react';
import { User as UserIcon } from 'lucide-react';

interface UserAvatarProps {
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  alt?: string;
  className?: string;
  textClassName?: string;
  iconClassName?: string;
}

function buildInitials(fullName?: string | null, email?: string | null) {
  const trimmedName = fullName?.trim() || '';
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) || '').toUpperCase();
  }

  const emailPrefix = email?.split('@')[0]?.trim() || '';
  if (emailPrefix) {
    return emailPrefix.slice(0, 2).toUpperCase();
  }

  return '';
}

export default function UserAvatar({
  fullName,
  email,
  avatarUrl,
  alt,
  className = '',
  textClassName = '',
  iconClassName = '',
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const initials = useMemo(() => buildInitials(fullName, email), [email, fullName]);
  const accessibleName = alt || fullName?.trim() || email?.trim() || 'User';
  const shouldRenderImage = Boolean(avatarUrl && !imageFailed);

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-500 via-teal-500 to-sky-500 text-white ${className}`.trim()}
      aria-label={accessibleName}
    >
      {shouldRenderImage ? (
        <img
          src={avatarUrl!}
          alt={accessibleName}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : initials ? (
        <span className={`font-700 uppercase ${textClassName}`.trim()}>{initials}</span>
      ) : (
        <UserIcon className={iconClassName || 'h-1/2 w-1/2'} aria-hidden="true" />
      )}
    </div>
  );
}
