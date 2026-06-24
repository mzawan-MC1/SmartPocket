'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const EMAIL_MODULE_TABS = [
  { href: '/admin/email', label: 'SMTP Settings' },
  { href: '/admin/email/notifications', label: 'Notifications' },
  { href: '/admin/email/templates', label: 'Templates' },
  { href: '/admin/email/logs', label: 'Delivery Logs' },
];

export default function EmailModuleNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-muted p-1">
      {EMAIL_MODULE_TABS.map((tab) => {
        const isActive = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-2 text-xs font-600 whitespace-nowrap transition-all ${
              isActive ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
