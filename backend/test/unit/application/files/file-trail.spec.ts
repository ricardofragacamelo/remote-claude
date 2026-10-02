import { describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import { FileTrail } from '@application/files';
import { UserId } from '@domain/auth';
import { FilePath, FileTrailUnavailableError } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const fact = {
  userId: UserId.create('auth|42'),
  kind: 'file.deleted' as const,
  target: FilePath.create(WorkspacePath.create('/srv/app'), 'a.ts'),
  realPath: '/srv/app/a.ts',
  details: { sizeBytes: 1 },
};

describe('FileTrail', () => {
  it('records the fact before the write, with the real path as subject and the relative as label', async () => {
    const events = new RecordingAuditEvents();
    const order: string[] = [];
    const trail = new FileTrail(
      new RecordAuditEventUseCase(
        { append: (event) => (order.push('trail'), events.append(event)) },
        new SequentialIds(),
      ),
      new FixedClock(new Date(0)),
      () => undefined,
    );

    await trail.around(fact, () => (order.push('disk'), Promise.resolve()));

    expect(order).toEqual(['trail', 'disk']);
    expect(events.appended[0]).toMatchObject({ subjectId: '/srv/app/a.ts', subjectLabel: 'a.ts' });
  });

  it('answers a trail that is down as unavailable, keeping what the database said — S-117', async () => {
    const events = new RecordingAuditEvents();
    const cause = new Error('gone');
    events.failure = cause;
    const trail = new FileTrail(
      new RecordAuditEventUseCase(events, new SequentialIds()),
      new FixedClock(new Date(0)),
      () => undefined,
    );

    const refused = await trail
      .around(fact, () => Promise.resolve())
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(FileTrailUnavailableError);
    expect((refused as FileTrailUnavailableError).cause).toBe(cause);
  });

  it('says a failure that is no domain error is ours — never its message', async () => {
    const events = new RecordingAuditEvents();
    const trail = new FileTrail(
      new RecordAuditEventUseCase(events, new SequentialIds()),
      new FixedClock(new Date(0)),
      () => undefined,
    );

    await expect(
      trail.around(fact, () => Promise.reject(new Error('/home/someone/secret'))),
    ).rejects.toThrow();
    expect(events.appended[1]?.details).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('reports a refusal it could not record, and still lets the refusal through', async () => {
    const reported: string[] = [];
    let appended = 0;
    const trail = new FileTrail(
      new RecordAuditEventUseCase(
        {
          append: () => {
            appended += 1;
            return appended === 1 ? Promise.resolve() : Promise.reject(new Error('gone now'));
          },
        },
        new SequentialIds(),
      ),
      new FixedClock(new Date(0)),
      (_error, firstEventId) => reported.push(firstEventId),
    );

    await expect(trail.around(fact, () => Promise.reject(new Error('disk')))).rejects.toThrow(
      'disk',
    );
    expect(reported).toEqual(['01J00000000000000000000001']);
  });
});
