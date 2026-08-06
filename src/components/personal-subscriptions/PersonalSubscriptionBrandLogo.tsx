'use client';

import React from 'react';
import {
  CreditCard,
  Dumbbell,
  Smartphone,
  Wifi,
  Shield,
  FileText,
  FolderKanban,
} from 'lucide-react';
import {
  PERSONAL_SUBSCRIPTION_PROVIDERS,
  getPersonalSubscriptionProviderByKey,
  type PersonalSubscriptionProvider,
} from '@/lib/personal-subscription-providers';

type BrandSvgRenderer = (fg: string) => React.ReactNode;

const BRAND_SVG: Record<string, BrandSvgRenderer> = {
  chatgpt: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M22.28 9.82a5.99 5.99 0 0 0-.51-4.92 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9 5.99 5.99 0 0 0 6.01 4.21 6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.74-7.07Zm-12.98 12.34a4.47 4.47 0 0 1-2.87-4.83l.15-.58L5.1 17.79a4.45 4.45 0 0 1-2.09-3.66 4.48 4.48 0 0 1 1.19-3.37l.19-.22L4.85 9.96l.25.57a4.48 4.48 0 0 1 2.59 2.58l1.13.5-.42 1.1a2.64 2.64 0 0 0-1.4 1.56l-.14.52.31.2a2.64 2.64 0 0 0 1.25.45h.08a2.64 2.64 0 0 0 1.59-.58l2.1-1.25.07.15.01.04a4.45 4.45 0 0 1-2.86 4.89Zm-1.9-12.22-.6.9-.17-.69a4.47 4.47 0 0 1 2.87-4.83 4.48 4.48 0 0 1 3.84.66l.17.13.16.13-.13.57a4.47 4.47 0 0 1-.92 2.25 4.47 4.47 0 0 1-2.59 2.58L8.62 9.82l.41-1.09a2.64 2.64 0 0 0 1.42-1.59l.13-.54-.32-.21a2.64 2.64 0 0 0-1.28-.43h-.07a2.64 2.64 0 0 0-1.59.57L5.22 8.84l-.07-.14a4.47 4.47 0 0 1-.88-1.29l.08-.06Zm10.64 7.41-.31-.2-.05.19a4.47 4.47 0 0 1-2.87 4.83 4.45 4.45 0 0 1-1.93.18 4.45 4.45 0 0 1-1.92-.78l-.28-.22-.16-.14-.16-.14.13-.56a4.47 4.47 0 0 1 .92-2.27 4.45 4.45 0 0 1 2.59-2.58l1.13-.51.42-1.1a2.64 2.64 0 0 0 1.4-1.57l.14-.53-.31-.2a2.64 2.64 0 0 0-1.25-.45h-.08a2.64 2.64 0 0 0-1.59.57L10.81 11.86l-.07-.15a4.46 4.46 0 0 1 2.87-4.83 4.47 4.47 0 0 1 3.83-.65 4.47 4.47 0 0 1 1.94.85c.1.07.19.15.28.22l.16.13.16.14-.12.56a4.47 4.47 0 0 1-.92 2.27 4.48 4.48 0 0 1-2.59 2.58l-1.14.5.42 1.1a2.64 2.64 0 0 0 1.41 1.57l.13.51.31.21Zm1.73-5.52-.25-.57-1.14-.51.43-1.1a2.65 2.65 0 0 0 .93-1.67l.13-.55-.31-.2a2.64 2.64 0 0 0-1.26-.44h-.08a2.64 2.64 0 0 0-1.58.57L15.21 9.86l-.07-.15a4.47 4.47 0 0 1 .88-1.34 4.47 4.47 0 0 1 2.94-1.45 4.47 4.47 0 0 1 4.94 3.61 4.48 4.48 0 0 1-.12 2.88 4.47 4.47 0 0 1-.75 1.74l-.09.12Z"
        fill={fg}
      />
    </svg>
  ),
  claude: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M19.24 16.4c-.32-.02-.63-.04-.93-.08a.16.16 0 0 1-.16-.1c-.05-.16-.12-.31-.19-.47-.23-.53-.49-.98-.73-1.46a10.15 10.15 0 0 0-1.66-2.63c.4-.64.82-1.33 1.22-2.08.17-.32.33-.67.46-1.03.01-.01.01-.03.01-.05.03-.14.04-.29.06-.45v-.01c.01-.04.01-.09.01-.15.01-.19.02-.38.02-.58 0-.74-.08-1.43-.31-2.06a2.79 2.79 0 0 0-1.04-1.33 3.44 3.44 0 0 0-2.5-.49 4.27 4.27 0 0 0-1.09-.01c-.79.06-1.5.27-2.1.62a4.14 4.14 0 0 0-1.55 1.44c-.27.38-.54.81-.87 1.21a8.55 8.55 0 0 0-1.14 1.06 3.46 3.46 0 0 0-.31.35h-.01l-.08.09-.12-.09-.28-.2-.4-.28-.46-.32c-.51-.34-.97-.56-1.44-.72a4.56 4.56 0 0 0-2.73-.19 5.77 5.77 0 0 0-1.25.11c-.73.12-1.34.35-1.8.67-.46.3-.83.69-1.11 1.16-.28.47-.45 1.01-.49 1.62-.03.51 0 1.04.09 1.61.13.85.38 1.58.75 2.19.37.61.84 1.13 1.41 1.58.15.12.3.23.46.35.32.24.66.48 1.01.72.36.24.73.47 1.11.69.2.11.4.22.6.33.1.06.2.12.3.19.2.13.42.27.63.41.05.03.1.06.15.1l.04.04c.95.73 1.9 1.47 2.83 2.22.05.04.1.08.15.13.04.04.08.06.12.1.48.4.98.86 1.49 1.36.18.17.35.35.54.54.58.62 1.2 1.27 1.85 1.91.5.5 1.02.98 1.55 1.45l.12.1c.04.04.08.07.12.12l.17.16c.4.37.81.74 1.22 1.09.4.35.81.68 1.2.98.4.3.78.56 1.13.79.35.23.67.41.95.56.27.14.5.23.67.28.34.1.61.13.81.12.22 0 .42-.02.6-.06.35-.08.65-.2.89-.36.23-.16.4-.36.51-.58s.18-.46.23-.71c.05-.25.07-.5.05-.74.04-.49 0-.95-.15-1.37ZM18.93 3.68c.13.22.23.46.29.73.07.27.09.56.07.86v.08c0 .06-.02.12-.04.18l-.06.08c-.04.1-.1.21-.15.3-.2.32-.4.63-.64.94a5.86 5.86 0 0 1-.8 1c-.3.31-.63.62-.98.93l-.43.39c-.29.25-.59.5-.9.75-.09.08-.18.16-.27.23a29 29 0 0 1-.57-.52c-.26-.25-.53-.51-.79-.78a37 37 0 0 1-2.11-2.18c-.21-.22-.42-.43-.62-.65-.31-.34-.61-.68-.91-1l.51-.16c.26-.08.5-.17.74-.27a4.1 4.1 0 0 1 .93-.37c.56-.18 1.1-.28 1.59-.3a2.43 2.43 0 0 1 1.08.08c.45.1.82.26 1.1.48.27.22.47.48.58.78l.05.18Zm-12.08 4.2-.23.38c.06.02.11.05.18.08.32.14.65.3.98.48.33.18.67.37 1.01.58.34.21.68.43 1.01.67.11.07.22.14.33.22a20 20 0 0 1 .98-.91 14.37 14.37 0 0 1 1.72-2.02l.01-.01c.06-.07.11-.15.17-.22.07-.1.14-.19.2-.29l.07-.13c.02-.05.05-.12.07-.17a43 43 0 0 0-2.71-1.44 5.73 5.73 0 0 0-.78-.27 5.87 5.87 0 0 0-1.98-.2 3.7 3.7 0 0 0-1.09.15 5.26 5.26 0 0 0-.86.31c.19.13.38.27.56.41.68.53 1.25 1.14 1.69 1.78.28.43.54.9.79 1.38l.13.28ZM3.17 11.39c-.08-.44-.12-.86-.1-1.27 0-.31.05-.62.15-.92.1-.3.24-.52.38-.75a2.36 2.36 0 0 1 .59-.57c-.06.29-.1.58-.11.87 0 .42.01.85.02 1.27.04.64.13 1.24.32 1.77.19.54.46 1.02.84 1.46.38.44.85.83 1.42 1.18v.03h.01c.12.07.23.14.35.21a25 25 0 0 0 3.76 2.39 11 11 0 0 0-2.27 2.73 7.3 7.3 0 0 0-1.61 1.73 9.83 9.83 0 0 0-1.41 2.09 6.6 6.6 0 0 0-.41 1.06c-.6-.32-1.16-.7-1.66-1.15a15.53 15.53 0 0 1-1.96-2.17c-.62-.76-1.18-1.58-1.65-2.47-.47-.9-.83-1.86-1.04-2.88a7.22 7.22 0 0 1-.14-2.2Zm16.35 7.64a2.23 2.23 0 0 1-.52.66 1.62 1.62 0 0 1-.42.25c-.16.05-.33.07-.52.07a3 3 0 0 1-.84-.1 7.54 7.54 0 0 1-1.09-.4 16.17 16.17 0 0 1-2.74-1.83 34.8 34.8 0 0 1-2.42-2.16l-.18-.17v-.01a27.76 27.76 0 0 1-2.41-2.49 8.32 8.32 0 0 1-1.32-1.75 5.97 5.97 0 0 1-.91-1.9 3.6 3.6 0 0 1-.12-.81c1.09-.01 2.12-.13 3.07-.41a8.74 8.74 0 0 0 2.62-.95 12.68 12.68 0 0 0 2.64-2.05l.01-.01a10.6 10.6 0 0 1 1.78 2.78c.22.47.47.92.7 1.44v.01a6.6 6.6 0 0 1 .7 1.8c.08.23.14.47.19.7.13.65.22 1.23.25 1.67.04.44.01.85-.09 1.21 0 .25-.1.48-.31.66Z"
        fill={fg}
      />
    </svg>
  ),
  gemini: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <defs>
        <linearGradient id="gemini-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="33%" stopColor="#9B72CB" />
          <stop offset="66%" stopColor="#D96570" />
          <stop offset="100%" stopColor="#F9AB00" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5c3.14 0 5.23 1.47 6.29 3.63 1.05 2.13.97 4.79-.24 7.18-.84 1.67-2.3 3.11-4.21 4.01l.47 1.88c.15.6-.52 1.04-.98.68a14 14 0 0 1-3.99-5.65 10.7 10.7 0 0 1-1.83 3.09c-.46.36-1.13-.08-.98-.69l.47-1.88a11.7 11.7 0 0 1-4.21-4.01C2.4 11 2.32 8.34 3.38 6.21 4.44 4 6.53 2.5 9.67 2.5H12Zm-.08 8.03c-1.05 1.46-.46 3.16 1.09 3.16s2.14-1.7 1.09-3.16a2 2 0 0 0-2.18 0Z"
        fill="url(#gemini-grad)"
      />
    </svg>
  ),
  microsoft: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path d="M2.5 2.5h9v9h-9zM13 2.5h9v9h-9zM2.5 13h9v9h-9zM13 13h9v9h-9z" fill={fg} />
    </svg>
  ),
  perplexity: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M16.94 5.9a5.51 5.51 0 0 1 0 7.8l-4.94 4.94a5.51 5.51 0 0 1-7.8-7.8l1.8-1.79-1.8-1.79a5.51 5.51 0 1 1 7.8-7.79l4.94 4.94Zm-2.33 1.41-4.94-4.94a3.51 3.51 0 1 0-4.97 4.97l1.88 1.87 1.4-1.41 1.42 1.41 1.41-1.41 1.42 1.41 1.41-1.41 1.42 1.41 1.41-1.41a3.51 3.51 0 0 0 0-4.97Zm.7 7.07-4.94 4.94a3.51 3.51 0 0 1-4.97-4.97l1.78-1.78-1.41 1.41-1.42-1.41-1.41 1.41a5.51 5.51 0 0 0 7.8 7.8l4.94-4.94a5.51 5.51 0 0 0 0-7.79l-1.8 1.79 1.8 1.8a3.51 3.51 0 0 1 0 4.96Z"
        fill={fg}
      />
    </svg>
  ),
  midjourney: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-2.6 15L7 14.6l1.8-3.1L7 8.4 9.4 8l1.8 3L13 8l2.4.4-1.8 3.1 1.8 3.1L14.6 16l-2.6-3.1L9.4 17Z"
        fill={fg}
      />
    </svg>
  ),
  grok: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M4 4h5v16H4V4Zm11 0h5v16h-5V4ZM9 9h6v2H9V9Zm0 4h6v2H9v-2Z"
        fill={fg}
      />
    </svg>
  ),
  canva: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <circle cx="12" cy="12" r="10" fill={fg} opacity=".9" />
      <path
        d="M10 4a6 6 0 1 0 6 10.4V8a2.4 2.4 0 1 1-4.8 0V4Z"
        fill="#ffffff"
      />
    </svg>
  ),
  grammarly: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm7.5 10.5a7.5 7.5 0 0 1-7.5 7.5 7.44 7.44 0 0 1-2.5-.43 1.25 1.25 0 0 1-.5-1.66l.69-1.2A1.25 1.25 0 0 1 11 16.5h1a.5.5 0 0 0 .5-.5v-.5a.5.5 0 0 0-.5-.5H9a1.25 1.25 0 0 1-1.16-1.81l2.32-4A1.25 1.25 0 0 1 11.32 8.5H13a.5.5 0 0 0 .5-.5v-.5a.5.5 0 0 0-.5-.5h-1a1.25 1.25 0 0 1-1.08-1.94l.77-1.33A1.25 1.25 0 0 1 12.78 3a7.5 7.5 0 0 1 6.72 9.5Z"
        fill={fg}
      />
    </svg>
  ),
  notion: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M4.46 4.21c.24-.36.61-.59 1.06-.59h13.25c.71 0 1.23.52 1.23 1.23v13.24c0 .71-.52 1.23-1.23 1.23H5.48A1.24 1.24 0 0 1 4.3 18.36L2.33 5.7a.3.3 0 0 1 .02-.22.3.3 0 0 1 .26-.16c.68 0 1.24-.56 1.24-1.24 0-.36-.16-.69-.41-.89ZM7.76 4.52v.25c0 .68.56 1.24 1.24 1.24h9.19c.17 0 .31.13.31.3v10.74c0 .17-.14.31-.31.31H8.96c-.75 0-1.3-.49-1.3-1.2V4.52Zm.62 2.46v9.76l-.01.16c-.01.08-.07.16-.16.16a.2.2 0 0 1-.19-.14l-.62-1.89-1.45-4.18-.21-.67c-.05-.16.1-.34.26-.34.08 0 .16.04.21.11l1.16 2.22V6.98a.2.2 0 0 1 .2-.02Zm2.32 3.09v7.08c0 .11.09.2.2.2h1.36c.98 0 1.17-.63 1.17-1.09v-1.84h.71c.96 0 1.05-.62 1.05-1.04v-.8c0-.44-.08-.81-1.05-.81h-.71V10.2c0-.32.11-.87 1.01-.87h.75c.11 0 .2-.09.2-.2V7.18a.2.2 0 0 0-.2-.2h-1.56c-.91 0-1.29.61-1.29 1.23v1.02h-.7a.2.2 0 0 0-.2.2v.71c0 .11.09.2.2.2h.7v1.22H9.7a.2.2 0 0 0-.2.2Z"
        fill={fg}
      />
    </svg>
  ),
  trae: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm4.56 14.56-8 1.44a.7.7 0 0 1-.81-.81l1.44-8a.8.8 0 0 1 1.2-.43l5.18 3.4a.6.6 0 0 1 .15.88Z"
        fill={fg}
      />
      <path
        d="M8.2 13.18h3.95a.3.3 0 0 1 .24.5l-1 1.2a.3.3 0 0 1-.24.12H8.85a.24.24 0 0 1-.19-.38l1.09-1.42Z"
        fill="#ffffff"
        opacity=".9"
      />
    </svg>
  ),
  github: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.94.36.31.68.92.68 1.85l-.01 2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
        fill={fg}
      />
    </svg>
  ),
  netflix: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M5.39 0C4.44.28 3.61.9 3 1.75v19.08a1.5 1.5 0 0 1-1.08 1.12C2.67 21.4 3.9 22 5.39 22H18C20.2 22 21 21.3 21 19.08V1.75A2.6 2.6 0 0 0 18.61 0H5.39ZM8.4 2.6 16 15.3V2.6h-2.72L8.4 10.17V2.6ZM8.4 19.54V11.46L15.6 22h2.4V11.34L8.4 19.54Z"
        fill={fg}
      />
    </svg>
  ),
  amazon_prime: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M3.5 12.5a9 9 0 0 1 17-1.96.35.35 0 0 1-.2.42c-1.84 1.02-6.3 1.98-9.45 1.98-3.72 0-6.73-1.51-7.35-1.98a.3.3 0 0 1 0-.46Zm15.96 3.12a.34.34 0 0 1 .46.1 10.97 10.97 0 0 1 1.06 2.04.34.34 0 1 1-.64.21 9.46 9.46 0 0 0-.88-1.84.34.34 0 0 1 0-.51Z"
        fill={fg}
      />
      <path
        d="M2 11.91c.12-.03.19-.07.19-.11 0-.04-.04-.07-.2-.15L-.43 10.5a1.03 1.03 0 0 1-.56-1.4c.27-.68 2.3-1.4 5.25-1.4 2.96 0 4.5.92 4.5 2.25 0 .64-.31 1.25-.86 1.67a2.8 2.8 0 0 1-1.87.66 4.3 4.3 0 0 1-2-.53l.61 2.3a.12.12 0 0 1-.04.12.12.12 0 0 1-.12 0L1.1 12.34a.2.2 0 0 1-.09-.28l.85-1.41ZM4.17 10.41l.73 2.11c.17.48.04.77-.37.93a1.9 1.9 0 0 1-1-.1 4.1 4.1 0 0 1-1.25-.92.14.14 0 0 1 .03-.2L3 11.93c.08-.04.17-.08.3-.11.58-.14.84.04.87.59Zm-1.06-3.34c-.64-.08-1.02-.56-1.02-1.08 0-.64.48-1.09 1.18-1.09.7 0 1.2.45 1.2 1.09 0 .54-.38 1-1.06 1.08Z"
        fill={fg}
        transform="translate(5 2)"
      />
    </svg>
  ),
  disney_plus: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M3.6 2C2.72 2 2 2.72 2 3.6v16.8C2 21.28 2.72 22 3.6 22h16.8c.88 0 1.6-.72 1.6-1.6V3.6C22 2.72 21.28 2 20.4 2Zm4.24 7.72L6 13.4l1.84-.03v-3.6Zm-.88 6.16-1.84.02V9.8h1.84v5.48a.8.8 0 0 1-.8.8Zm6.64-6.16L12 13.4l1.84-.03v-3.6Zm-.88 6.16-1.84.02V9.8h1.84v5.48a.8.8 0 0 1-.8.8Zm3.12-8.64h-.8v.8h1.6a.8.8 0 0 1 .8.8V12h-1.6V11.2Zm-5.6 0h-.8v.8h1.6v1.2h-1.6v.8h1.6v1.2h-1.6Z"
        fill={fg}
      />
    </svg>
  ),
  youtube: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.13C19.5 3.54 12 3.54 12 3.54s-7.5 0-9.38.52A3.02 3.02 0 0 0 .5 6.2C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.13C4.5 20.46 12 20.46 12 20.46s7.5 0 9.38-.52a3.02 3.02 0 0 0 2.12-2.13C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.54 15.57V8.43L15.82 12l-6.28 3.57Z"
        fill={fg}
      />
    </svg>
  ),
  spotify: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 0a12 12 0 1 0 12 12A12 12 0 0 0 12 0Zm5.52 17.34a.75.75 0 0 1-1.03.25c-2.82-1.72-6.36-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.49-.59 11.66 1.35.35.22.45.69.25 1.02Zm1.47-3.28a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.96-1.4a.94.94 0 1 1-.55-1.8c4.24-1.3 9.58-.65 13.29 1.62a.93.93 0 0 1 .51 1.27Zm.13-3.37C15.22 8.5 8.87 8.26 5.1 9.35a1.12 1.12 0 0 1-.66-2.15c4.28-1.23 11.24-.95 15.72 1.75a1.12 1.12 0 0 1-1.15 1.9Z"
        fill={fg}
      />
    </svg>
  ),
  apple: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M16.37 12.64c-.03-2.72 2.23-4.03 2.33-4.09-1.27-1.85-3.24-2.11-3.94-2.14-1.68-.17-3.27 1-4.12 1-.86 0-2.17-.98-3.56-.95-1.83.03-3.52 1.07-4.46 2.71-1.91 3.31-.49 8.2 1.36 10.9.9 1.33 1.97 2.83 3.37 2.78 1.35-.06 1.86-.88 3.48-.88s2.08.88 3.51.85c1.46-.02 2.37-1.35 3.26-2.68 1.05-1.56 1.48-3.07 1.5-3.14-.04-.01-2.87-1.1-2.9-4.36ZM13.9 4.75c.76-.91 1.27-2.18 1.13-3.45-1.09.04-2.42.73-3.2 1.64-.7.81-1.32 2.1-1.15 3.3 1.22.09 2.46-.58 3.22-1.49Z"
        fill={fg}
      />
    </svg>
  ),
  shahid: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M4 3h16a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm6 4.5v9l6.5-4.5L10 7.5Z"
        fill={fg}
      />
    </svg>
  ),
  osn_plus: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M3 4h18v16H3V4Zm2 4v8h2.4L9.6 12 7.4 8H5Zm5 0v8h2l3-4-3-4H10Zm5 0v8h5v-1.5h-3V14h2.5v-1.5H15v-1h3V10h-3v-.5h3V8h-5Z"
        fill={fg}
      />
    </svg>
  ),
  starzplay: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M10.5 2 12 9h7l-5.5 4 2 7L10.5 16 5 20l2.5-7L2 9h7.4l1.1-7Z"
        fill={fg}
      />
    </svg>
  ),
  audible: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm7.3 14.6-6-8.16c-.1-.14-.22-.14-.32 0L5.1 16.9a.22.22 0 0 0 .2.34h2.8a.24.24 0 0 0 .2-.1l4.15-5.65 3.87 5.65a.24.24 0 0 0 .21.1h2.62a.22.22 0 0 0 .25-.34Z"
        fill={fg}
      />
    </svg>
  ),
  google: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M21.35 11.1H12v2.9h5.35c-.23 1.5-1.77 4.4-5.35 4.4a5.45 5.45 0 1 1 0-10.9c1.7 0 2.85.72 3.5 1.34l2.38-2.3A8.8 8.8 0 0 0 12 3.1a8.9 8.9 0 1 0 0 17.8c5.15 0 8.55-3.62 8.55-8.72 0-.59-.05-1.04-.2-1.08Z"
        fill={fg}
      />
    </svg>
  ),
  onedrive: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M7.5 20a5.5 5.5 0 0 1 0-11h.18A7.5 7.5 0 0 1 22 11.5 6.5 6.5 0 0 1 17.5 20H7.5Z"
        fill={fg}
      />
    </svg>
  ),
  dropbox: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="m3 6 5-4 4 3.5L8 9.5 3 6Zm10 0 5 4-4 3.5L9 9.5l4-3.5Zm-10 8 5 4 4-3.5L8 10.5 3 14Zm10 0 5-4-4-3.5-4 3.5 4 3.5Zm0 3.5-5-4v1.4L13 22l5-3.1V13.5l-5 4Z"
        fill={fg}
      />
    </svg>
  ),
  icloud: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M7.5 18.5a6.5 6.5 0 0 1-.62-12.97A8 8 0 0 1 16.5 4a5.5 5.5 0 0 1 1.7 10.74A7.5 7.5 0 0 1 18.5 19H7.5Z"
        fill={fg}
      />
    </svg>
  ),
  adobe: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M2.5 3h19L12 21l-2.5-6H5.5l7.9-11h-2.9L7.4 10 2.5 3ZM18 15h3l-2.6 6H15L20 7l-2 8Z"
        fill={fg}
      />
    </svg>
  ),
  zoom: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M21 8.5a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-7Zm-11 1 4 2.5-4 2.5v-5Z"
        fill={fg}
      />
    </svg>
  ),
  slack: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M6.5 3A2.5 2.5 0 0 0 4 5.5v1H6.5V5.5a1 1 0 1 1 1 1H5.5A2.5 2.5 0 0 0 3 9h1v-1.5H3V9a2.5 2.5 0 0 0 2.5 2.5h1V9H5.5a1 1 0 1 1-1-1H9a2.5 2.5 0 0 0 2.5-2.5v-1H9V5.5A2.5 2.5 0 0 0 6.5 3Zm7 0A2.5 2.5 0 0 0 11 5.5V6h1.5v-.5a1 1 0 0 1 2 0 1 1 0 0 1-1 1H11a2.5 2.5 0 0 0 0 5h.5v-1H11a1 1 0 1 1 0-2h2.5A2.5 2.5 0 0 0 16 6.5v-1h-1V4A2.5 2.5 0 0 0 12.5 2 2.5 2.5 0 0 0 13.5 3ZM16 9a2.5 2.5 0 0 0 0 5h1V12.5H16a1 1 0 1 1-1-1h2.5a2.5 2.5 0 0 0 0-5H17v1h1.5a1 1 0 0 1 0 2H16a2.5 2.5 0 0 0-2.5 2.5v1h1V15A2.5 2.5 0 0 0 17 12.5V12h-1v.5ZM3 14.5A2.5 2.5 0 0 0 5.5 17v-1.5H5.5a1 1 0 1 1-1-1H9a2.5 2.5 0 0 0 0-5h-.5v1.5H9a1 1 0 1 1 1 1H6.5A2.5 2.5 0 0 0 4 15v1H3v-1.5ZM18.5 22a2.5 2.5 0 0 0 0-5H18v1.5h.5a1 1 0 0 1 0 2H14v1h4.5Z"
        fill={fg}
      />
    </svg>
  ),
  figma: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M8 2h4v6H8a3 3 0 0 1 0-6Zm4 0h4a3 3 0 0 1 0 6h-4V2Zm0 8h4a3 3 0 0 1 0 6h-4V10Zm0 8h4a3 3 0 1 1-4 0v-2ZM8 8h4v6H8a3 3 0 0 1 0-6Zm0 8h4v3a3 3 0 1 1-4-3Z"
        fill={fg}
      />
    </svg>
  ),
  noon: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.4 12.2c-.6.8-1.4 1.2-2.3 1.2-1.2 0-2-.9-2-2.4V8.2h-1.6l.2 1.1h-.1l-1.9-2.4c-.6-.6-1.3-1-2.3-1-1.4 0-2.5 1-2.5 2.8 0 2.1 1.1 3.2 2.9 3.9l1 .4c.8.3 1 .6 1 1 0 .6-.4 1-1.1 1-.6 0-1-.2-1.4-.6l-.9-1H6c.3 1.7 1.8 2.6 3.8 2.6 1.3 0 2.2-.6 2.7-1.6.3-.1.6-.3.8-.6V13c0 .2 0 .3.1.5.4.8 1.1 1.3 2 1.3.9 0 1.6-.3 2-1 .4-.6.4-1.2.2-1.8l1.8 2.2ZM12 8.5h1.6v4.6c0 .8-.3 1.2-.8 1.2-.6 0-.8-.4-.8-1.2V8.5Z"
        fill="#FEDD00"
      />
      <path d="M8.8 9.5c-.8 0-1.3.6-1.3 1.5s.5 1.5 1.3 1.5c.7 0 1.2-.3 1.7-1.2v-1.7c-.3-.1-.8-.1-1.7-.1Z" fill="#000" />
    </svg>
  ),
  careem: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm4.5 11-2 6H12l-1.6-5-1.6 5H7.1l2-6-1.3-4H8L9.6 13l1.2-4h2.4l1.6 4L16 9h.3l-1.3 4Z"
        fill={fg}
      />
    </svg>
  ),
  talabat: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.6 7h-3v1.4h1.8v1.6H14.6V14h3.3l-.3-2.3 1-1.4v-.9h-1L17.6 9ZM10.6 9h2.8l-.8 2.2h1.4L13 15h-2.5l1-2.3H10l-1.5 2.3H6L9 11.2 8.2 9h2.4ZM6.4 10.9 5 15h1.6l.8-2.5h1.4L9.6 15h1.6l-1.4-4.1H6.4Z"
        fill={fg}
      />
    </svg>
  ),
  deliveroo: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm4.5 6.6c-1.8-.3-3.4.7-3.7 2.5-.2-1.1-1.2-2.2-2.4-2.2-1.3-.1-2.4.8-2.4 2v1h-1.5l.5 2.7H9l.6 3.3 1.6-.3-.4-3h2v3.5l1.6-.3-.4-3.2h1.9l.6-3.3h-.9c0-1.1.8-1.8 1.8-1.8.4 0 .7 0 1.1.2l.3-1.4Z"
        fill={fg}
      />
    </svg>
  ),
  xbox: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M6.5 3.3 5 4.5C2.3 6.9 1 10.1 1 13c0 3.4 1.7 6.4 4.3 8.1L8 19.3c-2-1.7-3.1-4-3.1-6.3 0-2.2.9-4.4 2.5-6l-.9-3.7Zm11 0 .9 3.7c1.6 1.6 2.5 3.8 2.5 6 0 2.3-1.1 4.6-3.1 6.3L18.7 21C21.3 19.4 23 16.4 23 13c0-2.9-1.3-6.1-4-8.5L17.5 3.3ZM8.8 3.2C10.2 3.6 12 5.5 12 5.5s1.8-1.9 3.2-2.3C13.5 2.3 10.5 2.3 8.8 3.2Zm6.7 17.3c-1.4.9-3.4 1.5-3.5 1.5s-2.1-.6-3.5-1.5l-1 1C9 22.5 11 23 12 23s3-.5 4.5-1.5l-1-1ZM12 6.5C9.7 8 8 10.3 8 13c0 1.5.4 3 1.1 4.2.9.5 2.9 1.3 2.9 1.3s2-.8 2.9-1.3c.7-1.2 1.1-2.7 1.1-4.2 0-2.7-1.7-5-4-6.5Z"
        fill={fg}
      />
    </svg>
  ),
  playstation: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M9.3 3.2c1.8-.3 5.7.4 5.7 4.1v10.3l-2.3-.7V8.7c0-1.3-.5-1.9-1.3-1.9-.8 0-1.1.5-1.1 1.2v6.8l-2.3-.7V7.6c0-1.3 0-3 1.3-3.5.1-.1.4-.1 0 0ZM17.5 11.2v2.1c1.9.6 2.2 1.3 1.7 1.9-.5.6-2.1-.1-4-.7l.4 1.4c2.5.9 4.5 1.2 5 .4.6-.8-.1-2-3.1-3.1v-2Zm-10.1 4.5 2.3.7v.7L5.8 18c-2.3-.9-2.6-2.2-1.4-2.2 1-.1 3.5.9 4.6 1.4l.1-.1v-.8c-1.8-.5-3.8-.9-4.6-.2-.8.7-.2 1.9 1.9 2.8Z"
        fill={fg}
      />
    </svg>
  ),
  nintendo: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M7 3h10a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6Zm3.6 6.6a2 2 0 1 0-2.8 2.8 2 2 0 0 0 2.8-2.8Zm6.8 0a2 2 0 1 0-2.8 2.8 2 2 0 0 0 2.8-2.8ZM9 16.5h1.5V12H9v4.5Zm4.5-4.5V16.5H15V12h-1.5Z"
        fill={fg}
      />
    </svg>
  ),
  ea: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M6 5h12l-3.2 14H9.2L6 5Zm2.8 2.8L10.7 11l2.3-3.2h2L11.6 12l.9 4.3L12 17l-1.3-5-1.4 3H7.6L9 10.7l-.5-2.9h2.3Z"
        fill={fg}
      />
    </svg>
  ),
  windows: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path d="M3 5.5 11 4.4V11H3V5.5ZM12 4.2l9-1.5V11h-9V4.2ZM3 13h8v6.7L3 18.5V13Zm9 0h9v7.3l-9-1.5V13Z" fill={fg} />
    </svg>
  ),
  nordvpn: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.1 12.3c-1.8 2-4 3.6-5.1 3.6s-3.3-1.6-5.1-3.6C5 11 5.7 9 8 8.2c1-.3 1.5 0 2 .7.3.4 1.5 2.2 2 3.1l.5.6.4-.7L14 8.9c.5-.7 1-1 2-.7 2.3.8 3 2.8 1.1 4.1Z"
        fill={fg}
      />
    </svg>
  ),
  expressvpn: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm6.8 8.5c.3.7.2 1.3-.3 1.7l-2.8 2.5h4L16.8 17H8.5L5 12.6c-.7-1.1.4-2.3 1.5-2.2l1.2.1V8.8C8 7.3 9.6 6.5 11.2 7c.6.2 1 .6 1.3 1.2l1.5 2.3h1.8V7.8h2V10h1l1 .5Z"
        fill={fg}
      />
    </svg>
  ),
  mcafee: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2 3 6v6c0 5 3.9 9.4 9 10 5.1-.6 9-5 9-10V6l-9-4Zm0 3.5 5.5 2.5v5.5c0 3.8-2.6 7-5.5 7.6-2.9-.6-5.5-3.8-5.5-7.6V8L12 5.5Zm-2.5 5v5l5-5h-2l-3 3V10.5h-2Z"
        fill={fg}
      />
    </svg>
  ),
  norton: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2 3 6v6c0 5 4 9.5 9 10 5-.5 9-5 9-10V6l-9-4Zm-1 5.5h3v1h-2l.3 4.2 1.8-1.8 1 1-2.4 2.4c-.3.2-.6.2-.8.1L10 13l-.2-.3L9 8.7l.5-.7h1.5Z"
        fill={fg}
      />
    </svg>
  ),
  bitdefender: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M3 3h8v6h10v12H3V3Zm5 13a5 5 0 0 0 5 5h5V11h-5a5 5 0 0 0-5 5Z"
        fill={fg}
      />
    </svg>
  ),
  linkedin: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2ZM8 19H5.5V9.5H8V19ZM6.8 8.3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM19 19h-2.5v-4.7c0-1.1 0-2.6-1.6-2.6-1.6 0-1.8 1.2-1.8 2.5V19H10.5V9.5H13v1.4h.1c.3-.7 1.2-1.4 2.6-1.4 2.8 0 3.3 1.8 3.3 4.2V19Z"
        fill={fg}
      />
    </svg>
  ),
  coursera: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.1 5L15 7l-2.5 4.7L10 7l-2.1-2L4 11l2.1 2 1.8-1.6 2.8 5 1.6-3 1.6 3 4.6-7.5L20 11l-2.9-4Z"
        fill={fg}
      />
    </svg>
  ),
  duolingo: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.1 6.7c.4 1.2.6 2.6.6 4 0 3.2-2.5 5.8-5.7 5.8-3.2 0-5.8-2.6-5.8-5.8 0-1.4.2-2.8.6-4 1.1.7 2.4 1 3.5 1 .6 0 1.2-.1 1.7-.2v1c0 .8-.6 1.5-1.5 1.5s-1.5-.7-1.5-1.5c0-.3 0-.7.2-.9l-.3-.1c-.7.2-1.2.3-1.8.3-.6 0-1.3 0-1.8-.2 1.7 1.8 4.2 3 7 3.1 2.7-.1 5.2-1.3 6.9-3-.5.2-1.1.2-1.6.2h-.4l-.1.1v.1c-.1.1-.2.2-.2.4s.1.3.2.4l.1.1h.3c3-1 5.3-3.5 6.1-6.6.2-.2.3-.4.4-.6l-2.2-1.8Z"
        fill={fg}
      />
    </svg>
  ),
  strava: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="m2 16 5.5-10h3l5.5 10h-3l-1-2H6l-1 2H2Zm14-10 2.5 4.5L21 6h2.5l-4.5 8h-3L13 6h3Z"
        fill={fg}
      />
    </svg>
  ),
  whoop: (fg) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3/4 w-3/4">
      <path
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 3a7 7 0 1 1-7 7 7 7 0 0 1 7-7Zm0 1.5A5.5 5.5 0 1 0 17.5 12 5.5 5.5 0 0 0 12 6.5Zm0 2.2A3.3 3.3 0 1 1 8.7 12 3.3 3.3 0 0 1 12 8.7Zm0 .8a2.5 2.5 0 1 0 2.5 2.5A2.5 2.5 0 0 0 12 9.5Z"
        fill={fg}
      />
    </svg>
  ),
};

