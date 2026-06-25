import React from 'react';

interface AedDirhamSymbolAssetProps {
  className?: string;
  style?: React.CSSProperties;
}

export default function AedDirhamSymbolAsset({
  className = '',
  style,
}: AedDirhamSymbolAssetProps) {
  return (
    <svg
      viewBox="6 4 32 24"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="currentColor">
        <rect x="6" y="4" width="4" height="24" rx="2" />
        <path d="M10 4 C28 4 38 10 38 16 C38 22 28 28 10 28 L10 24 C24 24 34 20 34 16 C34 12 24 8 10 8 Z" />
        <rect x="14" y="13" width="20" height="2.5" rx="1.25" />
        <rect x="14" y="16.5" width="20" height="2.5" rx="1.25" />
      </g>
    </svg>
  );
}
