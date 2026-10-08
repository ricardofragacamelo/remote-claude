import { describe, expect, it } from 'vitest';

import { clipOutput } from '@domain/transcript';

const KIB = 1_024;

describe('clipOutput — plan 22, B-11, D-08', () => {
  it('serves an output at the ceiling whole — S-23', () => {
    const text = 'a'.repeat(256 * KIB);

    expect(clipOutput(text, 256 * KIB)).toEqual({ text, truncated: false, bytes: 256 * KIB });
  });

  it('serves the first and the last half of one past it, and where it cut — S-23', () => {
    const text = `${'h'.repeat(128 * KIB)}x${'t'.repeat(128 * KIB)}`;
    const output = clipOutput(text, 256 * KIB);

    expect(output.truncated).toBe(true);
    expect(output.bytes).toBe(256 * KIB + 1);
    expect(output.text).toBe(`${'h'.repeat(128 * KIB)}${'t'.repeat(128 * KIB)}`);
    expect(output.cutAt).toBe(128 * KIB);
  });

  it('counts bytes of UTF-8, and never cuts inside a character', () => {
    // Twelve characters of three bytes each: 36 bytes, cut to 10 — five on each side, which no
    // character boundary matches, so one whole character is kept on each side.
    const output = clipOutput('€'.repeat(12), 10);

    expect(output).toEqual({ text: '€€', truncated: true, bytes: 36, cutAt: 1 });
  });

  it('keeps nothing of either side under a ceiling smaller than a character', () => {
    expect(clipOutput('€€', 1)).toEqual({ text: '', truncated: true, bytes: 6, cutAt: 0 });
  });

  it('serves an empty output as itself', () => {
    expect(clipOutput('', 10)).toEqual({ text: '', truncated: false, bytes: 0 });
  });
});
