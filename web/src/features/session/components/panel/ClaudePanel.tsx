import { useState } from 'react';
import { Bell, BellOff, CircleHelp, FileDiff, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PermissionQueuePanel } from '@/features/permission';
import { folderTabStore } from '@/features/workbench';
import { IconButton } from '@/shared/components/IconButton';
import { useBrowserNotifications } from '../../hooks/useBrowserNotifications';
import { useClaudePanel } from '../../hooks/useClaudePanel';
import { useEditAndResend } from '../../hooks/useEditAndResend';
import { tabKeyOf, usePanelDraft, usePanelTabs } from '../../hooks/usePanelTabs';
import { useSetPermissionMode } from '../../hooks/useSetPermissionMode';
import { ChangesView } from '../changes/ChangesView';
import { ConversationReader } from '../ConversationReader';
import { SessionScreen } from '../SessionScreen';
import { DraftView } from './DraftView';
import { PanelHelp } from './PanelHelp';
import { PanelTabStrip } from './PanelTabStrip';

export interface ClaudePanelProps {
  /** The real path of the folder of the tab — where its conversations are born. */
  readonly folder: string;

  /** Where the rules that a "don't ask again" left are taken back — the host's to open. */
  onOpenRules?(): void;
}

/**
 * The panel of Claude **inside** the folder tab, beside the explorer and the editor (plan 08, B-32):
 * the conversations of the folder in tabs — drafts, live sessions, conversations of the history —
 * with the one on screen whole: its questions first, then the conversation or its changes. Every
 * part of it is the tab's own, never global; closing a tab — of the panel or of the folder — never
 * ends a session, which lives in the backend.
 */
export function ClaudePanel({ folder, onOpenRules }: ClaudePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const tabs = usePanelTabs(folder);
  const panel = useClaudePanel(folder);
  const [helpOpen, setHelpOpen] = useState(false);
  const active = tabs.active;
  const sessionId = active?.kind === 'session' ? active.sessionId : null;

  return (
    <div className="flex flex-col gap-3">
      <PanelTabStrip tabs={tabs} />
      <div className="flex justify-end gap-0.5">
        {sessionId !== null && (
          <>
            <IconButton
              icon={MessageSquare}
              label={t('workbench.claude.showChat')}
              aria-pressed={panel.pane === 'chat'}
              onClick={() => {
                panel.showPane('chat');
              }}
            />
            <IconButton
              icon={FileDiff}
              label={t('workbench.claude.showChanges')}
              aria-pressed={panel.pane === 'changes'}
              onClick={() => {
                panel.showPane('changes');
              }}
            />
          </>
        )}
        <NotificationsToggle />
        <IconButton
          icon={CircleHelp}
          label={t('claudePanel.help.open')}
          onClick={() => {
            setHelpOpen(true);
          }}
        />
      </div>

      {active?.kind === 'draft' && (
        <DraftView key={active.key} folder={folder} tabKey={active.key} />
      )}
      {active?.kind === 'conversation' && (
        <ConversationReader
          conversationId={active.conversationId}
          onResumed={(resumed) => {
            // The conversation goes on as a session: its tab becomes the session's.
            tabs.close(active.key);
            panel.showPane('chat');
            folderTabStore(folder).getState().showSession(resumed);
          }}
          onClose={() => {
            tabs.close(active.key);
          }}
        />
      )}
      {sessionId !== null && (
        <SessionPane
          folder={folder}
          sessionId={sessionId}
          pane={panel.pane}
          onOpenRules={onOpenRules}
        />
      )}

      <PanelHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

/** One live session of the panel: its questions first, then its conversation or its changes. */
function SessionPane({
  folder,
  sessionId,
  pane,
  onOpenRules,
}: {
  readonly folder: string;
  readonly sessionId: string;
  readonly pane: 'chat' | 'changes';
  onOpenRules?: (() => void) | undefined;
}): React.JSX.Element {
  const setMode = useSetPermissionMode(sessionId);
  const edit = useEditAndResend(folder, sessionId);
  const draft = usePanelDraft(folder, tabKeyOf('session', sessionId));

  return (
    <>
      {/* The questions first, on either pane: a question is what the session is waiting on. */}
      <PermissionQueuePanel
        sessionId={sessionId}
        folder={folder}
        onOpenRules={onOpenRules}
        onPlanApproved={setMode}
      />
      {pane === 'changes' ? (
        <ChangesView folder={folder} sessionId={sessionId} />
      ) : (
        <SessionScreen
          key={sessionId}
          sessionId={sessionId}
          folder={folder}
          edit={edit}
          draft={draft.text}
          onDraftChange={draft.setText}
        />
      )}
    </>
  );
}

/**
 * The notifications of the browser, turned on only by this click (D-21) — and, refused by the
 * browser, how to give them back, while the badges go on telling (S-193).
 */
function NotificationsToggle(): React.JSX.Element {
  const { t } = useTranslation();
  const notifications = useBrowserNotifications();
  const on = notifications.enabled && notifications.permission === 'granted';

  return (
    <>
      <IconButton
        icon={on ? Bell : BellOff}
        label={on ? t('sessions.browserNotice.turnOff') : t('sessions.browserNotice.turnOn')}
        aria-pressed={on}
        disabled={notifications.permission === 'unsupported'}
        onClick={on ? notifications.disable : notifications.enable}
      />
      {notifications.permission === 'denied' && (
        <p role="note" className="text-ui-xs text-muted-foreground">
          {t('sessions.browserNotice.denied')}
        </p>
      )}
    </>
  );
}
