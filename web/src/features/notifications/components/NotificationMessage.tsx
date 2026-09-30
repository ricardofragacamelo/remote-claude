import { AlertTriangle, CircleX, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { NotificationParams, NotificationSeverity } from '@/shared/lib/notify';
import { cn } from '@/shared/lib/utils';

/** How each severity looks: the icon, its colour, and what a screen reader is told it is. */
const SEVERITIES: Readonly<
  Record<NotificationSeverity, { icon: LucideIcon; tone: string; labelKey: string }>
> = {
  info: { icon: Info, tone: 'text-muted-foreground', labelKey: 'notifications.severity.info' },
  warning: {
    icon: AlertTriangle,
    tone: 'text-warning',
    labelKey: 'notifications.severity.warning',
  },
  error: { icon: CircleX, tone: 'text-destructive', labelKey: 'notifications.severity.error' },
};

export interface NotificationMessageProps {
  readonly severity: NotificationSeverity;
  readonly messageKey: string;
  readonly params: NotificationParams;
  readonly count: number;
}

/**
 * What a notification says, the same in its toast and in the centre: its severity, its message —
 * translated here, from the key the history keeps — and how many times it happened.
 */
export function NotificationMessage({
  severity,
  messageKey,
  params,
  count,
}: NotificationMessageProps): React.JSX.Element {
  const { t } = useTranslation();
  const { icon: Icon, tone, labelKey } = SEVERITIES[severity];

  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} aria-hidden />
      <p className="min-w-0 text-ui">
        <span className="sr-only">{t(labelKey)}</span>
        {t(messageKey, params)}
        {count > 1 && (
          <span className="ml-1 rounded-sm bg-muted px-1 text-ui-sm text-muted-foreground">
            {t('notifications.entry.count', { count })}
          </span>
        )}
      </p>
    </div>
  );
}
