import { describe, expect, it } from 'vitest';

import { SessionId, TurnFileCheckpoint } from '@domain/session';
import type { Restorability, TurnFileCheckpointSnapshot } from '@domain/session';

const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const capturedAt = new Date('2026-09-18T12:00:00.000Z');

const snapshot = (
  overrides: Partial<TurnFileCheckpointSnapshot> = {},
): TurnFileCheckpointSnapshot => ({
  sessionId,
  promptId: 'prompt-1',
  path: '/srv/projects/app/a.md',
  existedBefore: 'present',
  blobPath: '/store/blob',
  hash: 'abc',
  sizeBytes: 12,
  restorable: 'yes',
  promptText: 'refactor the parser',
  capturedAt,
  ...overrides,
});

describe('TurnFileCheckpoint', () => {
  it('carries the turn it belongs to and the path it is about', () => {
    const checkpoint = TurnFileCheckpoint.capture(snapshot());

    expect(checkpoint.sessionId).toBe(sessionId);
    expect(checkpoint.promptId).toBe('prompt-1');
    expect(checkpoint.path).toBe('/srv/projects/app/a.md');
  });

  it('says whether the file was there before the turn touched it', () => {
    expect(TurnFileCheckpoint.capture(snapshot()).existedBefore).toBe('present');
    expect(TurnFileCheckpoint.capture(snapshot({ existedBefore: 'absent' })).existedBefore).toBe(
      'absent',
    );
  });

  it('can be restored when the contents were kept', () => {
    expect(TurnFileCheckpoint.capture(snapshot()).canBeRestored).toBe(true);
  });

  it('can be restored when the file was absent, by deleting it again', () => {
    // Not a gap in the record: it is what lets undo remove a file the turn created.
    const absent = snapshot({ existedBefore: 'absent', blobPath: null, hash: null, sizeBytes: 0 });

    expect(TurnFileCheckpoint.capture(absent).canBeRestored).toBe(true);
  });

  it.each(['tooLarge', 'unreadable'] as const)('cannot be restored when it is %s', (restorable) => {
    // The undo has to know it cannot promise this path, rather than finding out at the moment
    // somebody asks for their work back.
    expect(TurnFileCheckpoint.capture(snapshot({ restorable })).canBeRestored).toBe(false);
    expect(TurnFileCheckpoint.capture(snapshot({ restorable })).restorable).toBe(restorable);
  });

  it('hands back everything it was given', () => {
    const state = snapshot();

    expect(TurnFileCheckpoint.capture(state).snapshot()).toEqual(state);
  });

  it('keeps the prompt text, which is the label of the undo point', () => {
    expect(TurnFileCheckpoint.capture(snapshot()).snapshot().promptText).toBe(
      'refactor the parser',
    );
  });

  it.each([['yes'], ['tooLarge'], ['unreadable']] as [Restorability][])(
    'accepts %s as a restorability',
    (restorable) => {
      expect(TurnFileCheckpoint.capture(snapshot({ restorable })).restorable).toBe(restorable);
    },
  );
});
