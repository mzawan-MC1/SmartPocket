import { permanentRedirect } from 'next/navigation';

export default function PricingPage() {
  permanentRedirect('/home#pricing');
}
