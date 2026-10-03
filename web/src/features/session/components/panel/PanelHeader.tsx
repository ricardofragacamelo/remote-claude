import { FileDiff, History, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { folderTabStore } from '@/features/workbench';
import { IconButton } from '@/shared/components/IconButton';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { useClaudePanel } from '../../hooks/useClaudePanel';
import { sessionShownIn } from '../../hooks/usePanelTabs';
import type { PanelTabs } from '../../hooks/usePanelTabs';
import { useSessionChanges } from '../../hooks/useSessionChanges';
import { useSessionHeader } from '../../hooks/useSessionHeader';
import { SESSIONS_VIEW } from '../sessions/registration';
import { McpIndicator } from './McpIndicator';
import { PanelTabStrip } from './PanelTabStrip';
import { SessionMenu } from './SessionMenu';
import { StatusDot } from './StatusDot';

export interface PanelHeaderProps {
  readonly folder: string;
  readonly tabs: PanelTabs;
  onOpenHelp(): void;
  onOpenRules?: (() => void) | undefined;
}

/**
 * The header of the panel, in one strip, as the plugin's (plan 09, B-16): the conversations of the
 * folder in tabs — which scroll in the strip when they do not fit (S-46) — and, always in view at
 * its right, a new conversation, the history of the folder, the changes of the session, where it
 * stands and the menu of the session. What changes **which** conversation is on screen, and nothing
 * about the turn: that is the tail of the conversation's.
 */
export function PanelHeader({
  folder,
  tabs,
  onOpenHelp,
  onOpenRules,
}: PanelHeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const sessionId = sessionShownIn(tabs);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-0.5 border-b border-border px-1">
      <PanelTabStrip tabs={tabs} />
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton icon={Plus} label={t('sessions.tabs.new')} onClick={tabs.newConversation} />
        <IconButton
          icon={History}
          label={t('sessions.header.history')}
          onClick={() => {
            const tab = folderTabStore(folder).getState();
            tab.showView(SESSIONS_VIEW);
            // Under `md` one view is on screen at a time: the sessions are the explorer's place.
            if (!desktop) {
              tab.showMobile('explorer');
            }
          }}
        />
        {sessionId === null ? (
          <SessionMenu
            session={null}
            folder={folder}
            onOpenHelp={onOpenHelp}
            onOpenRules={onOpenRules}
          />
        ) : (
          <SessionActions
            key={sessionId}
            folder={folder}
            sessionId={sessionId}
            onOpenHelp={onOpenHelp}
            onOpenRules={onOpenRules}
          />
        )}
      </div>
    </div>
  );
}

/** What the header offers of a live session: its changes, how it stands, its MCP and its menu. */
function SessionActions({
  folder,
  sessionId,
  onOpenHelp,
  onOpenRules,
}: {
  readonly folder: string;
  readonly sessionId: string;
  onOpenHelp(): void;
  onOpenRules?: (() => void) | undefined;
}): React.JSX.Element {
  const session = useSessionHeader(sessionId);

  return (
    <>
      <ChangesToggle folder={folder} sessionId={sessionId} />
      <McpIndicator sessionId={sessionId} />
      <StatusDot session={session} />
      <SessionMenu
        session={session}
        folder={folder}
        onOpenHelp={onOpenHelp}
        onOpenRules={onOpenRules}
      />
    </>
  );
}

/**
 * The conversation or the changes of the session in the middle of the panel — one button that says
 * which, with how many files are still to review (plan 08, B-28). Only the middle changes: the box
 * stays (S-08).
 */
function ChangesToggle({
  folder,
  sessionId,
}: {
  readonly folder: string;
  readonly sessionId: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const panel = useClaudePanel(folder);
  const changes = useSessionChanges(folder, sessionId);
  const showing = panel.pane === 'changes';
  const pending = changes.pending;

  return (
    <span className="relative inline-flex">
      <IconButton
        icon={FileDiff}
        label={
          pending > 0
            ? t('sessions.header.changesPending', { pending })
            : t('workbench.claude.showChanges')
        }
        aria-pressed={showing}
        onClick={() => {
          panel.showPane(showing ? 'chat' : 'changes');
        }}
      />
      {pending > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-ui-xs text-primary-foreground"
        >
          {pending}
        </span>
      )}
    </span>
  );
}
