'use client';

import React from 'react';
import {
  ArrowLeftRight,
  BedDouble,
  BookOpen,
  Briefcase,
  Car,
  Circle,
  CircleEllipsis,
  CreditCard,
  Droplets,
  Dumbbell,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  HandCoins,
  Handshake,
  Heart,
  House,
  Landmark,
  Laptop,
  Lightbulb,
  PawPrint,
  Pill,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Banknote } from 'lucide-react';
import { getSystemCategoryDisplayKey } from '@/lib/system-category-display';

export type CategoryIconLike =
  | string
  | {
      id?: string | null;
      name?: string | null;
      icon?: string | null;
      color?: string | null;
      is_system?: boolean | null;
      isSystem?: boolean | null;
      slug?: string | null;
      key?: string | null;
    }
  | null
  | undefined;

type CategoryIconOption = {
  key: string;
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
};

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { key: 'shopping-cart', labelKey: 'categories.form.iconOptions.shoppingCart', defaultLabel: 'Shopping cart', icon: ShoppingCart },
  { key: 'shopping-bag', labelKey: 'categories.form.iconOptions.shoppingBag', defaultLabel: 'Shopping bag', icon: ShoppingBag },
  { key: 'utensils', labelKey: 'categories.form.iconOptions.utensils', defaultLabel: 'Utensils', icon: Utensils },
  { key: 'car', labelKey: 'categories.form.iconOptions.car', defaultLabel: 'Car', icon: Car },
  { key: 'fuel', labelKey: 'categories.form.iconOptions.fuel', defaultLabel: 'Fuel pump', icon: Fuel },
  { key: 'house', labelKey: 'categories.form.iconOptions.house', defaultLabel: 'House', icon: House },
  { key: 'lightbulb', labelKey: 'categories.form.iconOptions.lightbulb', defaultLabel: 'Lightbulb', icon: Lightbulb },
  { key: 'wifi', labelKey: 'categories.form.iconOptions.wifi', defaultLabel: 'Wi-Fi', icon: Wifi },
  { key: 'smartphone', labelKey: 'categories.form.iconOptions.smartphone', defaultLabel: 'Smartphone', icon: Smartphone },
  { key: 'heart', labelKey: 'categories.form.iconOptions.heart', defaultLabel: 'Heart', icon: Heart },
  { key: 'pill', labelKey: 'categories.form.iconOptions.pill', defaultLabel: 'Pill', icon: Pill },
  { key: 'book-open', labelKey: 'categories.form.iconOptions.bookOpen', defaultLabel: 'Book', icon: BookOpen },
  { key: 'graduation-cap', labelKey: 'categories.form.iconOptions.graduationCap', defaultLabel: 'Graduation cap', icon: GraduationCap },
  { key: 'plane', labelKey: 'categories.form.iconOptions.plane', defaultLabel: 'Plane', icon: Plane },
  { key: 'bed', labelKey: 'categories.form.iconOptions.bed', defaultLabel: 'Bed', icon: BedDouble },
  { key: 'gift', labelKey: 'categories.form.iconOptions.gift', defaultLabel: 'Gift', icon: Gift },
  { key: 'shirt', labelKey: 'categories.form.iconOptions.shirt', defaultLabel: 'Shirt', icon: Shirt },
  { key: 'dumbbell', labelKey: 'categories.form.iconOptions.dumbbell', defaultLabel: 'Dumbbell', icon: Dumbbell },
  { key: 'paw-print', labelKey: 'categories.form.iconOptions.pawPrint', defaultLabel: 'Paw', icon: PawPrint },
  { key: 'wrench', labelKey: 'categories.form.iconOptions.wrench', defaultLabel: 'Wrench', icon: Wrench },
  { key: 'laptop', labelKey: 'categories.form.iconOptions.laptop', defaultLabel: 'Laptop', icon: Laptop },
  { key: 'users', labelKey: 'categories.form.iconOptions.users', defaultLabel: 'Users', icon: Users },
  { key: 'briefcase', labelKey: 'categories.form.iconOptions.briefcase', defaultLabel: 'Briefcase', icon: Briefcase },
  { key: 'wallet', labelKey: 'categories.form.iconOptions.wallet', defaultLabel: 'Wallet', icon: Wallet },
  { key: 'banknote', labelKey: 'categories.form.iconOptions.banknote', defaultLabel: 'Banknote', icon: Banknote },
  { key: 'credit-card', labelKey: 'categories.form.iconOptions.creditCard', defaultLabel: 'Credit card', icon: CreditCard },
  { key: 'piggy-bank', labelKey: 'categories.form.iconOptions.piggyBank', defaultLabel: 'Piggy bank', icon: PiggyBank },
  { key: 'receipt', labelKey: 'categories.form.iconOptions.receipt', defaultLabel: 'Receipt', icon: Receipt },
  { key: 'repeat', labelKey: 'categories.form.iconOptions.repeat', defaultLabel: 'Repeat', icon: Repeat },
  { key: 'shield', labelKey: 'categories.form.iconOptions.shield', defaultLabel: 'Shield', icon: Shield },
  { key: 'star', labelKey: 'categories.form.iconOptions.star', defaultLabel: 'Star', icon: Star },
  { key: 'tag', labelKey: 'categories.form.iconOptions.tag', defaultLabel: 'Tag', icon: Tag },
  { key: 'circle', labelKey: 'categories.form.iconOptions.circle', defaultLabel: 'Circle', icon: Circle },
  { key: 'trending-up', labelKey: 'categories.form.iconOptions.trendingUp', defaultLabel: 'Trending up', icon: TrendingUp },
  { key: 'landmark', labelKey: 'categories.form.iconOptions.landmark', defaultLabel: 'Bank', icon: Landmark },
  { key: 'droplets', labelKey: 'categories.form.iconOptions.droplets', defaultLabel: 'Water drop', icon: Droplets },
  { key: 'sparkles', labelKey: 'categories.form.iconOptions.sparkles', defaultLabel: 'Sparkles', icon: Sparkles },
  { key: 'film', labelKey: 'categories.form.iconOptions.film', defaultLabel: 'Film', icon: Film },
  { key: 'hand-coins', labelKey: 'categories.form.iconOptions.handCoins', defaultLabel: 'Hand with coins', icon: HandCoins },
  { key: 'handshake', labelKey: 'categories.form.iconOptions.handshake', defaultLabel: 'Handshake', icon: Handshake },
  { key: 'circle-ellipsis', labelKey: 'categories.form.iconOptions.circleEllipsis', defaultLabel: 'Other', icon: CircleEllipsis },
  { key: 'arrow-left-right', labelKey: 'categories.form.iconOptions.arrowLeftRight', defaultLabel: 'Transfer', icon: ArrowLeftRight },
  { key: 'zap', labelKey: 'categories.form.iconOptions.zap', defaultLabel: 'Electric', icon: Zap },
];

