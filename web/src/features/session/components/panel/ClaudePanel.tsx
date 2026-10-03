import { useState } from 'react';

import { folderTabStore } from '@/features/workbench';
import { useClaudePanel } from '../../hooks/useClaudePanel';
import { useEditAndResend } from '../../hooks/useEditAndResend';
import { sessionShownIn, tabKeyOf, usePanelDraft, usePanelTabs } from '../../hooks/usePanelTabs';
import { useSetPermissionMode } from '../../hooks/useSetPermissionMode';
import { ChangesView } from '../changes/ChangesView';
import { ConversationReader } from '../ConversationReader';
import { SessionScreen } from '../SessionScreen';
import { DraftView } from './DraftView';
import { PanelHeader } from './PanelHeader';
import { PanelHelp } from './PanelHelp';

export interface ClaudePanelProps {
  /** The real path of the folder of the tab — where its conversations are born. */
  readonly folder: string;

  /** Where the rules that a "don't ask again" left are taken back — the host's to open. */
  onOpenRules?(): void;
}

/**
 * The panel of Claude **inside** the folder tab, beside the explorer and the editor (plan 08, B-32):
 * the conversations of the folder in tabs — drafts, live sessions, conversations of the history —
 * with the one on screen whole, in the frame of plan 09: the tabs stay at the top, the conversation
 * scrolls, and its box stays at the bottom. Every
 * part of it is the tab's own, never global; closing a tab — of the panel or of the folder — never
 * ends a session, which lives in the backend.
 */
export function ClaudePanel({ folder, onOpenRules }: ClaudePanelProps): React.JSX.Element {
  const tabs = usePanelTabs(folder);
  const panel = useClaudePanel(folder);
  const [helpOpen, setHelpOpen] = useState(false);
  const active = tabs.active;
  const sessionId = sessionShownIn(tabs);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The header stays: what it switches is which conversation is on screen (plan 09, B-16). */}
      <PanelHeader
        folder={folder}
        tabs={tabs}
        onOpenHelp={() => {
          setHelpOpen(true);
        }}
        onOpenRules={onOpenRules}
      />

      {active?.kind === 'draft' && (
        <DraftView key={active.key} folder={folder} tabKey={active.key} />
      )}
      {active?.kind === 'conversation' && (
        <ConversationReader
          conversationId={active.conversationId}
          folder={folder}
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
          onShowChat={() => {
            panel.showPane('chat');
          }}
        />
      )}

      <PanelHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

/**
 * One live session of the panel: its conversation or its changes in the middle. Its questions are in
 * the conversation, in the place of their tools; with the changes on screen — or the card scrolled
 * away — the pill above the box brings the person back to them (plan 09, B-23, B-25).
 */
function SessionPane({
  folder,
  sessionId,
  pane,
  onOpenRules,
  onShowChat,
}: {
  readonly folder: string;
  readonly sessionId: string;
  readonly pane: 'chat' | 'changes';
  onOpenRules?: (() => void) | undefined;
  onShowChat(): void;
}): React.JSX.Element {
  const setMode = useSetPermissionMode(sessionId);
  const edit = useEditAndResend(folder, sessionId);
  const draft = usePanelDraft(folder, tabKeyOf('session', sessionId));

  return (
    <SessionScreen
      key={sessionId}
      sessionId={sessionId}
      folder={folder}
      edit={edit}
      draft={draft.text}
      onDraftChange={draft.setText}
      changes={
        pane === 'changes' ? <ChangesView folder={folder} sessionId={sessionId} /> : undefined
      }
      onOpenRules={onOpenRules}
      onPlanApproved={setMode}
      onShowChat={onShowChat}
    />
  );
}
