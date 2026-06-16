import { redirect } from 'next/navigation';

// Root path is handled by middleware:
// - Authenticated users → /dashboard
// - Unauthenticated users → /home
// This fallback should never be reached, but keeps SSR safe.
export default function RootPage() {
  redirect('/home');
}