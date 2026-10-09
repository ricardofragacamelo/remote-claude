import { describe, expect, it, vi } from 'vitest';

import { createDrawQueue } from '@/features/editor/lib/draw-queue';
import { countOf, keptResult } from '@/features/editor/lib/pdf-find';
import { outlineMove, outlineRows } from '@/features/editor/lib/pdf-outline';
import type { PdfOutlineItem } from '@/features/editor/types/pdf';

/** An outline entry, with the entries under it. */
function entry(title: string, items: PdfOutlineItem[] = []): PdfOutlineItem {
  return { title, dest: title, items };
}

const OUTLINE = [
  entry('Part one', [entry('Chapter one', [entry('Section 1.1')]), entry('Chapter two')]),
  entry('Part two', [entry('Chapter three')]),
  entry('Appendix'),
];

describe('the rows of the outline — plan 21, B-12', () => {
  it('shows the first level, with the place of each among its siblings', () => {
    const rows = outlineRows(OUTLINE, new Set());

    expect(
      rows.map((row) => [row.key, row.item.title, row.level, row.position, row.siblings]),
    ).toEqual([
      ['0', 'Part one', 1, 1, 3],
      ['1', 'Part two', 1, 2, 3],
      ['2', 'Appendix', 1, 3, 3],
    ]);
    expect(rows.map((row) => [row.expandable, row.expanded])).toEqual([
      [true, false],
      [true, false],
      [false, false],
    ]);
  });

  it('shows the entries under the open ones, depth first', () => {
    const rows = outlineRows(OUTLINE, new Set(['0', '0.0', '2']));

    expect(rows.map((row) => `${row.key}:${String(row.level)}:${String(row.parent)}`)).toEqual([
      '0:1:null',
      '0.0:2:0',
      '0.0.0:3:0.0',
      '0.1:2:0',
      '1:1:null',
      '2:1:null',
    ]);
    // An entry with nothing under it is never "open".
    expect(rows.at(-1)?.expanded).toBe(false);
  });

  it('draws an outline of 500 entries six levels deep as its first level (S-37)', () => {
    const deep = (level: number): PdfOutlineItem[] =>
      level > 6 ? [] : [entry(`level ${String(level)}`, deep(level + 1))];
    const outline = Array.from({ length: 500 }, (_, index) =>
      entry(`top ${String(index)}`, deep(2)),
    );

    const started = performance.now();
    const rows = outlineRows(outline, new Set());
    expect(rows).toHaveLength(500);
    expect(performance.now() - started).toBeLessThan(200);

    const opened = outlineRows(outline, new Set(['0', '0.0', '0.0.0', '0.0.0.0', '0.0.0.0.0']));
    expect(opened.slice(0, 6).map((row) => row.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('the keyboard of the outline — WAI-ARIA tree, S-33', () => {
  const closed = outlineRows(OUTLINE, new Set());
  const open = outlineRows(OUTLINE, new Set(['0']));

  it('moves up and down, and to the ends', () => {
    expect(outlineMove(closed, '0', 'ArrowDown')).toEqual({ focus: '1' });
    expect(outlineMove(closed, '1', 'ArrowUp')).toEqual({ focus: '0' });
    expect(outlineMove(closed, '0', 'ArrowUp')).toBeNull();
    expect(outlineMove(closed, '2', 'ArrowDown')).toBeNull();
    expect(outlineMove(open, '2', 'Home')).toEqual({ focus: '0' });
    expect(outlineMove(open, '0', 'End')).toEqual({ focus: '2' });
  });

  it('opens a closed entry with right, and goes into an open one', () => {
    expect(outlineMove(closed, '0', 'ArrowRight')).toEqual({ expand: '0' });
    expect(outlineMove(open, '0', 'ArrowRight')).toEqual({ focus: '0.0' });
    expect(outlineMove(closed, '2', 'ArrowRight')).toBeNull();
  });

  it('closes an open entry with left, and goes up from a child', () => {
    expect(outlineMove(open, '0', 'ArrowLeft')).toEqual({ collapse: '0' });
    expect(outlineMove(open, '0.1', 'ArrowLeft')).toEqual({ focus: '0' });
    expect(outlineMove(closed, '1', 'ArrowLeft')).toBeNull();
  });

  it('goes where the entry leads with Enter and Space, and leaves other keys alone', () => {
    expect(outlineMove(closed, '2', 'Enter')).toEqual({ open: closed[2] });
    expect(outlineMove(closed, '2', ' ')).toEqual({ open: closed[2] });
    expect(outlineMove(closed, '2', 'a')).toBeNull();
    expect(outlineMove(closed, 'gone', 'ArrowDown')).toBeNull();
  });
});

describe('the queue of the thumbnails — plan 21, D-11, S-42', () => {
  /** A drawing that ends when the test says. */
  function aDrawing() {
    let finish: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const signals: AbortSignal[] = [];
    const drawing = vi.fn(
      (signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          signals.push(signal);
          finish = resolve;
          fail = reject;
        }),
    );
    return { drawing, finish: () => finish(), fail: (error: Error) => fail(error), signals };
  }

  it('draws at most two at a time, the others in the order they came', async () => {
    const queue = createDrawQueue(2);
    const drawings = [aDrawing(), aDrawing(), aDrawing(), aDrawing()];
    for (const each of drawings) queue.draw(each.drawing, vi.fn());

    expect(drawings.map((each) => each.drawing.mock.calls.length)).toEqual([1, 1, 0, 0]);
    expect(queue.running()).toBe(2);

    drawings[0]?.finish();
    await vi.waitFor(() => {
      expect(drawings[2]?.drawing).toHaveBeenCalled();
    });
    expect(drawings[3]?.drawing).not.toHaveBeenCalled();
    expect(queue.running()).toBe(2);
  });

  it('gives up a drawing: out of the queue if it had not started, aborted if it had', async () => {
    const queue = createDrawQueue(1);
    const first = aDrawing();
    const second = aDrawing();
    const failed = vi.fn();
    const cancelFirst = queue.draw(first.drawing, failed);
    const cancelSecond = queue.draw(second.drawing, failed);

    cancelSecond();
    cancelFirst();
    expect(first.signals[0]?.aborted).toBe(true);
    first.fail(new Error('cancelled'));
    await vi.waitFor(() => {
      expect(queue.running()).toBe(0);
    });
    expect(second.drawing).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it('says a drawing failed on its own, and goes on', async () => {
    const queue = createDrawQueue(1);
    const broken = aDrawing();
    const next = aDrawing();
    const failed = vi.fn();
    queue.draw(broken.drawing, failed);
    queue.draw(next.drawing, vi.fn());

    broken.fail(new Error('bad page'));
    await vi.waitFor(() => {
      expect(next.drawing).toHaveBeenCalled();
    });
    expect(failed).toHaveBeenCalledWith(new Error('bad page'));
  });
});

describe('the count of a search — plan 21, B-14', () => {
  const result = (query: string, current: number, total: number, pending = false) => ({
    query,
    current,
    total,
    pending,
  });

  it('keeps only the result of the search on screen, typed fast (S-48)', () => {
    const kept = result('lig', 1, 9);
    expect(keptResult('light', kept, result('li', 1, 20))).toBe(kept);
    expect(keptResult('light', kept, result('light', 2, 4))).toEqual(result('light', 2, 4));
    expect(keptResult('light', null, result('lig', 1, 9))).toBeNull();
  });

  it('says nothing for no text, "n of m" when found, and "no results" once nothing matched (S-45, S-49)', () => {
    expect(countOf('', result('', 0, 0))).toEqual({ kind: 'none' });
    expect(countOf('light', null)).toEqual({ kind: 'searching' });
    expect(countOf('light', result('other', 1, 2))).toEqual({ kind: 'searching' });
    expect(countOf('light', result('light', 0, 0, true))).toEqual({ kind: 'searching' });
    expect(countOf('light', result('light', 2, 4, true))).toEqual({
      kind: 'found',
      current: 2,
      total: 4,
    });
    expect(countOf('zzz', result('zzz', 0, 0))).toEqual({ kind: 'empty' });
  });
});
