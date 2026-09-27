import type { SessionConversation } from '@application/session';

/**
 * The conversation of a session, as `session.started` and `session.attached` carry it.
 *
 * Written once because two frames carry the same two fields, and the one that is optional has to
 * be absent rather than `null` on the wire — the contract declares it a string.
 */
export function conversationFields(conversation: SessionConversation | null): {
  readonly claudeSessionId?: string;
  readonly resumedFrom?: string;
} {
  if (conversation === null) {
    return {};
  }

  return {
    claudeSessionId: conversation.claudeSessionId.value,
    ...(conversation.resumedFrom === null ? {} : { resumedFrom: conversation.resumedFrom.value }),
  };
}