const ICON_BY_KEY = CATEGORY_ICON_OPTIONS.reduce<Record<string, LucideIcon>>((map, option) => {
  map[option.key] = option.icon;
  return map;
}, {});

const SYSTEM_CATEGORY_ICON_BY_DISPLAY_KEY: Record<string, string> = {
  salary: 'wallet',
  freelance: 'briefcase',
  investments: 'trending-up',
  investmentReturns: 'trending-up',
  otherIncome: 'banknote',
  businessIncome: 'briefcase',
  rentalIncome: 'house',
  giftsReceived: 'gift',
  diningOut: 'utensils',
  housing: 'house',
  housingRent: 'house',
  groceriesHousehold: 'shopping-cart',
  transport: 'car',
  utilities: 'lightbulb',
  shopping: 'shopping-bag',
  healthcare: 'heart',
  personalCare: 'sparkles',
  entertainment: 'film',
  travel: 'plane',
  education: 'graduation-cap',
  subscriptions: 'repeat',
  insurance: 'shield',
  savings: 'piggy-bank',
  otherExpense: 'circle-ellipsis',
  other: 'tag',
  transfer: 'arrow-left-right',
};

const LEGACY_ICON_ALIASES: Record<string, string> = {
  arrowleftright: 'arrow-left-right',
  banknoteicon: 'banknote',
  bookopen: 'book-open',
  briefcasebusiness: 'briefcase',
  card: 'credit-card',
  creditcard: 'credit-card',
  droplet: 'droplets',
  ellipsishorizontal: 'circle-ellipsis',
  fuelpump: 'fuel',
  handcoins: 'hand-coins',
  home: 'house',
  homeicon: 'house',
  piggybank: 'piggy-bank',
  shoppingcart: 'shopping-cart',
  shoppingbag: 'shopping-bag',
  smart_phone: 'smartphone',
  smartphoneicon: 'smartphone',
  sparkling: 'sparkles',
  sparklesicon: 'sparkles',
  tagicon: 'tag',
  trendup: 'trending-up',
  trendingup: 'trending-up',
  utensilscrossed: 'utensils',
  usersround: 'users',
};

