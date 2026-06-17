'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const SHOW_OFFSET = 280;

export default function PublicBackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > SHOW_OFFSET);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-5 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/95 text-primary shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:bottom-6 sm:right-6"
    >
      <ArrowUp size={18} />
    </button>
  );
}