export function getPersonalSubscriptionProviderLogo(provider: PersonalSubscriptionProvider | null) {
  return provider?.logo ?? null;
}

export function resolvePersonalSubscriptionLogoFallback(userName: string | null | undefined) {
  const fallback: PersonalSubscriptionProvider['logo'] = {
    kind: 'icon',
    icon: CreditCard,
    baseColor: '#475569',
    foregroundColor: '#F1F5F9',
  };
  const match = userName ? findPersonalSubscriptionProviderLocal(userName) : null;
  if (match) return match.logo;
  return fallback;
}

function findPersonalSubscriptionProviderLocal(name: string) {
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);

  return (
    PERSONAL_SUBSCRIPTION_PROVIDERS.find((provider) =>
      [provider.name, provider.provider, ...provider.aliases]
        .map((value) =>
          value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
        )
        .some((haystack) => haystack === normalized)
    ) ||
    PERSONAL_SUBSCRIPTION_PROVIDERS.find((provider) => {
      const haystackTokens = [provider.name, provider.provider, ...provider.aliases].flatMap((value) =>
        value
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
      );
      return tokens.every((token) =>
        haystackTokens.some((haystackToken) => haystackToken.includes(token))
      );
    }) ||
    null
  );
}

export interface PersonalSubscriptionBrandLogoProps {
  providerKey?: string | null;
  fallbackName?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function PersonalSubscriptionBrandLogo({
  providerKey,
  fallbackName,
  size = 'md',
  className = '',
}: PersonalSubscriptionBrandLogoProps) {
  const provider = providerKey ? getPersonalSubscriptionProviderByKey(providerKey) : null;
  const logo = getPersonalSubscriptionProviderLogo(provider) ?? resolvePersonalSubscriptionLogoFallback(fallbackName);

  const sizing =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9 md:h-10 md:w-10';
  const innerText = provider?.name || fallbackName || '';
  const initials = React.useMemo(() => {
    const trimmed = innerText.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  }, [innerText]);

  return (
    <span
      className={`${sizing} ${className} relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/5 shadow-[0_4px_12px_-8px_rgba(15,23,42,0.4)]`}
      style={{ backgroundColor: logo.baseColor, color: logo.kind === 'icon' ? logo.foregroundColor : '#ffffff' }}
      aria-hidden="true"
    >
      {logo.kind === 'brand' ? (
        <span className="inline-flex h-full w-full items-center justify-center">
          {BRAND_SVG[logo.brandKey] ? BRAND_SVG[logo.brandKey]('#ffffff') : null}
        </span>
      ) : (
        <logo.icon size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} strokeWidth={1.8} />
      )}
      {!logo || (logo.kind === 'brand' && !BRAND_SVG[logo.brandKey]) ? initialsSpan(initials) : null}
    </span>
  );
}

function initialsSpan(initials: string | null) {
  return (
    <span className="inline-flex h-full w-full items-center justify-center font-800 leading-none tracking-tight text-white drop-shadow-sm">
      {initials || '?'}
    </span>
  );
}
