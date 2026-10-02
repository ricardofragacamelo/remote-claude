import { FileDiff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { StatusBarButton } from '@/shared/components/StatusBarButton';
import { useClaudePanel } from '../../hooks/useClaudePanel';
import { useSessionChanges } from '../../hooks/useSessionChanges';
import { sessionStatusItem } from '../session-status-item';
import type { SessionItemProps } from '../session-status-item';

/**
 * The changes of the session on screen, in the status bar: how many files are still to review, and
 * the way to the view of them (plan 08, B-28). With no session, or nothing changed, it is not there.
 */
export const ChangesStatusItem = sessionStatusItem(Count);

function Count({ folder, sessionId }: SessionItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const changes = useSessionChanges(folder, sessionId);
  const { showPane } = useClaudePanel(folder);

  if (changes.all.length === 0) {
    return null;
  }

  const label = t('sessions.changes.statusLabel', {
    pending: changes.pending,
    count: changes.all.length,
  });

  return (
    <StatusBarButton
      icon={FileDiff}
      label={label}
      onClick={() => {
        showPane('changes');
      }}
    >
      {t('sessions.changes.status', { pending: changes.pending })}
    </StatusBarButton>
  );
}
