'use client';

import React from 'react';
import {
  Bot,
  CircleHelp,
  FolderKanban,
  Handshake,
  LifeBuoy,
  PiggyBank,
  Receipt,
  Repeat,
  Rocket,
  RotateCcw,
  Sparkles,
  Users,
  Wallet,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CircleDollarSign } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  sparkles: Sparkles,
  receipt: Receipt,
  wallet: Wallet,
  'credit-card': CreditCard,
  'piggy-bank': PiggyBank,
  repeat: Repeat,
  'rotate-ccw': RotateCcw,
  handshake: Handshake,
  users: Users,
  'life-buoy': LifeBuoy,
  'circle-help': CircleHelp,
  bot: Bot,
  'folder-kanban': FolderKanban,
  'circle-dollar-sign': CircleDollarSign,
};

export default function FaqCategoryIcon({
  icon,
  className = '',
  size = 18,
}: {
  icon: string | null | undefined;
  className?: string;
  size?: number;
}) {
  const Icon = (icon && ICONS[icon]) || CircleHelp;
  return <Icon size={size} className={className} />;
}
