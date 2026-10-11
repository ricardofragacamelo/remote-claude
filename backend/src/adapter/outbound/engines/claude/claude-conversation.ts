import { ConversationRef } from '@domain/engine';
import { CLAUDE_ENGINE } from './claude-engine';

/** A UUID in the canonical form the Agent SDK hands out: lowercase, hyphenated. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The conversation [id] names in Claude's store — the name of its JSONL, and what `resume` takes —,
 * or `null` when it is not an id the SDK ever produced.
 *
 * Only the canonical form is accepted. An uppercase variant is not the same id on a case-sensitive
 * filesystem, and it is not an id the SDK ever produced. The rule is the engine's, so it lives here,
 * and the core only knows the form of a {@link ConversationRef}.
 */
export function claudeConversation(id: string): ConversationRef | null {
  return UUID.test(id) ? ConversationRef.create(CLAUDE_ENGINE, id) : null;
}

/** The generator of the ids of new conversations — a UUID, which the SDK requires. */
export const CLAUDE_CONVERSATION_IDS = Symbol('ClaudeConversationIds');
