import { describe, expect, it } from 'vitest';

import {
  toCheckpointEntity,
  toCheckpointRow,
  toStateEntity,
  toStateRow,
} from '@adapter/outbound/persistence/session/session-file.mapper';

const at = new Date('2026-09-26T12:00:00.000Z');
const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';

const stateRow = {
  sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
  claudeSessionId: CONVERSATION,
  path: '/srv/a.md',
  hash: 'h',
  mtime: at,
  sizeBytes: 3,
  updatedAt: at,
};

const checkpointRow = {
  sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
  claudeSessionId: CONVERSATION,
  promptId: 'p1',
  path: '/srv/a.md',
  existedBefore: 'present',
  blobPath: '/store/blob',
  hash: 'h',
  sizeBytes: 3,
  restorable: 'yes',
  promptText: 'refactor',
  capturedAt: at,
};

describe('the journal mapper', () => {
  it('reads and writes the conversation a state belongs to', () => {
    const entity = toStateEntity(stateRow);

    expect(entity.snapshot().claudeSessionId?.value).toBe(CONVERSATION);
    expect(toStateRow(entity)).toEqual(stateRow);
  });

  it('reads a state older than migration 0013 as belonging to no conversation', () => {
    const entity = toStateEntity({ ...stateRow, claudeSessionId: null, hash: null });

    expect(entity.snapshot().claudeSessionId).toBeNull();
    expect(entity.hash).toBeNull();
    expect(toStateRow(entity)).toMatchObject({ claudeSessionId: null, hash: null });
  });

  it('reads and writes the conversation a checkpoint belongs to', () => {
    const entity = toCheckpointEntity(checkpointRow);

    expect(entity.snapshot().claudeSessionId?.value).toBe(CONVERSATION);
    expect(toCheckpointRow(entity)).toEqual(checkpointRow);
  });

  it('reads a checkpoint older than migration 0013 as belonging to no conversation', () => {
    const entity = toCheckpointEntity({ ...checkpointRow, claudeSessionId: null });

    expect(toCheckpointRow(entity).claudeSessionId).toBeNull();
  });
});
