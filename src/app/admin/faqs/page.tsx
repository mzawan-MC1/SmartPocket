import FaqAdminClient from '@/app/admin/faqs/FaqAdminClient';
import { getAdminFaqDashboardData } from '@/lib/faqs-server';

export default async function AdminFaqPage() {
  const data = await getAdminFaqDashboardData();
  return <FaqAdminClient initialData={data} />;
}
