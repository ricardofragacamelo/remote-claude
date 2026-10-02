import { describe, expect, it } from 'vitest';

import { dispositionOf } from '@adapter/inbound/http/files/content-disposition';

/** The `Content-Disposition` of a file of the user's — plan 07, B-48, D-18. */
describe('dispositionOf', () => {
  it('names a plain file the same way twice', () => {
    expect(dispositionOf('inline', 'logo.png')).toBe(
      `inline; filename="logo.png"; filename*=UTF-8''logo.png`,
    );
  });

  it('keeps the exact name in filename*, and an ASCII stand-in in filename', () => {
    expect(dispositionOf('attachment', 'açaí café.md')).toBe(
      `attachment; filename="a_a_ caf_.md"; filename*=UTF-8''a%C3%A7a%C3%AD%20caf%C3%A9.md`,
    );
  });

  it('never lets a name end the quoted string or add a header', () => {
    const header = dispositionOf('attachment', 'a"b\\c%d\r\nX-Evil: 1(*)\'.txt');

    expect(header).toBe(
      `attachment; filename="a_b_c_d__X-Evil: 1(*)'.txt"; filename*=UTF-8''a%22b%5Cc%25d%0D%0AX-Evil%3A%201%28%2A%29%27.txt`,
    );
    expect(header).not.toMatch(/[\r\n]/);
  });
});
