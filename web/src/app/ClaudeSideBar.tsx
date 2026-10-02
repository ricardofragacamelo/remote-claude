import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { SquarePen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PermissionQueuePanel } from '@/features/permission';
import {
  ConversationReader,
  SESSION_LINK_GONE,
  SessionScreen,
  SessionStarter,
  useSetPermissionMode,
} from '@/features/session';
import { useFolderTab } from '@/features/workbench';
import { ErrorState } from '@/shared/components/ErrorState';
import { IconButton } from '@/shared/components/IconButton';
import { Button } from '@/shared/components/ui/button';

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
 * A conversation of the history opened from the Sessions view (plan 08, B-10) is read here, with the
 * way to continue it; continued, the panel shows the session it became.
 */
export function ClaudeSideBar({ folder }: ClaudeSideBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const tab = useFolderTab(folder);
  const navigate = useNavigate();
  const { showSession, showConversation } = tab;
  const setMode = useSetPermissionMode(tab.sessionId);

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

  if (tab.linkRefused) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState error={SESSION_LINK_GONE} />
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            showSession(null);
          }}
        >
          {t('workbench.claude.backToStart')}
        </Button>
      </div>
    );
  }

  if (tab.conversationId !== null) {
    return (
      <ConversationReader
        conversationId={tab.conversationId}
        onResumed={started}
        onClose={() => {
          showConversation(null);
        }}
      />
    );
  }

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
      <PermissionQueuePanel
        sessionId={tab.sessionId}
        onOpenRules={openRules}
        onPlanApproved={setMode}
      />
      <SessionScreen
        sessionId={tab.sessionId}
        draft={tab.draft}
        onDraftChange={tab.setDraft}
        folder={folder}
      />
    </>
  );
}
