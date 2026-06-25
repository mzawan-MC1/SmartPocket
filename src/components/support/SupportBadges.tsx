import React from 'react';
import { useTranslation } from 'react-i18next';
import { getPriorityBadgeTone, getStatusBadgeTone, toTitleLabel } from '@/lib/support';

type SupportBadgeNamespace = 'portal' | 'admin';

export function SupportStatusBadge({
  status,
  namespace = 'portal',
}: {
  status: string;
  namespace?: SupportBadgeNamespace;
}) {
  const { t } = useTranslation(namespace);

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-700 ${getStatusBadgeTone(status)}`}>
      {t(`support.badges.status.${status}`, { defaultValue: toTitleLabel(status) })}
    </span>
  );
}

export function SupportPriorityBadge({
  priority,
  namespace = 'portal',
}: {
  priority: string;
  namespace?: SupportBadgeNamespace;
}) {
  const { t } = useTranslation(namespace);

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-700 ${getPriorityBadgeTone(priority)}`}>
      {t(`support.badges.priority.${priority}`, { defaultValue: toTitleLabel(priority) })}
    </span>
  );
}
