export function subscribeToMediaQueryChange(
  mediaQuery: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void
) {
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
  }

  if (typeof mediaQuery.addListener === 'function') {
    const legacyListener = listener as unknown as (this: MediaQueryList, ev: MediaQueryListEvent) => void;
    mediaQuery.addListener(legacyListener);
    return () => {
      mediaQuery.removeListener(legacyListener);
    };
  }

  return () => {};
}

export function getPreferredPointerDownEventName() {
  if (typeof window !== 'undefined' && 'PointerEvent' in window) {
    return 'pointerdown' as const;
  }

  return 'mousedown' as const;
}
