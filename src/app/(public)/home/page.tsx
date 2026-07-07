import { permanentRedirect } from 'next/navigation';

// /home permanently redirects to canonical homepage /
export default function HomePage() {
  permanentRedirect('/');
}
