import { isConversationRef } from '@remote-claude/contracts';
import type { ConversationRef } from '@remote-claude/contracts';

export type { ConversationRef };

/**
 * The one string that names a conversation of any engine: `engine:id`. What a query, a tab, a map
 * and the address key a conversation by — its id alone is unique only within its engine (ADR-025).
 */
export function conversationKey(conversation: ConversationRef): string {
  return `${conversation.engine}:${conversation.id}`;
}

/**
 * The conversation a key names, or `null` for a string that names none. The engine is everything
 * before the first `:` — an engine's id never holds one, a conversation's own id may.
 */
export function parseConversationKey(key: string): ConversationRef | null {
  const colon = key.indexOf(':');

  return colon <= 0 || colon === key.length - 1
    ? null
    : { engine: key.slice(0, colon), id: key.slice(colon + 1) };
}

/** Whether two references name the same conversation — `null` names none, and matches none. */
export function sameConversation(
  left: ConversationRef | null,
  right: ConversationRef | null,
): boolean {
  return left !== null && right !== null && left.engine === right.engine && left.id === right.id;
}

/** Whether two references are equal, `null` included — what tells a prop that did not change. */
export function equalConversations(
  left: ConversationRef | null,
  right: ConversationRef | null,
): boolean {
  return left === right || sameConversation(left, right);
}

/**
 * A conversation field of a payload, or `null` when it is absent, malformed or empty. Only the two
 * fields are kept: an unknown field the server adds rides nowhere.
 */
export function readConversation(
  payload: Readonly<Record<string, unknown>>,
  field: string,
): ConversationRef | null {
  const value = payload[field];

  return isConversationRef(value) && value.engine.length > 0 && value.id.length > 0
    ? { engine: value.engine, id: value.id }
    : null;
}
