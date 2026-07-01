import dynamic from 'next/dynamic';
import { getReferenceDataSnapshot } from '@/lib/reference-data/store';

const AdminCountriesSettingsClient = dynamic(() => import('@/app/admin/countries/AdminCountriesSettingsClient'), {
  loading: () => <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading country settings...</div>,
});

export default async function AdminCountriesPage() {
  const referenceData = await getReferenceDataSnapshot();

  return (
    <AdminCountriesSettingsClient
      initialCountries={referenceData.countries}
      initialCurrencies={referenceData.currencies}
      initialCountryCurrencies={referenceData.countryCurrencies}
    />
  );
}
