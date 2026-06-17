'use client';

import * as React from 'react';
import { Search } from 'lucide-react';

interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  wrapperClassName?: string;
  inputClassName?: string;
  iconClassName?: string;
}

export default function SearchField({
  wrapperClassName = '',
  inputClassName = '',
  iconClassName = '',
  type = 'search',
  ...props
}: SearchFieldProps) {
  return (
    <div className={`relative w-full ${wrapperClassName}`.trim()}>
      <Search
        size={16}
        className={`pointer-events-none absolute start-4 top-1/2 z-10 -translate-y-1/2 text-muted-foreground ${iconClassName}`.trim()}
      />
      <input
        {...props}
        type={type}
        className={`input-base h-10 ps-11 pe-4 text-sm sm:h-11 ${inputClassName}`.trim()}
      />
    </div>
  );
}
