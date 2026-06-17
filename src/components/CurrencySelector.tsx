'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import { getActiveCurrencies, getCurrencyDisplayInfo } from '@/lib/currency';
import SearchField from '@/components/ui/SearchField';

interface CurrencySelectorProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export default function CurrencySelector({
  value,
  onChange,
  label,
  className = '',
  disabled = false,
}: CurrencySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const currencies = getActiveCurrencies();
  const selected = currencies.find((c) => c.code === value);

  const filtered = currencies.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
    setSearch('');
  };

  const displayInfo = selected ? getCurrencyDisplayInfo(selected.code) : null;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-500 text-foreground mb-1.5">{label}</label>
      )}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full flex items-center gap-3 input-base px-3 py-2.5 text-sm text-start ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-accent/50'
        }`}
      >
        {displayInfo && (
          <span className="font-700 text-base w-8 text-center flex-shrink-0 text-foreground">
            {displayInfo.symbol}
          </span>
        )}
        <div className="flex-1 min-w-0">
          {selected ? (
            <span className="font-500 text-foreground">
              {selected.code} — {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Select currency</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-card-md z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <SearchField
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search currencies..."
              inputClassName="h-8 py-2 text-sm"
              iconClassName="start-3 text-[14px]"
            />
          </div>

          {/* List */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">No currencies found</div>
            ) : (
              filtered.map((currency) => {
                const info = getCurrencyDisplayInfo(currency.code);
                const isSelected = currency.code === value;
                return (
                  <button
                    key={currency.code}
                    type="button"
                    onClick={() => handleSelect(currency.code)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted ${
                      isSelected ? 'bg-accent/5' : ''
                    }`}
                  >
                    <span className="font-700 w-8 text-center flex-shrink-0 text-foreground">
                      {info.symbol}
                    </span>
                    <span className="font-600 text-foreground w-10 flex-shrink-0">{currency.code}</span>
                    <span className="flex-1 text-muted-foreground text-start truncate">{currency.name}</span>
                    {isSelected && <Check size={14} className="text-accent flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
