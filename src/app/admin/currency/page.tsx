import dynamic from 'next/dynamic';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { getReferenceDataSnapshot } from '@/lib/reference-data/store';

const AdminCurrencySettingsClient = dynamic(() => import('@/app/admin/currency/AdminCurrencySettingsClient'), {
  loading: () => <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading currency settings...</div>,
});

export default async function AdminCurrencyPage() {
  const [referenceData, platformSettings] = await Promise.all([
    getReferenceDataSnapshot(),
    getPlatformSettingsSnapshot(),
  ]);

  const defaultCurrency =
    typeof platformSettings.raw.default_currency === 'string' &&
    platformSettings.raw.default_currency.trim().length > 0
      ? platformSettings.raw.default_currency
      : referenceData.currencies.find((currency) => currency.isActive && currency.code === 'USD')?.code ||
        referenceData.currencies.find((currency) => currency.isActive)?.code ||
        'USD';

  return (
    <AdminCurrencySettingsClient
      initialCurrencies={referenceData.currencies}
      initialCountries={referenceData.countries}
      initialCountryCurrencies={referenceData.countryCurrencies}
      initialDefaultCurrency={defaultCurrency}
    />
  );
}