function normalizeIconToken(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
}

function getIconKeyFromSystemKey(value: string | null | undefined) {
  if (!value) return null;
  return SYSTEM_CATEGORY_ICON_BY_DISPLAY_KEY[value] || null;
}

export function normalizeCategoryIconKey(value: string | null | undefined) {
  if (!value) return null;

  const normalized = normalizeIconToken(value);
  if (ICON_BY_KEY[normalized]) {
    return normalized;
  }

  const alias = LEGACY_ICON_ALIASES[normalized.replace(/-/g, '')] || LEGACY_ICON_ALIASES[normalized];
  if (alias && ICON_BY_KEY[alias]) {
    return alias;
  }

  return null;
}

function getRawLookupCandidates(category: Exclude<CategoryIconLike, string | null | undefined>) {
  return [category.name, category.slug, category.key, category.id].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
}

export function resolveCategoryIconKey(category: CategoryIconLike) {
  if (!category) return 'tag';

  if (typeof category === 'string') {
    const explicitIcon = normalizeCategoryIconKey(category);
    if (explicitIcon) {
      return explicitIcon;
    }

    const systemKey = getSystemCategoryDisplayKey(category) || category;
    return getIconKeyFromSystemKey(systemKey) || 'tag';
  }

  const explicitIcon = normalizeCategoryIconKey(category.icon);
  if (explicitIcon) {
    return explicitIcon;
  }

  if (category.is_system === false || category.isSystem === false) {
    return 'tag';
  }

  const systemKeyFromName = getSystemCategoryDisplayKey(category.name);
  if (systemKeyFromName) {
    return getIconKeyFromSystemKey(systemKeyFromName) || 'tag';
  }

  for (const candidate of getRawLookupCandidates(category)) {
    const candidateSystemKey = getSystemCategoryDisplayKey(candidate);
    if (candidateSystemKey) {
      return getIconKeyFromSystemKey(candidateSystemKey) || 'tag';
    }
  }

  return 'tag';
}

export function getCategoryIconOption(key: string | null | undefined) {
  const normalizedKey = normalizeCategoryIconKey(key) || resolveCategoryIconKey(key);
  return CATEGORY_ICON_OPTIONS.find((option) => option.key === normalizedKey) || CATEGORY_ICON_OPTIONS.find((option) => option.key === 'tag')!;
}

export function getCategoryIconColor(category: CategoryIconLike) {
  return typeof category === 'object' && category && typeof category.color === 'string' && category.color.trim()
    ? category.color
    : null;
}

export function getCategoryIconComponent(category: CategoryIconLike) {
  const key = resolveCategoryIconKey(category);
  return ICON_BY_KEY[key] || Tag;
}

export default function CategoryIcon({
  category,
  size = 16,
  className = '',
  color,
  withContainer = false,
  containerClassName = '',
  strokeWidth = 1.9,
  title,
}: {
  category: CategoryIconLike;
  size?: number;
  className?: string;
  color?: string | null;
  withContainer?: boolean;
  containerClassName?: string;
  strokeWidth?: number;
  title?: string;
}) {
  const Icon = getCategoryIconComponent(category);
  const resolvedColor = color || getCategoryIconColor(category);

  if (!withContainer) {
    return (
      <span title={title}>
        <Icon
          size={size}
          strokeWidth={strokeWidth}
          className={className}
          style={resolvedColor ? { color: resolvedColor } : undefined}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl border ${containerClassName}`.trim()}
      style={resolvedColor
        ? {
            backgroundColor: `${resolvedColor}18`,
            borderColor: `${resolvedColor}28`,
          }
        : undefined}
      title={title}
    >
      <Icon size={size} strokeWidth={strokeWidth} className={className} style={resolvedColor ? { color: resolvedColor } : undefined} />
    </span>
  );
}
