import type { ConversationRef } from '@domain/engine';

/**
 * A conversation as the contract carries it, over the socket and over HTTP — the `ConversationRef`
 * of the schema (plan 28, B-12).
 */
export interface ConversationRefPayload {
  readonly engine: string;
  readonly id: string;
}

/** [ref] on the wire. */
export function conversationRefPayload(ref: ConversationRef): ConversationRefPayload {
  return { engine: ref.engine.value, id: ref.id };
}
