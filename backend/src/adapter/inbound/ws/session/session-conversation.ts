import type { SessionConversation } from '@application/session';
import { conversationRefPayload } from '../../conversation-ref.payload';
import type { ConversationRefPayload } from '../../conversation-ref.payload';

/**
 * The conversation of a session, as `session.started` and `session.attached` carry it.
 *
 * Written once because two frames carry the same two fields, and the one that is optional has to
 * be absent rather than `null` on the wire.
 */
export function conversationFields(conversation: SessionConversation | null): {
  readonly conversation?: ConversationRefPayload;
  readonly resumedFrom?: ConversationRefPayload;
} {
  if (conversation === null) {
    return {};
  }

  return {
    conversation: conversationRefPayload(conversation.ref),
    ...(conversation.resumedFrom === null
      ? {}
      : { resumedFrom: conversationRefPayload(conversation.resumedFrom) }),
  };
}
