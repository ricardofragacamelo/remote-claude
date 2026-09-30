import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { SquarePen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PermissionQueuePanel } from '@/features/permission';
import { SessionScreen, SessionStarter } from '@/features/session';
import { useFolderTab } from '@/features/workbench';
import { IconButton } from '@/shared/components/IconButton';

export interface ClaudeSideBarProps {
  /** The real path of the folder of the tab — where a session is born. */
  readonly folder: string;
}

/**
 * The chat with Claude beside the editor, for the folder of the tab.
 *
 * Until the panel of plan 08 arrives, it is made of the components of today — the starter, the
 * questions, the conversation, the prompt box — held to the folder of the tab, so that nothing
 * regresses and starting, talking and approving happen without leaving the tab (plan 06, S-115). A
 * session is **born in this folder** and stays on screen here; the questions come first, because a
 * question is what the session is waiting on.
 *
 * There is no way from here to the whole of the conversation until the Sessions view of plan 08: the
 * history left the web with its routes ([06 · D-07](../../../docs/plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)).
 */
export function ClaudeSideBar({ folder }: ClaudeSideBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const tab = useFolderTab(folder);
  const navigate = useNavigate();
  const { showSession } = tab;

  const started = useCallback(
    (sessionId: string) => {
      showSession(sessionId);
    },
    [showSession],
  );

  // The way from a "don't ask again" to the list that takes it back — one of the two entrances
  // plan 03's D-04 requires.
  const openRules = useCallback(() => {
    void navigate({ to: '/rules' });
  }, [navigate]);

  if (tab.sessionId === null) {
    return <SessionStarter workspacePath={folder} onStarted={started} />;
  }

  return (
    <>
      <div className="flex justify-end">
        <IconButton
          icon={SquarePen}
          label={t('workbench.claude.newSession')}
          onClick={() => {
            showSession(null);
          }}
        />
      </div>
      <PermissionQueuePanel sessionId={tab.sessionId} onOpenRules={openRules} />
      <SessionScreen sessionId={tab.sessionId} draft={tab.draft} onDraftChange={tab.setDraft} />
    </>
  );
}
