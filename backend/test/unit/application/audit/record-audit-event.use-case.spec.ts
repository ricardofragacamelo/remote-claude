import { describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import { UserId } from '@domain/auth';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const at = new Date('2026-09-18T10:00:00.000Z');

const command = {
  userId: owner,
  kind: 'device.registered',
  subjectId: 'dev_1',
  subjectLabel: 'Pixel 8',
  at,
} as const;

describe('RecordAuditEventUseCase', () => {
  it('mints the id and writes the event — the caller never chooses an identity', async () => {
    const events = new RecordingAuditEvents();
    const ids = new SequentialIds();

    await new RecordAuditEventUseCase(events, ids).execute(command);

    expect(events.appended).toHaveLength(1);
    expect(events.appended[0]?.id).toBe('01J00000000000000000000001');
    expect(events.appended[0]?.snapshot()).toMatchObject(command);
  });

  // Unlike a tool invocation, a failure here is not graded: approving a device is one deliberate
  // click, and answering "done" for an approval nobody can account for is the worse outcome.
  it('lets a failure of the trail through, so the operation that caused it fails too', async () => {
    const events = new RecordingAuditEvents();
    events.failure = new Error('the trail is unavailable');

    await expect(
      new RecordAuditEventUseCase(events, new SequentialIds()).execute(command),
    ).rejects.toThrow('the trail is unavailable');
  });
});
