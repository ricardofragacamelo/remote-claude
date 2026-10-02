import { useEffect, useRef } from 'react';

import { useSessionLink } from '@/features/session';
import { useFolderTab } from '@/features/workbench';

export interface PanelLocationProps {
  /** The real path of the folder of the tab. */
  readonly folder: string;

  /** The session a link named, if it named one. */
  readonly session: string | undefined;

  /** The conversation a link named, if it named one — read only. */
  readonly conversation: string | undefined;

  /** What the panel shows now, for the address to say it (plan 08, D-24). */
  onPanel(panel: { readonly session: string | null; readonly conversation: string | null }): void;
}

/**
 * The address and the panel of Claude, kept saying the same thing (plan 08, B-12): a link that names
 * a session or a conversation puts it in the panel of its folder's tab, and what the panel shows
 * goes back into the address — so pasting the link on another device brings the same screen
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
  const { sessionId, conversationId, sessionFromLink } = tab;
  const { openLinkedSession, showConversation, refuseLink } = tab;
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

    if (session !== undefined && session !== sessionId) {
      openLinkedSession(session);
    } else if (conversation !== undefined && conversation !== conversationId) {
      showConversation(conversation);
    }
  }, [conversation, conversationId, openLinkedSession, session, sessionId, showConversation]);

  useEffect(() => {
    if (link === 'missing') {
      refuseLink();
    }
  }, [link, refuseLink]);

  // The panel, into the address — only when the two disagree: a navigation that says what the
  // address already says would race whatever else is navigating, a tab closing among them.
  useEffect(() => {
    if ((sessionId ?? undefined) !== session || (conversationId ?? undefined) !== conversation) {
      onPanel({ session: sessionId, conversation: conversationId });
    }
  }, [conversation, conversationId, onPanel, session, sessionId]);

  return null;
}
