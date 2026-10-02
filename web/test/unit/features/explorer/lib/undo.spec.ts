import { describe, expect, it } from 'vitest';

import { inverseOf, subjectOf } from '@/features/explorer/lib/undo';

describe('the inverse of an operation — S-184', () => {
  it('moves back what moved, the last first, with the version each left', () => {
    const steps = inverseOf({
      kind: 'move',
      items: [
        { from: 'a.ts', to: 'lib/a.ts', etag: '"1"' },
        { from: 'dir', to: 'lib/dir', etag: null },
      ],
    });

    expect(steps).toEqual([
      { op: 'move', from: 'lib/dir', to: 'dir', ifMatch: null },
      { op: 'move', from: 'lib/a.ts', to: 'a.ts', ifMatch: '"1"' },
    ]);
    expect(steps.map(subjectOf)).toEqual(['lib/dir', 'lib/a.ts']);
  });

  it('renames back a rename', () => {
    expect(inverseOf({ kind: 'rename', items: [{ from: 'a', to: 'b', etag: null }] })).toEqual([
      { op: 'move', from: 'b', to: 'a', ifMatch: null },
    ]);
  });

  it('deletes what was made — created or copied — only as it was made', () => {
    expect(inverseOf({ kind: 'copy', items: [{ path: 'a copy.ts', etag: '"2"' }] })).toEqual([
      { op: 'delete', path: 'a copy.ts', ifMatch: '"2"' },
    ]);
    const created = inverseOf({ kind: 'create', items: [{ path: 'n', etag: null }] });
    expect(created.map(subjectOf)).toEqual(['n']);
  });
});
