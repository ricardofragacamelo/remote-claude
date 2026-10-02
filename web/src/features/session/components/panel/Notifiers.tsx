import { useBrowserNotifier } from '../../hooks/useBrowserNotifications';
import { usePermissionNotices } from '../../hooks/usePermissionNotices';

export interface NotifiersProps {
  readonly activeFolder: string | null;
  onOpen(folder: string, sessionId: string): void;
}

/**
 * What tells the person about Claude while they look elsewhere — a notice in the app for a question
 * in a tab not on screen, and the browser's own notification with the page hidden, once turned on
 * (plan 08, B-42). Renders nothing; the app keeps it up on every screen.
 */
export function Notifiers({ activeFolder, onOpen }: NotifiersProps): null {
  usePermissionNotices(activeFolder, onOpen);
  useBrowserNotifier();
  return null;
}
