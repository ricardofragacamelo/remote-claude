import { describe, expect, it } from 'vitest';

import { matchPreviewOf } from '@domain/search';

describe('matchPreviewOf — S-66', () => {
  it('keeps the whole line when it already fits inside the window', () => {
    const preview = matchPreviewOf('a needle in a line', 2, 8, 250);

    expect(preview).toEqual({ text: 'a needle in a line', matchStart: 2, matchEnd: 8 });
  });

  it('crops a long line to the window around the match', () => {
    const line = `${'x'.repeat(2000)}NEEDLE${'y'.repeat(2000)}`;

    const preview = matchPreviewOf(line, 2000, 2006, 10);

    expect(preview.text).toBe(`${'x'.repeat(10)}NEEDLE${'y'.repeat(10)}`);
    expect(preview.matchStart).toBe(10);
    expect(preview.matchEnd).toBe(16);
    expect(preview.text.length).toBeLessThan(line.length);
  });

  it('does not crop past the start of the line', () => {
    const preview = matchPreviewOf('NEEDLE and the rest', 0, 6, 3);

    expect(preview.text).toBe('NEEDLE an');
    expect(preview.matchStart).toBe(0);
    expect(preview.matchEnd).toBe(6);
  });

  it('does not crop past the end of the line', () => {
    const preview = matchPreviewOf('before the NEEDLE', 11, 17, 3);

    expect(preview.text).toBe('he NEEDLE');
    expect(preview.matchEnd).toBe(preview.text.length);
  });
});
