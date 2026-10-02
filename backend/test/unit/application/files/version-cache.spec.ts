import { describe, expect, it } from 'vitest';

import { RACY_CHANGE_MS, VersionCache } from '@application/files';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { fakeRawFile } from '../../../support/fakes/fake-raw-file';
import type { FakeRawFile } from '../../../support/fakes/fake-raw-file';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const LONG_AGO = new Date(NOW.getTime() - 60_000);

const fileWith = (identity: string, changedAt = LONG_AGO): FakeRawFile =>
  fakeRawFile(Buffer.from(identity), { identity, changedAt });

/** The versions of the raw route, remembered by the identity of the file — plan 07, B-48. */
describe('VersionCache', () => {
  it('hashes a file once, and answers every page after from memory', async () => {
    const versions = new VersionCache(new FixedClock(NOW));
    const file = fileWith('1:2:3:4:5');

    const first = await versions.of(file);
    const second = await versions.of(file);

    expect(second).toEqual(first);
    expect(file.digests).toBe(1);
    expect(versions.size).toBe(1);
  });

  it('hashes again when the identity changed — the file was written since', async () => {
    const versions = new VersionCache(new FixedClock(NOW));

    await versions.of(fileWith('1:2:3:4:5'));
    const changed = fileWith('1:2:3:4:6');
    await versions.of(changed);

    expect(changed.digests).toBe(1);
    expect(versions.size).toBe(2);
  });

  it('never remembers a change too recent to trust the identity with — racy', async () => {
    const versions = new VersionCache(new FixedClock(NOW));
    const racy = fileWith('1:2:3:4:5', new Date(NOW.getTime() - RACY_CHANGE_MS + 1));

    await versions.of(racy);
    await versions.of(racy);

    expect(racy.digests).toBe(2);
    expect(versions.size).toBe(0);
  });

  it('remembers a change exactly as old as the window — fron', async () => {
    const versions = new VersionCache(new FixedClock(NOW));

    await versions.of(fileWith('a', new Date(NOW.getTime() - RACY_CHANGE_MS)));

    expect(versions.size).toBe(1);
  });

  it('lets the least recently used go past the ceiling', async () => {
    const versions = new VersionCache(new FixedClock(NOW), 2);
    const a = fileWith('a');

    await versions.of(a);
    await versions.of(fileWith('b'));
    await versions.of(a);
    await versions.of(fileWith('c'));
    await versions.of(a);
    const b = fileWith('b');
    await versions.of(b);

    expect(a.digests).toBe(1);
    expect(b.digests).toBe(1);
    expect(versions.size).toBe(2);
  });
});
