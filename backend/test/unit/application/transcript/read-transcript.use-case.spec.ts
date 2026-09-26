import { beforeEach, describe, expect, it } from 'vitest';

import { ReadTranscriptUseCase } from '@application/transcript';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import {
  ClaudeSessionId,
  TranscriptCursorStaleError,
  TranscriptNotFoundError,
} from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { anAllowlist, OWNER } from '../../../support/builders/workspace.builder';
import {
  aTranscriptSession,
  conversationId,
  someMessages,
} from '../../../support/builders/transcript.builder';
import { InMemorySessionOriginRepository } from '../../../support/fakes/in-memory-session-origin.repository';
import { InMemoryTranscriptStore } from '../../../support/fakes/in-memory-transcript.store';

const owner = UserId.create(OWNER);
const stranger = UserId.create('auth|stranger');

describe('ReadTranscriptUseCase', () => {
  let store: InMemoryTranscriptStore;
  let origins: InMemorySessionOriginRepository;

  beforeEach(() => {
    store = new InMemoryTranscriptStore();
    origins = new InMemorySessionOriginRepository();
  });

  const read = (n = 1, before: string | null = null, limit = 2) =>
    new ReadTranscriptUseCase({ current: () => anAllowlist() }, store, origins).execute({
      userId: owner,
      sessionId: ClaudeSessionId.create(conversationId(n)),
      before,
      limit,
    });

  it('answers the latest page, and the conversation with its origin', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }), someMessages(3));

    const { session, page } = await read();

    expect(session.origin).toBe('external');
    expect(page.items.map(({ id }) => id)).toEqual(['m2', 'm3']);
    expect(page.next).toBe('m2');
  });

  it('continues from the cursor — S-06', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }), someMessages(3));

    expect((await read(1, 'm2')).page.items.map(({ id }) => id)).toEqual(['m1']);
  });

  it('answers an empty conversation with an empty page, not an error — S-03', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }));

    expect((await read()).page).toEqual({ items: [], next: null });
  });

  it('answers an id that names nothing with NOT_FOUND, never an empty page — S-56', async () => {
    await expect(read(9)).rejects.toThrow(TranscriptNotFoundError);
    expect(store.reads).toBe(0);
  });

  it('answers another person`s conversation exactly as a missing one — S-04', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }), someMessages(3));
    await origins.record({
      claudeSessionId: ClaudeSessionId.create(conversationId(1)),
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      openedBy: stranger,
      workspace: WorkspacePath.create('/srv/projects/app'),
      openedAt: new Date(0),
    });

    await expect(read()).rejects.toThrow(TranscriptNotFoundError);
    // Refused before the expensive read is paid.
    expect(store.reads).toBe(0);
  });

  it('answers one outside the caller`s roots as a missing one — S-55', async () => {
    store.add('/srv/elsewhere', aTranscriptSession({ id: 1, cwd: '/srv/elsewhere' }));

    await expect(read()).rejects.toThrow(TranscriptNotFoundError);
  });

  it('reports NOT_FOUND with its own key', async () => {
    const refusal = await read(9).catch((error: unknown) => error);

    expect(refusal).toMatchObject({ code: 'NOT_FOUND', messageKey: 'transcript.error.notFound' });
  });

  it('refuses a cursor whose message is gone — S-69', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }), someMessages(3));

    await expect(read(1, 'gone')).rejects.toThrow(TranscriptCursorStaleError);
  });
});
