import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useFolderTab } from '@/features/workbench';
import { StatusBarButton } from '@/shared/components/StatusBarButton';
import { COMPOSER_ID } from '../../hooks/usePanelCommands';
import { useSessionSummary } from '../../hooks/useSessionSummary';
import { sessionStatusItem } from '../session-status-item';
import type { SessionItemProps } from '../session-status-item';

/**
 * The conversation on screen, in the status bar (plan 08, B-41): where its session stands, its model
 * and what it cost — of the folder tab on screen, changing with it. With no conversation it is not
 * there at all (S-187); a press brings the panel and its prompt box (B-40).
 */
export const ClaudeStatusItem = sessionStatusItem(Item);

function Item({ folder, sessionId }: SessionItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const tab = useFolderTab(folder);
  const { status, model, cost } = useSessionSummary(sessionId);
  const label = t('sessions.status.item', {
    status: t(`session.status.${status}`),
    model: model ?? t('sessions.model.default'),
    cost,
  });

  return (
    <StatusBarButton
      icon={Bot}
      label={label}
      onClick={() => {
        tab.showSecondary();
        requestAnimationFrame(() => {
          document.getElementById(COMPOSER_ID)?.focus();
        });
      }}
    >
      {t('sessions.status.short', { status: t(`session.status.${status}`), cost })}
    </StatusBarButton>
  );
}
