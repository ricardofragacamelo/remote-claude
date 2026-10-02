import { describe, expect, it } from 'vitest';

import { ClaudeWrites } from '@application/files';

const at = (seconds: number): Date => new Date(Date.UTC(2026, 8, 30, 12, 0, seconds));

describe('ClaudeWrites — what Claude wrote lately — B-18', () => {
  it('knows a write by its path and its hash, while it is recent', () => {
    const writes = new ClaudeWrites(10_000);
    writes.record({ path: '/srv/a.ts', hash: 'h1', at: at(0) });

    expect(writes.wrote('/srv/a.ts', 'h1', at(5))).toBe(true);
    expect(writes.wrote('/srv/a.ts', 'h2', at(5))).toBe(false);
    expect(writes.wrote('/srv/b.ts', 'h1', at(5))).toBe(false);
    expect(writes.wrote('/srv/a.ts', 'h1', at(11))).toBe(false);
  });

  it('keeps the latest write of a path', () => {
    const writes = new ClaudeWrites();
    writes.record({ path: '/srv/a.ts', hash: 'h1', at: at(0) });
    writes.record({ path: '/srv/a.ts', hash: 'h2', at: at(1) });

    expect(writes.wrote('/srv/a.ts', 'h1', at(1))).toBe(false);
    expect(writes.wrote('/srv/a.ts', 'h2', at(1))).toBe(true);
  });

  it('forgets the oldest once it holds as many as it may', () => {
    const writes = new ClaudeWrites(60_000, 2);
    writes.record({ path: '/srv/a', hash: 'a', at: at(0) });
    writes.record({ path: '/srv/b', hash: 'b', at: at(1) });
    writes.record({ path: '/srv/a', hash: 'a', at: at(2) });
    writes.record({ path: '/srv/c', hash: 'c', at: at(3) });

    expect(writes.wrote('/srv/b', 'b', at(3))).toBe(false);
    expect(writes.wrote('/srv/a', 'a', at(3))).toBe(true);
    expect(writes.wrote('/srv/c', 'c', at(3))).toBe(true);
  });
});
