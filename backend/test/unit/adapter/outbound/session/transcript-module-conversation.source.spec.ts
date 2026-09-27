import { describe, expect, it } from 'vitest';

import { TranscriptModuleConversationSource } from '@adapter/outbound/session/transcript-module-conversation.source';
import { UserId } from '@domain/auth';
import { ClaudeSessionId } from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { SessionId } from '@domain/session';
import {
  aTranscriptSession,
  conversationId,
} from '../../../../support/builders/transcript.builder';
import { InMemorySessionOriginRepository } from '../../../../support/fakes/in-memory-session-origin.repository';
import { InMemoryTranscriptStore } from '../../../../support/fakes/in-memory-transcript.store';

const owner = UserId.create('auth|owner');

describe('TranscriptModuleConversationSource', () => {
  const build = (): {
    source: TranscriptModuleConversationSource;
    store: InMemoryTranscriptStore;
    origins: InMemorySessionOriginRepository;
  } => {
    const store = new InMemoryTranscriptStore();
    const origins = new InMemorySessionOriginRepository();

    return { source: new TranscriptModuleConversationSource(store, origins), store, origins };
  };

  it('answers where a conversation of ours ran, and who opened it', async () => {
    const { source, store, origins } = build();
    const id = ClaudeSessionId.create(conversationId(1));
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }));
    await origins.record({
      claudeSessionId: id,
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      openedBy: owner,
      workspace: WorkspacePath.create('/srv/projects/app'),
      openedAt: new Date('2026-09-18T12:00:00.000Z'),
    });

    const found = await source.find(id);

    expect(found).toMatchObject({ cwd: '/srv/projects/app', openedBy: owner });
    expect(found?.id.equals(id)).toBe(true);
  });

  it('answers nobody for a conversation begun elsewhere', async () => {
    const { source, store } = build();
    store.add('/srv/projects/app', aTranscriptSession({ id: 2, cwd: null }));

    expect(await source.find(ClaudeSessionId.create(conversationId(2)))).toMatchObject({
      cwd: null,
      openedBy: undefined,
    });
  });

  it('answers nothing for an id the store does not hold, without asking the provenance', async () => {
    const { source, origins } = build();
    let asked = false;
    origins.openersOf = () => {
      asked = true;
      return Promise.resolve(new Map());
    };

    expect(await source.find(ClaudeSessionId.create(conversationId(3)))).toBeNull();
    expect(asked).toBe(false);
  });

  it('reads no message to decide', async () => {
    const { source, store } = build();
    store.add('/srv/projects/app', aTranscriptSession({ id: 4 }));

    await source.find(ClaudeSessionId.create(conversationId(4)));

    expect(store.reads).toBe(0);
  });
});
