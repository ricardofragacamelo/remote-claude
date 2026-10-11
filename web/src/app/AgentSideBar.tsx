import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { AgentPanel, SESSION_LINK_GONE } from '@/features/session';
import { useFolderTab } from '@/features/workbench';
import { ErrorState } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';

export interface AgentSideBarProps {
  /** The real path of the folder of the tab — where a session is born. */
  readonly folder: string;
}

/**
 * The chat with the agent beside the editor, for the folder of the tab — the panel of plan 08
 * (B-32): its conversations in tabs, each born in this folder and kept here.
 *
 * A link that named a session that is not a live one of the caller's says so here, with the way
 * back, rather than a conversation that never fills (plan 08, S-53).
 */
export function AgentSideBar({ folder }: AgentSideBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const tab = useFolderTab(folder);
  const navigate = useNavigate();
  const { showSession } = tab;

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
          {t('workbench.agent.backToStart')}
        </Button>
      </div>
    );
  }

  return <AgentPanel folder={folder} onOpenRules={openRules} />;
}
