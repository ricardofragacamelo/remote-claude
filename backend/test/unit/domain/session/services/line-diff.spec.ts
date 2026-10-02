import { describe, expect, it } from 'vitest';

import {
  DIFF_CONTEXT_LINES,
  hunksBetween,
  lineCounts,
  lineTokens,
  MAX_EDIT_DISTANCE,
  snippetHunk,
  withHunkReverted,
} from '@domain/session';

/** A deterministic sequence of numbers in [0, 1), so a failing case can be found again. */
function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const lines = (...each: string[]): string => each.map((line) => `${line}\n`).join('');

describe('the difference between two texts, line by line', () => {
  describe('the tokens', () => {
    it('keeps each line with its own break, so joining them is the text again — S-140', () => {
      expect(lineTokens('a\r\nb\nc')).toEqual(['a\r\n', 'b\n', 'c']);
      expect(lineTokens('')).toEqual([]);
      expect(lineTokens('\n\n')).toEqual(['\n', '\n']);
    });
  });

  describe('the hunks', () => {
    it('has none for equal texts — eq', () => {
      expect(hunksBetween('same\n', 'same\n')).toEqual([]);
    });

    it('says where a change is, on both sides, and what surrounds it — eq', () => {
      const [hunk] = hunksBetween(lines('a', 'b', 'c', 'd', 'e'), lines('a', 'b', 'C', 'd', 'e'));

      expect(hunk).toMatchObject({ oldStart: 3, oldLines: 1, newStart: 3, newLines: 1 });
      expect(hunk?.lines).toEqual([
        { kind: 'context', text: 'a' },
        { kind: 'context', text: 'b' },
        { kind: 'removed', text: 'c' },
        { kind: 'added', text: 'C' },
        { kind: 'context', text: 'd' },
        { kind: 'context', text: 'e' },
      ]);
    });

    it('keeps two changes two hunks, however close — each is a choice of its own', () => {
      const hunks = hunksBetween(lines('a', 'b', 'c'), lines('A', 'b', 'C'));

      expect(hunks).toHaveLength(2);
      // The context of each stops where the other begins: no line is shown as both.
      expect(hunks[0]?.lines.map((line) => line.text)).toEqual(['a', 'A', 'b']);
      expect(hunks[1]?.lines.map((line) => line.text)).toEqual(['c', 'C']);
    });

    it(`shows at most ${String(DIFF_CONTEXT_LINES)} lines of context on each side — fron`, () => {
      const before = lines('1', '2', '3', '4', '5', 'x', '6', '7', '8', '9');
      const [hunk] = hunksBetween(before, before.replace('x\n', 'y\n'));

      expect(hunk?.lines.filter((line) => line.kind === 'context')).toHaveLength(
        2 * DIFF_CONTEXT_LINES,
      );
    });

    it('describes a pure insertion and a pure removal — fron', () => {
      expect(hunksBetween('', lines('new'))).toMatchObject([
        { oldStart: 1, oldLines: 0, newStart: 1, newLines: 1 },
      ]);
      expect(hunksBetween(lines('gone'), '')).toMatchObject([
        { oldStart: 1, oldLines: 1, newStart: 1, newLines: 0 },
      ]);
    });

    it('tells a missing final line break apart from one that is there — S-140', () => {
      const [hunk] = hunksBetween('a\nb\n', 'a\nb');

      expect(hunk?.lines).toEqual([
        { kind: 'context', text: 'a' },
        { kind: 'removed', text: 'b' },
        { kind: 'added', text: 'b' },
      ]);
    });

    it('names the same hunks the same way when asked twice — idem', () => {
      const before = lines('a', 'b', 'c');
      const after = lines('a', 'B', 'c', 'd');

      expect(hunksBetween(before, after).map((hunk) => hunk.id)).toEqual(
        hunksBetween(before, after).map((hunk) => hunk.id),
      );
    });

    it('counts what the hunks add and remove', () => {
      expect(lineCounts(hunksBetween(lines('a', 'b'), lines('A', 'b', 'c')))).toEqual({
        added: 2,
        removed: 1,
      });
      expect(lineCounts([])).toEqual({ added: 0, removed: 0 });
    });

    it(`gives up looking for the smallest set past ${String(MAX_EDIT_DISTANCE)} changes, and says it all changed — fron`, () => {
      const count = MAX_EDIT_DISTANCE + 2;
      const before = Array.from({ length: count }, (_, index) => `a${String(index)}\n`).join('');
      const after = Array.from({ length: count }, (_, index) => `b${String(index)}\n`).join('');
      const hunks = hunksBetween(before, after);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]).toMatchObject({ oldLines: count, newLines: count });
      expect(withHunkReverted(before, after, hunks[0]?.id ?? '')).toBe(before);
    });
  });

  describe('a small change as one hunk', () => {
    it('shows every line of both texts, the unchanged ones as context — S-104', () => {
      expect(snippetHunk('keep\nold\n', 'keep\nnew\n')?.lines).toEqual([
        { kind: 'context', text: 'keep' },
        { kind: 'removed', text: 'old' },
        { kind: 'added', text: 'new' },
      ]);
    });

    it('is nothing when the edit changed nothing', () => {
      expect(snippetHunk('same', 'same')).toBeNull();
    });
  });

  describe('putting one hunk back', () => {
    it('restores only that hunk, and leaves the others — S-138', () => {
      const before = lines('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i');
      const after = lines('A', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'I');
      const [first, second] = hunksBetween(before, after);

      expect(withHunkReverted(before, after, first?.id ?? '')).toBe(
        lines('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'I'),
      );
      expect(withHunkReverted(before, after, second?.id ?? '')).toBe(
        lines('A', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'),
      );
    });

    it('works on the first and the last byte, with and without a final break — S-140', () => {
      for (const [before, after] of [
        ['first\nrest', 'FIRST\nrest'],
        ['rest\nlast', 'rest\nLAST'],
        ['no break', 'no break\n'],
        ['a\r\nb\r\n', 'a\r\nB\r\n'],
      ] as const) {
        const [hunk] = hunksBetween(before, after);
        expect(withHunkReverted(before, after, hunk?.id ?? '')).toBe(before);
      }
    });

    it('finds no hunk by an id that is not one of them — err', () => {
      expect(withHunkReverted('a\n', 'b\n', 'h-nothing')).toBeNull();
    });

    it('brings the old text back, byte for byte, whatever order the hunks go back in', () => {
      const random = sequence(7);

      for (let round = 0; round < 300; round += 1) {
        const size = Math.floor(random() * 12);
        const old = Array.from(
          { length: size },
          () => `${String.fromCharCode(97 + Math.floor(random() * 4))}\n`,
        );
        const changed = old
          .filter(() => random() > 0.3)
          .flatMap((line) =>
            random() > 0.7 ? [line, `x${String(Math.floor(random() * 3))}\n`] : [line],
          );
        if (random() > 0.5 && changed.length > 0) {
          changed[changed.length - 1] = (changed.at(-1) ?? '').replace('\n', '');
        }

        const before = old.join('');
        let now = changed.join('');

        for (let hunks = hunksBetween(before, now); hunks.length > 0;) {
          const pick = hunks[Math.floor(random() * hunks.length)];
          now = withHunkReverted(before, now, pick?.id ?? '') ?? 'lost';
          hunks = hunksBetween(before, now);
        }

        expect(now).toBe(before);
      }
    });
  });
});
