import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Wallet,
  CreditCard,
  Smartphone,
  Target,
  Landmark,
} from 'lucide-react';

export const GRADIENT_MAP: Record<string, string> = {
  bank: 'from-primary to-navy-600',
  credit_card: 'from-negative to-red-700',
  savings: 'from-positive to-teal-600',
  cash: 'from-warning to-amber-600',
  digital_wallet: 'from-info to-blue-600',
  investment: 'from-purple-600 to-purple-800',
  other: 'from-muted-foreground to-slate-600',
};

export function getIcon(type: string): LucideIcon {
  switch (type) {
    case 'bank':
      return Building2;
    case 'credit_card':
      return CreditCard;
    case 'savings':
      return Target;
    case 'cash':
      return Wallet;
    case 'digital_wallet':
      return Smartphone;
    case 'investment':
      return Landmark;
    default:
      return Wallet;
  }
}

export function getAccountTypeLabel(
  type: string,
  t: (key: string) => string
): string {
  switch (type) {
    case 'bank':
      return t('accounts.types.bank');
    case 'credit_card':
      return t('accounts.types.creditCard');
    case 'savings':
      return t('accounts.types.savings');
    case 'cash':
      return t('accounts.types.cash');
    case 'digital_wallet':
      return t('accounts.types.digitalWallet');
    case 'investment':
      return t('accounts.types.investment');
    default:
      return t('accounts.types.other');
  }
}
