import { expect } from '@playwright/test';

/**
 * A conversation of the suite, as the contract names it since plan 28: `{ engine, id }` — the id alone
 * is unique only within its engine (ADR-025).
 */

/** A conversation as the contract names it: the engine, and its id in that engine's store. */
export interface ConversationRef {
  readonly engine: string;
  readonly id: string;
}

/** Reads a `{ engine, id }` a frame carries, failing the test when it is not one. */
export function conversationIn(value: unknown): ConversationRef {
  const conversation = value as Partial<ConversationRef> | undefined;

  expect(typeof conversation?.engine).toBe('string');
  expect(typeof conversation?.id).toBe('string');
  return { engine: String(conversation?.engine), id: String(conversation?.id) };
}

/** The key the address of the web names a conversation by: `engine:id` (plan 28, B-13). */
export function conversationKey(conversation: ConversationRef): string {
  return `${conversation.engine}:${conversation.id}`;
}
