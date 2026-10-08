import { beforeEach, describe, expect, it } from 'vitest';

import { ReadPromptImageUseCase } from '@application/transcript';
import { UserId } from '@domain/auth';
import {
  ClaudeSessionId,
  PromptImageTooLargeError,
  PromptImageTypeUnsupportedError,
  TranscriptNotFoundError,
} from '@domain/transcript';
import { OWNER } from '../../../support/builders/workspace.builder';
import {
  aTranscriptAudience,
  aTranscriptSession,
  conversationId,
} from '../../../support/builders/transcript.builder';
import { InMemoryTranscriptStore } from '../../../support/fakes/in-memory-transcript.store';

const owner = UserId.create(OWNER);
const BLOCK = `${conversationId(7)}:1`;

describe('ReadPromptImageUseCase — plan 22, B-12', () => {
  let store: InMemoryTranscriptStore;

  beforeEach(() => {
    store = new InMemoryTranscriptStore().add('/srv/projects/app', aTranscriptSession({ id: 1 }));
  });

  const read = (blockId = BLOCK, maxBytes = 10) =>
    new ReadPromptImageUseCase(store, aTranscriptAudience(), maxBytes).execute({
      userId: owner,
      sessionId: ClaudeSessionId.create(conversationId(1)),
      blockId,
    });

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])(
    'serves a %s with its size — S-29',
    async (mediaType) => {
      store.addImage(conversationId(1), BLOCK, { mediaType, data: 'AAAA' });

      expect(await read()).toEqual({ mediaType, size: 3, data: 'AAAA' });
    },
  );

  it.each([['image/svg+xml'], ['application/pdf'], [null]])(
    'refuses %s with 415 — S-30',
    async (mediaType) => {
      store.addImage(conversationId(1), BLOCK, { mediaType, data: 'AAAA' });

      const refusal = await read().catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(PromptImageTypeUnsupportedError);
      expect(refusal).toMatchObject({ params: { mediaType: mediaType ?? 'unknown' } });
    },
  );

  it('serves an image at the ceiling, and refuses one byte more with 413 — S-31', async () => {
    // 16 characters are 12 bytes.
    store.addImage(conversationId(1), BLOCK, { mediaType: 'image/png', data: 'A'.repeat(16) });

    expect((await read(BLOCK, 12)).size).toBe(12);
    await expect(read(BLOCK, 11)).rejects.toBeInstanceOf(PromptImageTooLargeError);
  });

  it('answers a block that is no image of a prompt as a missing conversation — S-32', async () => {
    await expect(read(`${conversationId(7)}:0`)).rejects.toThrow(TranscriptNotFoundError);
  });
});
