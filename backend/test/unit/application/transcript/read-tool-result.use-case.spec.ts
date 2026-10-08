import { beforeEach, describe, expect, it } from 'vitest';

import { ReadToolResultUseCase } from '@application/transcript';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { ClaudeSessionId, TranscriptNotFoundError } from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { OWNER } from '../../../support/builders/workspace.builder';
import {
  aTranscriptAudience,
  aTranscriptSession,
  conversationId,
} from '../../../support/builders/transcript.builder';
import { InMemorySessionOriginRepository } from '../../../support/fakes/in-memory-session-origin.repository';
import { InMemoryTranscriptStore } from '../../../support/fakes/in-memory-transcript.store';

const owner = UserId.create(OWNER);

describe('ReadToolResultUseCase — plan 22, B-11', () => {
  let store: InMemoryTranscriptStore;
  let origins: InMemorySessionOriginRepository;

  beforeEach(() => {
    store = new InMemoryTranscriptStore().add('/srv/projects/app', aTranscriptSession({ id: 1 }));
    origins = new InMemorySessionOriginRepository();
  });

  const read = (toolUseId = 'toolu_1', maxBytes = 1_024) =>
    new ReadToolResultUseCase(store, aTranscriptAudience({ origins }), maxBytes).execute({
      userId: owner,
      sessionId: ClaudeSessionId.create(conversationId(1)),
      toolUseId,
    });

  it('answers the whole output, uncut below the ceiling — S-22', async () => {
    store.addToolResult(conversationId(1), 'toolu_1', 'line 1\nline 2');

    expect(await read()).toEqual({ text: 'line 1\nline 2', truncated: false, bytes: 13 });
  });

  it('cuts above the ceiling and says so — S-23', async () => {
    store.addToolResult(conversationId(1), 'toolu_1', `${'a'.repeat(8)}${'b'.repeat(8)}`);

    expect(await read('toolu_1', 8)).toEqual({
      text: 'aaaabbbb',
      truncated: true,
      bytes: 16,
      cutAt: 4,
    });
  });

  it('answers a tool the chain has no result of as a missing conversation — S-24', async () => {
    await expect(read('toolu_unknown')).rejects.toThrow(TranscriptNotFoundError);
  });

  it('answers another person`s conversation exactly as a missing one — S-25', async () => {
    store.addToolResult(conversationId(1), 'toolu_1', 'secret');
    await origins.record({
      claudeSessionId: ClaudeSessionId.create(conversationId(1)),
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      openedBy: UserId.create('auth|stranger'),
      workspace: WorkspacePath.create('/srv/projects/app'),
      openedAt: new Date(0),
    });

    await expect(read()).rejects.toThrow(TranscriptNotFoundError);
  });
});
