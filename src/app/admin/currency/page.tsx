'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENCY_REGISTRY, formatCurrency } from '@/lib/currency';
import { Check, AlertTriangle, Eye, Settings2 } from 'lucide-react';

export default function AdminCurrencyPage() {
  const { t } = useTranslation('admin');
  const [defaultCurrency, setDefaultCurrency] = useState('AED');
  const [enabledCodes, setEnabledCodes] = useState<string[]>(
    Object.values(CURRENCY_REGISTRY).filter((c) => c.active).map((c) => c.code)
  );
  const [saved, setSaved] = useState(false);

  const allCurrencies = Object.values(CURRENCY_REGISTRY);

  const toggleCurrency = (code: string) => {
    if (code === defaultCurrency) return; // can't disable default
    setEnabledCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">{t('currency.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage platform currencies, symbols, and display settings
            </p>
          </div>
          <button
            onClick={handleSave}
            className={`btn-primary px-5 py-2.5 text-sm font-600 rounded-lg flex items-center gap-2 transition-all ${
              saved ? 'bg-positive text-white' : ''
            }`}
          >
            {saved ? <Check size={16} /> : <Settings2 size={16} />}
            {saved ? t('currency.saved') : t('actions.save', { ns: 'common' })}
          </button>
        </div>

        {/* Default Currency */}
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">{t('currency.defaultCurrency')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {enabledCodes.map((code) => {
              const c = CURRENCY_REGISTRY[code];
              if (!c) return null;
              return (
                <button
                  key={code}
                  onClick={() => setDefaultCurrency(code)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-500 transition-all ${
                    defaultCurrency === code
                      ? 'border-accent bg-accent/5 text-accent' :'border-border hover:border-accent/40 text-foreground'
                  }`}
                >
                  <span className="font-700 text-base w-8 text-center">{code === 'AED' ? 'AED' : c.symbol}</span>
                  <span className="font-600">{code}</span>
                  {defaultCurrency === code && <Check size={14} className="ms-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Currency List */}
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">{t('currency.enabledCurrencies')}</h2>
          <div className="space-y-2">
            {allCurrencies.map((currency) => {
              const isEnabled = enabledCodes.includes(currency.code);
              const isDefault = currency.code === defaultCurrency;
              return (
                <div
                  key={currency.code}
                  className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${
                    isEnabled ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-60'
                  }`}
                >
                  {/* Symbol preview */}
                  <div className="w-12 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="font-700 text-base text-foreground">
                      {currency.code === 'AED' ? 'AED' : currency.symbol}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-600 text-foreground text-sm">{currency.code}</span>
                      {isDefault && (
                        <span className="text-[10px] font-700 bg-accent/10 text-accent px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{currency.name}</p>
                  </div>

                  {/* Preview */}
                  <div className="hidden sm:block text-sm font-500 text-muted-foreground">
                    {formatCurrency(1250, currency.code)}
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleCurrency(currency.code)}
                    disabled={isDefault}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                      isEnabled ? 'bg-accent' : 'bg-muted'
                    } ${isDefault ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${currency.code}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                        isEnabled ? 'start-5' : 'start-0.5'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* AED Symbol Info */}
        <div className="card-elevated p-5 border-l-4 border-accent">
          <div className="flex items-start gap-3">
            <Eye size={18} className="text-accent flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-600 text-foreground mb-1">AED Display Rules</h3>
              <p className="text-sm text-muted-foreground">
                The UAE Dirham uses the official CBUAE symbol stored at{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">/currencies/aed-dirham-symbol.svg</code>.
                AED amounts display as <strong>AED 1,250.00</strong> — the ISO code and official symbol are never shown together.
              </p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-warning-soft border border-warning/20">
          <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-warning">{t('currency.warning')}</p>
        </div>
      </div>
  );
}
