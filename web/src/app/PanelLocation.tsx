import { useEffect, useRef } from 'react';

import { useSessionLink } from '@/features/session';
import { useFolderTab } from '@/features/workbench';
import { conversationKey, parseConversationKey } from '@/shared/lib/conversation';

export interface PanelLocationProps {
  /** The real path of the folder of the tab. */
  readonly folder: string;

  /** The session a link named, if it named one. */
  readonly session: string | undefined;

  /**
   * The conversation a link named, if it named one — read only. As its {@link conversationKey},
   * `engine:id`: an id alone is unique only within its engine, and a link without the engine names
   * nothing.
   */
  readonly conversation: string | undefined;

  /** What the panel shows now, for the address to say it (plan 08, D-24). */
  onPanel(panel: { readonly session: string | null; readonly conversation: string | null }): void;
}

/**
 * The address and the panel of the agent, kept saying the same thing (plan 08, B-12): a link that
 * names a session or a conversation puts it in the panel of its folder's tab, and what the panel
 * shows goes back into the address — so pasting the link on another device brings the same screen
 * (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 *
 * A session that is not a live one of the caller's leaves the panel saying so, with the way back,
 * rather than a conversation that never fills (S-53).
 */
export function PanelLocation({
  folder,
  session,
  conversation,
  onPanel,
}: PanelLocationProps): null {
  const tab = useFolderTab(folder);
  const { sessionId, sessionFromLink } = tab;
  const { openLinkedSession, showConversation, refuseLink } = tab;
  const shown = tab.conversation === null ? null : conversationKey(tab.conversation);
  const link = useSessionLink(folder, sessionFromLink ? sessionId : null);

  // What the address said last, so it is acted on once per value: the panel's own changes come back
  // through the address, and must not be taken for a new link.
  const applied = useRef<string | null>(null);

  // The link, into the panel.
  useEffect(() => {
    const address = `${session ?? ''}\n${conversation ?? ''}`;

    if (applied.current === address) {
      return;
    }

    applied.current = address;

    const named = conversation === undefined ? null : parseConversationKey(conversation);

    if (session !== undefined && session !== sessionId) {
      openLinkedSession(session);
    } else if (named !== null && conversation !== shown) {
      showConversation(named);
    }
  }, [conversation, shown, openLinkedSession, session, sessionId, showConversation]);

  useEffect(() => {
    if (link === 'missing') {
      refuseLink();
    }
  }, [link, refuseLink]);

  // The panel, into the address — only when the two disagree: a navigation that says what the
  // address already says would race whatever else is navigating, a tab closing among them.
  useEffect(() => {
    if ((sessionId ?? undefined) !== session || (shown ?? undefined) !== conversation) {
      onPanel({ session: sessionId, conversation: shown });
    }
  }, [conversation, shown, onPanel, session, sessionId]);

  return null;
}
