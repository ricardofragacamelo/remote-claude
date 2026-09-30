import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useNotificationCenter } from '../hooks/useNotificationCenter';
import { useNotifications } from '../store/notifications.store';

/**
 * The bell of the status bar: how many notifications are unread — on the server, and not yet sent
 * from this window — and the way into the centre.
 */
export function NotificationBell(): React.JSX.Element {
  const { t } = useTranslation();
  const { unread } = useNotificationCenter();
  const open = useNotifications((state) => state.centerOpen);
  const toggle = useNotifications((state) => state.toggleCenter);
  const doNotDisturb = useNotifications((state) => state.doNotDisturb);
  const Icon = doNotDisturb ? BellOff : Bell;
  const label = t('notifications.bell.label', { count: unread });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          className="relative flex min-h-touch items-center gap-1 rounded-sm px-1 hover:bg-statusbar-foreground/10 md:min-h-0"
          onClick={toggle}
        >
          <Icon className="size-3.5" aria-hidden />
          {unread > 0 && <span aria-hidden>{unread}</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
