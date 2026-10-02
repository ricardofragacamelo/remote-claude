import { describe, expect, it } from 'vitest';

import { ChangeOrigins, ClaudeWrites, UserWrites } from '@application/files';
import { Etag } from '@domain/files';
import type { FilePath } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../support/fakes/fixed-clock';

const root = WorkspacePath.create('/srv/app');
const now = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
const bytes = Etag.of(Buffer.from('by claude\n'));

/** The labeller, over a disk that answers `version` from a table and counts how often it is asked. */
function labeller(versions: Readonly<Record<string, Etag | Error>>) {
  const read: string[] = [];
  const unreadable: string[] = [];
  const claude = new ClaudeWrites();
  const user = new UserWrites(new FixedClock(now));
  const origins = new ChangeOrigins(
    claude,
    user,
    {
      version: (file: FilePath) => {
        read.push(file.relative);
        const answer = versions[file.relative];
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer ?? null);
      },
    },
    new FixedClock(now),
    (path) => {
      unreadable.push(path);
    },
  );

  return { origins, claude, user, read, unreadable };
}

describe('ChangeOrigins — who made each change of a window — B-22', () => {
  it('labels external without reading a byte when nobody here wrote the path — S-150', async () => {
    const { origins, read } = labeller({});

    const labelled = await origins.label(root, [
      { path: 'a.ts', kind: 'changed' },
      { path: '', kind: 'deleted' },
    ]);

    expect(labelled).toEqual([
      { path: 'a.ts', kind: 'changed', origin: 'external' },
      { path: '', kind: 'deleted', origin: 'external' },
    ]);
    expect(read).toEqual([]);
  });

  it("reads the file to compare it with Claude's write, and labels it claude — S-148", async () => {
    const { origins, claude, read } = labeller({ 'a.ts': bytes });
    claude.record({ path: '/srv/app/a.ts', hash: bytes.digest, at: now });

    const labelled = await origins.label(root, [{ path: 'a.ts', kind: 'changed' }]);

    expect(labelled).toEqual([{ path: 'a.ts', kind: 'changed', origin: 'claude' }]);
    expect(read).toEqual(['a.ts']);
  });

  it("labels the person's delete user, without reading — S-149", async () => {
    const { origins, user, read } = labeller({});
    user.left('/srv/app/gone.ts', { kind: 'removed' }, false);

    const labelled = await origins.label(root, [{ path: 'gone.ts', kind: 'deleted' }]);

    expect(labelled).toEqual([{ path: 'gone.ts', kind: 'deleted', origin: 'user' }]);
    expect(read).toEqual([]);
  });

  it('labels external what cannot be read, and says so', async () => {
    const { origins, claude, unreadable } = labeller({ 'a.ts': new Error('EACCES') });
    claude.record({ path: '/srv/app/a.ts', hash: bytes.digest, at: now });

    const labelled = await origins.label(root, [{ path: 'a.ts', kind: 'changed' }]);

    expect(labelled).toEqual([{ path: 'a.ts', kind: 'changed', origin: 'external' }]);
    expect(unreadable).toEqual(['a.ts']);
  });
});
