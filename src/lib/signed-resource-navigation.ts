'use client';

export function openSignedResourceUrl(
  url: string,
  options?: {
    download?: boolean;
    fileName?: string | null;
    preferSameTab?: boolean;
  }
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = normalizedUrl;
  anchor.rel = 'noreferrer noopener';
  anchor.target = options?.preferSameTab === false ? '_blank' : '_self';

  if (options?.download && options.fileName) {
    anchor.download = options.fileName;
  }

  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
