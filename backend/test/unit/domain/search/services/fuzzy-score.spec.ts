import { describe, expect, it } from 'vitest';

import { fuzzyScore } from '@domain/search';

describe('fuzzyScore', () => {
  it('answers null for an empty query', () => {
    expect(fuzzyScore('src/a.ts', '')).toBeNull();
  });

  it('answers null when the query is not a subsequence at all — S-41', () => {
    expect(fuzzyScore('src/a.ts', 'zzzzzzzzzzzzzzzzzzzz')).toBeNull();
    expect(fuzzyScore('src/a.ts', 'q')).toBeNull();
  });

  it('matches case-insensitively', () => {
    expect(fuzzyScore('src/A.ts', 'a')).not.toBeNull();
    expect(fuzzyScore('src/a.ts', 'A')).not.toBeNull();
  });

  it('matches a subsequence that spans a directory and the filename — S-39', () => {
    const match = fuzzyScore('web/src/features/session/components/SessionScreen.tsx', 'wbss');

    expect(match).not.toBeNull();
    expect(match?.positions).toHaveLength(4);
    // Ascending, and each a real occurrence of its letter (case-insensitively).
    const path = 'web/src/features/session/components/SessionScreen.tsx';
    const query = 'wbss';
    for (const [index, position] of (match?.positions ?? []).entries()) {
      expect(path.charAt(position).toLowerCase()).toBe(query.charAt(index));
    }
    expect([...(match?.positions ?? [])]).toEqual(
      [...(match?.positions ?? [])].slice().sort((a, b) => a - b),
    );
  });

  it('ranks a match inside the filename above one that only reaches the directory — S-39', () => {
    const inFilename = fuzzyScore('a/b/csession.ts', 'cs');
    const inDirectory = fuzzyScore('cs/a/b/session.ts', 'cs');

    expect(inFilename).not.toBeNull();
    expect(inDirectory).not.toBeNull();
    expect(inFilename!.score).toBeGreaterThan(inDirectory!.score);
  });

  it('ranks a contiguous match above a scattered one of the same filename depth — S-39', () => {
    const contiguous = fuzzyScore('src/abcdef.ts', 'abc');
    const scattered = fuzzyScore('src/axbxcx.ts', 'abc');

    expect(contiguous).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(contiguous!.score).toBeGreaterThan(scattered!.score);
  });

  it('ranks a word-start match above a mid-word match of the same filename depth — S-39', () => {
    const wordStart = fuzzyScore('src/foo_bar.ts', 'b');
    const midWord = fuzzyScore('src/fobaro.ts', 'b');

    expect(wordStart).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(wordStart!.score).toBeGreaterThan(midWord!.score);
  });

  it('breaks a tie between equally-good filename matches by preferring the shorter path — S-39', () => {
    const short = fuzzyScore('a.ts', 'a');
    const long = fuzzyScore('a-much-longer-file-name.ts', 'a');

    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    expect(short!.score).toBeGreaterThan(long!.score);
  });

  it('is stable: the same path and query always score and align the same way', () => {
    const first = fuzzyScore('web/src/features/session/SessionScreen.tsx', 'wbss');
    const second = fuzzyScore('web/src/features/session/SessionScreen.tsx', 'wbss');

    expect(first).toEqual(second);
  });
});
