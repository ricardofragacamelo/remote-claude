import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { Etag, needsHash, originOf } from '@domain/files';
import type { WriteMark } from '@domain/files';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const at = (seconds: number): Date => new Date(Date.UTC(2026, 9, 1, 12, 0, seconds));

const claudeWrote = (text: string, seconds = 0): WriteMark => ({
  by: 'claude',
  at: at(seconds),
  left: { kind: 'content', hash: sha(text) },
});
const userWrote = (text: string, seconds = 0): WriteMark => ({
  by: 'user',
  at: at(seconds),
  left: { kind: 'content', hash: sha(text) },
});
const userRemoved: WriteMark = { by: 'user', at: at(0), left: { kind: 'removed' } };
const userCopiedFolder: WriteMark = { by: 'user', at: at(0), left: { kind: 'anything' } };

const onDisk = (text: string): Etag => Etag.ofDigest(sha(text));

describe('who changed a path — B-22', () => {
  it('is claude when the bytes are what a recent write of Claude left — S-148', () => {
    expect(originOf('changed', [claudeWrote('x')], onDisk('x'))).toBe('claude');
  });

  it("is user when the bytes are the person's save — S-149", () => {
    expect(originOf('created', [userWrote('y')], onDisk('y'))).toBe('user');
  });

  it("is user for a deletion the person made, and for a folder's inside they copied — S-149", () => {
    expect(originOf('deleted', [userRemoved], null)).toBe('user');
    expect(originOf('created', [userCopiedFolder], null)).toBe('user');
  });

  it('is external when nothing matches — S-150', () => {
    expect(originOf('changed', [], onDisk('x'))).toBe('external');
    expect(originOf('changed', [claudeWrote('x')], onDisk('somebody else'))).toBe('external');
    expect(originOf('deleted', [claudeWrote('x')], null)).toBe('external');
    expect(originOf('changed', [userRemoved], onDisk('x'))).toBe('external');
    expect(originOf('changed', [claudeWrote('x')], null)).toBe('external');
  });

  it('goes by the final bytes when both wrote the file in the window, never inventing — S-151', () => {
    const both = [claudeWrote('claude', 1), userWrote('person', 2)];

    expect(originOf('changed', both, onDisk('claude'))).toBe('claude');
    expect(originOf('changed', both, onDisk('person'))).toBe('user');
    expect(originOf('changed', both, onDisk('a third party'))).toBe('external');
  });

  it('gives the same bytes written twice to the later write', () => {
    expect(
      originOf('changed', [claudeWrote('same', 1), userWrote('same', 2)], onDisk('same')),
    ).toBe('user');
    expect(
      originOf('changed', [userWrote('same', 2), claudeWrote('same', 3)], onDisk('same')),
    ).toBe('claude');
    expect(
      originOf('changed', [userWrote('same', 4), claudeWrote('same', 3)], onDisk('same')),
    ).toBe('user');
  });
});

describe('when the bytes are read — B-22', () => {
  it('reads them only when a write left known bytes to compare with', () => {
    expect(needsHash('changed', [])).toBe(false);
    expect(needsHash('changed', [userCopiedFolder])).toBe(false);
    expect(needsHash('changed', [claudeWrote('x')])).toBe(true);
    expect(needsHash('deleted', [claudeWrote('x')])).toBe(false);
  });
});
