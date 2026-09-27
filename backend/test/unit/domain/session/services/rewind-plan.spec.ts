import { describe, expect, it } from 'vitest';

import {
  latestBaselines,
  planFor,
  RewindTargetUnknownError,
  SessionFileState,
  SessionId,
  TurnFileCheckpoint,
  undoPointNamed,
  undoPointsOf,
  verdictFor,
} from '@domain/session';
import type { FileObservation, TurnFileCheckpointSnapshot } from '@domain/session';

const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 26, 12, minute));

function checkpoint(overrides: Partial<TurnFileCheckpointSnapshot> = {}): TurnFileCheckpoint {
  return TurnFileCheckpoint.capture({
    sessionId,
    claudeSessionId: null,
    promptId: 'p1',
    path: '/srv/a.md',
    existedBefore: 'present',
    blobPath: '/store/blob',
    hash: 'before',
    sizeBytes: 6,
    restorable: 'yes',
    promptText: 'refactor the parser',
    capturedAt: at(0),
    ...overrides,
  });
}

function baseline(hash: string | null, minute = 5, path = '/srv/a.md'): SessionFileState {
  return SessionFileState.record({
    sessionId,
    claudeSessionId: null,
    path,
    hash,
    mtime: at(minute),
    sizeBytes: 1,
    updatedAt: at(minute),
  });
}

const file = (hash: string): FileObservation => ({ kind: 'file', hash });
const absent: FileObservation = { kind: 'absent' };
const unsafe: FileObservation = { kind: 'unsafe' };

describe('the undo points of a session', () => {
  it('is empty for a session whose turns touched no file — fron', () => {
    expect(undoPointsOf([])).toEqual([]);
  });

  it('lists one point per turn, newest first, labelled by its prompt', () => {
    const points = undoPointsOf([
      checkpoint({ promptId: 'p1', capturedAt: at(0), promptText: 'first' }),
      checkpoint({ promptId: 'p2', capturedAt: at(10), promptText: 'second', path: '/srv/b.md' }),
    ]);

    expect(points.map((point) => [point.promptId, point.label, point.at])).toEqual([
      ['p2', 'second', at(10)],
      ['p1', 'first', at(0)],
    ]);
  });

  it('dates a turn by its first snapshot, and labels it by any snapshot that has the prompt', () => {
    const [point] = undoPointsOf([
      checkpoint({ path: '/srv/b.md', capturedAt: at(3), promptText: null }),
      checkpoint({ path: '/srv/a.md', capturedAt: at(1), promptText: 'the label' }),
    ]);

    expect(point?.at).toEqual(at(1));
    expect(point?.label).toBe('the label');
  });

  it('has no label for a turn whose hook carried no prompt', () => {
    expect(undoPointsOf([checkpoint({ promptText: null })])[0]?.label).toBeNull();
  });

  it('reaches every path touched from its turn on, each at its earliest snapshot — S-37', () => {
    const points = undoPointsOf([
      checkpoint({ promptId: 'p1', path: '/srv/a.md', hash: 'a0', capturedAt: at(0) }),
      checkpoint({ promptId: 'p2', path: '/srv/a.md', hash: 'a1', capturedAt: at(10) }),
      checkpoint({ promptId: 'p2', path: '/srv/b.md', hash: 'b1', capturedAt: at(11) }),
    ]);
    const reach = (promptId: string): [string, string | null][] =>
      undoPointNamed(points, promptId).checkpoints.map((c) => [c.path, c.hash]);

    // Back to before p1: `a` as it was before p1, and `b` — which only p2 touched — before p2.
    expect(reach('p1')).toEqual([
      ['/srv/a.md', 'a0'],
      ['/srv/b.md', 'b1'],
    ]);
    // Back to before p2: `a` as p1 left it, which is what p2 snapshotted.
    expect(reach('p2')).toEqual([
      ['/srv/a.md', 'a1'],
      ['/srv/b.md', 'b1'],
    ]);
  });

  it('orders two turns of the same instant by id, whatever order the rows came in', () => {
    const rows = [
      checkpoint({ promptId: 'b', capturedAt: at(0) }),
      checkpoint({ promptId: 'a', capturedAt: at(0), path: '/srv/b.md' }),
    ];

    expect(undoPointsOf(rows).map((point) => point.promptId)).toEqual(['b', 'a']);
    expect(undoPointsOf([...rows].reverse()).map((point) => point.promptId)).toEqual(['b', 'a']);
  });

  it('refuses a point that is not one of the session — S-61', () => {
    const points = undoPointsOf([checkpoint()]);

    expect(() => undoPointNamed(points, 'somebody-elses')).toThrow(RewindTargetUnknownError);
    expect(() => undoPointNamed(points, 'somebody-elses')).toThrow(
      expect.objectContaining({
        code: 'INVALID_INPUT',
        messageKey: 'session.error.rewindTargetUnknown',
      }) as Error,
    );
  });
});

