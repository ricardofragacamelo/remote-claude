import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { Button } from '@/shared/components/ui/button';
import type { PendingNotification } from '../types/notification';
import { NotificationMessage } from './NotificationMessage';

export interface NotificationToastProps {
  readonly notification: PendingNotification;
  onDismiss(): void;
}

/**
 * One toast.
 *
 * Announced by severity without taking the focus: an error is an `alert`, anything else a `status`
 * (plan 06, S-133). Its actions are buttons, and running one closes it.
 */
export function NotificationToast({
  notification,
  onDismiss,
}: NotificationToastProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      role={notification.severity === 'error' ? 'alert' : 'status'}
      className="flex w-(--width) max-w-full items-start gap-2 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <NotificationMessage
          severity={notification.severity}
          messageKey={notification.messageKey}
          params={notification.params}
          count={notification.count}
        />
        {notification.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {notification.actions.map((action) => (
              <Button
                key={action.labelKey}
                variant="outline"
                className="h-8 px-3 text-ui"
                onClick={() => {
                  action.run();
                  onDismiss();
                }}
              >
                {t(action.labelKey)}
              </Button>
            ))}
          </div>
        )}
      </div>
      <IconButton icon={X} label={t('notifications.toast.dismiss')} onClick={onDismiss} />
    </div>
  );
}
