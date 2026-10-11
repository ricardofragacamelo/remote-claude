import { describe, expect, it } from 'vitest';

import { TranscriptStoreRegistry } from '@application/transcript';
import { ConversationRef, InvalidConversationRefError } from '@domain/engine';
import { aTranscriptSession, conversationId } from '../../../support/builders/transcript.builder';
import { InMemoryTranscriptStore } from '../../../support/fakes/in-memory-transcript.store';

/** A session of the store of [engine]. */
function sessionOf(engine: string, id: number, lastModified: number) {
  return {
    ...aTranscriptSession({ id, lastModified }),
    id: ConversationRef.create(engine, conversationId(id)),
  };
}

describe('TranscriptStoreRegistry — plan 28, B-11', () => {
  const claude = new InMemoryTranscriptStore('claude')
    .add('/srv/app', sessionOf('claude', 1, 100))
    .add('/srv/app', sessionOf('claude', 3, 300));
  const other = new InMemoryTranscriptStore('test-engine').add(
    '/srv/app',
    sessionOf('test-engine', 2, 200),
  );
  const registry = new TranscriptStoreRegistry([claude, other], 'claude');

  it('lists the conversations of every engine as one, newest first', async () => {
    const listed = await registry.list('/srv/app');

    expect(listed.map((session) => session.id.key)).toEqual([
      `claude:${conversationId(3)}`,
      `test-engine:${conversationId(2)}`,
      `claude:${conversationId(1)}`,
    ]);
    expect((await registry.listAll()).map((session) => session.lastModified)).toEqual([
      300, 200, 100,
    ]);
  });

  it('asks the store of the conversation’s engine, and nobody for one not enabled', async () => {
    expect(
      await registry.find(ConversationRef.create('test-engine', conversationId(2))),
    ).not.toBeNull();
    expect(await registry.find(ConversationRef.create('codex', conversationId(2)))).toBeNull();
  });

  it('routes the reads of one conversation to its engine', async () => {
    other.addToolResult(conversationId(2), 'toolu_1', 'out');
    const session = sessionOf('test-engine', 2, 200);

    expect(await registry.toolResult(session, 'toolu_1')).toBe('out');
    expect(await registry.messages(session)).toEqual([]);
    expect(await registry.subagentMessages(session, 'toolu_x')).toBeNull();
    expect(await registry.promptImage(session, 'b:0')).toBeNull();
  });

  it('refuses a read of a conversation of an engine it does not have', () => {
    expect(() => registry.messages(sessionOf('codex', 9, 1))).toThrow(InvalidConversationRefError);
  });

  it('names a conversation by its engine’s rule, and says which engines it has — S-25', () => {
    expect(registry.has('test-engine')).toBe(true);
    expect(registry.has('codex')).toBe(false);
    expect(registry.defaultEngine).toBe('claude');
    expect(registry.conversation('claude', conversationId(1)).engine.value).toBe('claude');
    expect(() => registry.conversation('claude', 'nope')).toThrow(InvalidConversationRefError);
    expect(() => registry.conversation('codex', conversationId(1))).toThrow(
      InvalidConversationRefError,
    );
  });

  it('refuses to be built with a default that has no store', () => {
    expect(() => new TranscriptStoreRegistry([claude], 'codex')).toThrow('has no history store');
  });
});
