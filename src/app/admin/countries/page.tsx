import AdminCountriesSettingsClient from '@/app/admin/countries/AdminCountriesSettingsClient';
import { getReferenceDataSnapshot } from '@/lib/reference-data/store';

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
