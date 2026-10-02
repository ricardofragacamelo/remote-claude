import { describe, expect, it } from 'vitest';

import { rangeOf } from '@domain/files';

/**
 * The `Range` of `GET /files/raw`, as RFC 9110 reads it — plan 07, B-48: one range is a part,
 * anything else the server is free to ignore is the whole file, and past the end is a `416`.
 */
describe('rangeOf', () => {
  it('serves the whole file without a header', () => {
    expect(rangeOf(null, 10)).toEqual({ kind: 'whole' });
  });

  it.each([
    ['bytes=0-3', { start: 0, end: 3 }],
    ['bytes=4-', { start: 4, end: 9 }],
    ['bytes=-3', { start: 7, end: 9 }],
    ['bytes=2-2', { start: 2, end: 2 }],
    [' BYTES = 1 - 2 ', { start: 1, end: 2 }],
  ])('reads %s as one part of a 10-byte file — S-294', (header, part) => {
    expect(rangeOf(header, 10)).toEqual({ kind: 'part', ...part });
  });

  it('cuts an end past the file to its last byte — fron', () => {
    expect(rangeOf('bytes=8-1000', 10)).toEqual({ kind: 'part', start: 8, end: 9 });
  });

  it('gives a suffix longer than the file the whole of it, as a part — fron', () => {
    expect(rangeOf('bytes=-50', 10)).toEqual({ kind: 'part', start: 0, end: 9 });
  });

  it.each(['bytes=10-', 'bytes=10-20', 'bytes=99999999999999999999-'])(
    'refuses %s, which starts at or past the end of a 10-byte file — S-295',
    (header) => {
      expect(rangeOf(header, 10)).toEqual({ kind: 'unsatisfiable' });
    },
  );

  it('refuses a suffix of nothing, and any range of an empty file — fron', () => {
    expect(rangeOf('bytes=-0', 10)).toEqual({ kind: 'unsatisfiable' });
    expect(rangeOf('bytes=-5', 0)).toEqual({ kind: 'unsatisfiable' });
    expect(rangeOf('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
  });

  it.each([
    ['bytes=0-1,4-5', 'more than one range'],
    ['items=0-1', 'another unit'],
    ['bytes=-', 'neither end'],
    ['bytes=5-2', 'an end before its start'],
    ['bytes=a-b', 'no numbers'],
    ['', 'an empty header'],
  ])('ignores %s (%s) and serves the whole file', (header) => {
    expect(rangeOf(header, 10)).toEqual({ kind: 'whole' });
  });
});