describe('what going back does to one path', () => {
  it('leaves a file that already is the way it was — S-41', () => {
    expect(verdictFor(checkpoint(), baseline('after'), file('before'))).toEqual({
      path: '/srv/a.md',
      outcome: 'unchanged',
    });
  });

  it('leaves a created file that is already gone — S-41', () => {
    expect(
      verdictFor(checkpoint({ existedBefore: 'absent', hash: null }), baseline('new'), absent),
    ).toMatchObject({ outcome: 'unchanged' });
  });

  it('refuses a path that became a link or not a file — S-65', () => {
    expect(verdictFor(checkpoint(), baseline('after'), unsafe)).toEqual({
      path: '/srv/a.md',
      outcome: 'preserve',
      reason: 'unsafePath',
    });
  });

  it.each(['tooLarge', 'unreadable'] as const)(
    'cannot promise a file that was %s to snapshot',
    (restorable) => {
      expect(
        verdictFor(checkpoint({ restorable, hash: null }), baseline('after'), file('after')),
      ).toMatchObject({ outcome: 'preserve', reason: 'notRestorable' });
    },
  );

  it('is conservative about a path nothing records the session leaving — B-21', () => {
    expect(verdictFor(checkpoint(), null, file('after'))).toMatchObject({
      outcome: 'preserve',
      reason: 'noBaseline',
    });
  });

  it('preserves a file somebody edited after the session — S-63', () => {
    expect(verdictFor(checkpoint(), baseline('after'), file('edited by hand'))).toMatchObject({
      outcome: 'preserve',
      reason: 'modifiedOutside',
    });
  });

  it('preserves a file somebody deleted after the session wrote it', () => {
    expect(verdictFor(checkpoint(), baseline('after'), absent)).toMatchObject({
      outcome: 'preserve',
      reason: 'modifiedOutside',
    });
  });

  it('preserves a file somebody recreated after the undo had removed it', () => {
    expect(
      verdictFor(checkpoint({ existedBefore: 'absent', hash: null }), baseline(null), file('x')),
    ).toMatchObject({ outcome: 'preserve', reason: 'modifiedOutside' });
  });

  it('restores a file exactly as the session left it — S-37', () => {
    const before = checkpoint();

    expect(verdictFor(before, baseline('after'), file('after'))).toEqual({
      path: '/srv/a.md',
      outcome: 'revert',
      action: 'restore',
      checkpoint: before,
    });
  });

  it('puts back a file the undo had removed, when going further back', () => {
    expect(verdictFor(checkpoint(), baseline(null), absent)).toMatchObject({
      outcome: 'revert',
      action: 'restore',
    });
  });

  it('deletes a file the turn created — S-37', () => {
    expect(
      verdictFor(checkpoint({ existedBefore: 'absent', hash: null }), baseline('new'), file('new')),
    ).toMatchObject({ outcome: 'revert', action: 'delete' });
  });
});

describe('the plan of a point', () => {
  it('judges every path the point reaches, and treats one nobody looked at as unsafe', () => {
    const point = undoPointNamed(
      undoPointsOf([checkpoint(), checkpoint({ path: '/srv/b.md' })]),
      'p1',
    );
    const plan = planFor(
      point,
      new Map([['/srv/a.md', baseline('after')]]),
      new Map([['/srv/a.md', file('after')]]),
    );

    expect(plan.map((verdict) => [verdict.path, verdict.outcome])).toEqual([
      ['/srv/a.md', 'revert'],
      ['/srv/b.md', 'preserve'],
    ]);
    expect(plan[1]).toMatchObject({ reason: 'unsafePath' });
  });

  it('takes, per path, the baseline written last across the sessions of the conversation', () => {
    const older = baseline('older', 1);
    const newer = baseline('newer', 9);
    const other = baseline('other', 2, '/srv/b.md');

    const latest = latestBaselines([newer, older, other]);

    expect(latest.get('/srv/a.md')).toBe(newer);
    expect(latestBaselines([older, newer]).get('/srv/a.md')).toBe(newer);
    expect(latest.get('/srv/b.md')).toBe(other);
  });
});
