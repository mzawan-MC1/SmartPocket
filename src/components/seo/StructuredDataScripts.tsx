'use client';

import React from 'react';
import type { StructuredDataValue } from '@/lib/site-metadata';

export default function StructuredDataScripts({
  entries,
}: {
  entries: StructuredDataValue[];
}) {
  return (
    <>
      {entries.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
    </>
  );
}
