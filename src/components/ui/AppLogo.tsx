'use client';

import React, { memo, useMemo } from 'react';
import AppIcon from './AppIcon';
import AppImage from './AppImage';
import { getSettingsAssetUrl } from '@/lib/platform-settings';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

interface AppLogoProps {
  src?: string; // Image source (optional)
  iconName?: string; // Icon name when no image
  size?: number; // Size for icon/image
  width?: number;
  height?: number;
  alt?: string;
  className?: string; // Additional classes
  imageClassName?: string;
  onClick?: () => void; // Click handler
}

const AppLogo = memo(function AppLogo({
  src,
  iconName = 'SparklesIcon',
  size = 64,
  width,
  height,
  alt,
  className = '',
  imageClassName = '',
  onClick,
}: AppLogoProps) {
  const { branding, updatedAt } = usePlatformSettings();
  const resolvedSrc = src ?? getSettingsAssetUrl(branding.logoUrl, updatedAt);
  const resolvedAlt = alt || `${branding.appName} logo`;
  const logoWidth = width ?? size;
  const logoHeight = height ?? size;

  // Memoize className calculation
  const containerClassName = useMemo(() => {
    const classes = ['flex items-center'];
    if (onClick) classes.push('cursor-pointer hover:opacity-80 transition-opacity');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [onClick, className]);

  return (
    <div className={containerClassName} onClick={onClick}>
      {/* Show image if src provided, otherwise show icon */}
      {resolvedSrc ? (
        <AppImage
          src={resolvedSrc}
          alt={resolvedAlt}
          width={logoWidth}
          height={logoHeight}
          className={`flex-shrink-0 object-contain ${imageClassName}`.trim()}
          priority={true}
          unoptimized={/\.svg(?:\?|$)/i.test(resolvedSrc)}
        />
      ) : (
        <AppIcon name={iconName} size={Math.min(logoWidth, logoHeight)} className="flex-shrink-0" />
      )}
    </div>
  );
});

export default AppLogo;
