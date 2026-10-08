import { describe, expect, it } from 'vitest';

import { base64Size } from '@domain/shared';

describe('base64Size — plan 22, B-09', () => {
  it.each([
    ['nothing', '', 0],
    ['no padding', 'AAAA', 3],
    ['one `=`', 'AAAAAA==', 4],
    ['two `=`', 'AAAAAAA=', 5],
    ['line-wrapped', 'AAAA\nAAAA\r\n', 6],
  ])('counts the bytes of %s without decoding them', (_, data, bytes) => {
    expect(base64Size(data)).toBe(bytes);
  });

  it('agrees with a real decode', () => {
    const bytes = Buffer.from('a red square, sixteen by sixteen');

    expect(base64Size(bytes.toString('base64'))).toBe(bytes.length);
  });
});
