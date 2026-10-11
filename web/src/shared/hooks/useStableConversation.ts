import { useMemo } from 'react';

import type { ConversationRef } from '@/shared/lib/conversation';

/**
 * The same reference for as long as it names the same conversation.
 *
 * A conversation is an object, and one read again — from the address, from a page, from a frame — is
 * a new object that names the same thing. A callback or an effect that depended on it would start
 * over on every render; one that depends on this starts over only when the conversation changes.
 */
export function useStableConversation(conversation: ConversationRef): ConversationRef;
export function useStableConversation(conversation: ConversationRef | null): ConversationRef | null;
export function useStableConversation(
  conversation: ConversationRef | null,
): ConversationRef | null {
  const engine = conversation?.engine;
  const id = conversation?.id;

  return useMemo(
    () => (engine === undefined || id === undefined ? null : { engine, id }),
    [engine, id],
  );
}
