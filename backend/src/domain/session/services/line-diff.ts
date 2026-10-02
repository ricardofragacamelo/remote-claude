/**
 * The difference between two texts, line by line — what the diffs of plan 08 (F3) are made of.
 *
 * Ours and not a library's, for two reasons. The domain is plain TypeScript, and a diff is a rule:
 * which lines count as one change is what a person later rejects, so it is decided here, once, for
 * the diff of a tool, the changes of a session and the rejection of a hunk alike. And the rejection
 * needs something a display diff does not: putting one hunk back **byte for byte**, the line
 * breaks of the file included, so a file without a final line break or with CRLF stays what it was.
 *
 * That is why a line here keeps its own break: the texts are cut into **tokens**, each a line with
 * the `\n` that ends it (the last one may have none), and joining the tokens gives the text back
 * exactly (S-140).
 */

/** One line of a hunk, as a screen draws it. */
export interface DiffLine {
  readonly kind: 'context' | 'added' | 'removed';

  /** Without its line break. */
  readonly text: string;
}

/**
 * One change: a run of lines that differ, with a little of what surrounds it.
 *
 * Each run of changed lines is a hunk of its own, however close to the next one: a hunk is what a
 * person rejects, and two changes merged because they were three lines apart would be one choice
 * where the person saw two.
 */
export interface DiffHunk {
  /**
   * Names the hunk for a rejection. The same texts give the same ids; any change to either side
   * may change them all, which is why a rejection also carries the revision it was computed on.
   */
  readonly id: string;

  /** The first line of the hunk's removed lines on the old side, from 1 — or where it inserts. */
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: readonly DiffLine[];
}

/** How many unchanged lines a hunk shows on each side of its change. */
export const DIFF_CONTEXT_LINES = 3;

/**
 * How many changes the diff looks for before it gives up on finding the smallest set.
 *
 * The search costs memory in the square of this number. Past it, everything between the common
 * start and the common end becomes one change — larger than it needs to be, never wrong.
 */
export const MAX_EDIT_DISTANCE = 2_000;

/** A run of changed tokens: `[aStart, aEnd)` of the old side became `[bStart, bEnd)` of the new. */
interface Block {
  readonly aStart: number;
  readonly aEnd: number;
  readonly bStart: number;
  readonly bEnd: number;
}

/** The lines of a text, each with its own line break — joined, they are the text again. */
export function lineTokens(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** The hunks that turn `before` into `after`. Equal texts have none. */
export function hunksBetween(
  before: string,
  after: string,
  context: number = DIFF_CONTEXT_LINES,
): DiffHunk[] {
  const a = lineTokens(before);
  const b = lineTokens(after);

  return blocksOf(a, b).map((block, index, blocks) => {
    const previous = blocks[index - 1];

    // The context after a hunk stops where the next begins, and the next shows only what the one
    // before it did not: no line is drawn in two hunks.
    return hunkOf(a, b, block, {
      contextFrom: Math.max(
        previous === undefined ? 0 : Math.min(block.aStart, previous.aEnd + context),
        block.aStart - context,
      ),
      contextTo: Math.min(blocks[index + 1]?.aStart ?? a.length, block.aEnd + context),
    });
  });
}

/**
 * The whole of a small change as **one** hunk: every line of both texts, the unchanged ones as
 * context — what an `Edit` replaced, when the file around it is not known.
 */
export function snippetHunk(before: string, after: string): DiffHunk | null {
  const a = lineTokens(before);
  const b = lineTokens(after);
  const blocks = blocksOf(a, b);

  if (blocks.length === 0) {
    return null;
  }

  const lines: DiffLine[] = [];
  let aAt = 0;

  for (const block of blocks) {
    lines.push(...a.slice(aAt, block.aStart).map((token) => line('context', token)));
    lines.push(...a.slice(block.aStart, block.aEnd).map((token) => line('removed', token)));
    lines.push(...b.slice(block.bStart, block.bEnd).map((token) => line('added', token)));
    aAt = block.aEnd;
  }
  lines.push(...a.slice(aAt).map((token) => line('context', token)));

  return {
    id: hunkIdOf(a, b, { aStart: 0, aEnd: a.length, bStart: 0, bEnd: b.length }),
    oldStart: 1,
    oldLines: a.length,
    newStart: 1,
    newLines: b.length,
    lines,
  };
}

/**
 * `after` with one of its hunks put back the way `before` had it — the rest of `after` untouched,
 * byte for byte.
 *
 * @returns the new text, or `null` when no hunk between the two has that id
 */
export function withHunkReverted(before: string, after: string, hunkId: string): string | null {
  const a = lineTokens(before);
  const b = lineTokens(after);
  const block = blocksOf(a, b).find((candidate) => hunkIdOf(a, b, candidate) === hunkId);

  if (block === undefined) {
    return null;
  }

  return [
    ...b.slice(0, block.bStart),
    ...a.slice(block.aStart, block.aEnd),
    ...b.slice(block.bEnd),
  ].join('');
}

/** How many lines the hunks add and remove, in all. */
export function lineCounts(hunks: readonly DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;

  for (const hunk of hunks) {
    added += hunk.newLines;
    removed += hunk.oldLines;
  }

  return { added, removed };
}

/** A hunk of `block`, with context from `contextFrom` to `contextTo` on the old side. */
function hunkOf(
  a: readonly string[],
  b: readonly string[],
  block: Block,
  around: { readonly contextFrom: number; readonly contextTo: number },
): DiffHunk {
  const leading = a.slice(around.contextFrom, block.aStart);
  const trailing = a.slice(block.aEnd, around.contextTo);

  return {
    id: hunkIdOf(a, b, block),
    oldStart: block.aStart + 1,
    oldLines: block.aEnd - block.aStart,
    newStart: block.bStart + 1,
    newLines: block.bEnd - block.bStart,
    lines: [
      ...leading.map((token) => line('context', token)),
      ...a.slice(block.aStart, block.aEnd).map((token) => line('removed', token)),
      ...b.slice(block.bStart, block.bEnd).map((token) => line('added', token)),
      ...trailing.map((token) => line('context', token)),
    ],
  };
}

function line(kind: DiffLine['kind'], token: string): DiffLine {
  return { kind, text: token.replace(/\r?\n$/, '') };
}

/** The runs of changed tokens, in order. */
function blocksOf(a: readonly string[], b: readonly string[]): Block[] {
  // The common start and end are cut first: most changes are local, and the search below then
  // looks only at the part that moved.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }

  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end += 1;
  }

  const middleA = a.slice(start, a.length - end);
  const middleB = b.slice(start, b.length - end);

  if (middleA.length === 0 && middleB.length === 0) {
    return [];
  }

  const found = shortestBlocks(middleA, middleB) ?? [
    { aStart: 0, aEnd: middleA.length, bStart: 0, bEnd: middleB.length },
  ];

  return found.map((block) => ({
    aStart: block.aStart + start,
    aEnd: block.aEnd + start,
    bStart: block.bStart + start,
    bEnd: block.bEnd + start,
  }));
}

/**
 * The smallest set of changed runs — Myers' algorithm, forward, with the frontier of each step kept
 * for the walk back.
 *
 * @returns the runs, or `null` past {@link MAX_EDIT_DISTANCE}
 */
function shortestBlocks(a: readonly string[], b: readonly string[]): Block[] | null {
  const trace = frontiers(a, b);
  return trace === null ? null : walkBack(a.length, b.length, trace);
}

/**
 * The furthest reach of every diagonal, step by step, until both texts are consumed.
 *
 * `trace[d]` holds the frontier **before** step `d`, for diagonals `-(d+1)…d+1` — what the walk
 * back reads, and no more: keeping the whole array at every step would cost the length of the
 * texts times the number of changes.
 */
function frontiers(a: readonly string[], b: readonly string[]): Int32Array[] | null {
  const n = a.length;
  const m = b.length;
  const offset = n + m + 1;
  const reach = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= Math.min(n + m, MAX_EDIT_DISTANCE); d += 1) {
    trace.push(reach.slice(offset - d - 1, offset + d + 2));

    for (let k = -d; k <= d; k += 2) {
      const at = (diagonal: number): number => reach[offset + diagonal] ?? 0;
      const x = slide(a, b, descends(k, d, at) ? at(k + 1) : at(k - 1) + 1, k);

      reach[offset + k] = x;

      if (x >= n && x - k >= m) {
        return trace;
      }
    }
  }

  return null;
}

/** How far the diagonal `k` runs from `x` while the two texts agree. */
function slide(a: readonly string[], b: readonly string[], from: number, k: number): number {
  let x = from;

  while (x < a.length && x - k < b.length && a[x] === b[x - k]) {
    x += 1;
  }

  return x;
}

/** Whether the path into diagonal `k` at step `d` comes down from `k + 1` (an insertion). */
function descends(k: number, d: number, at: (diagonal: number) => number): boolean {
  return k === -d || (k !== d && at(k - 1) < at(k + 1));
}

/** The changed runs, read back from the frontiers. */
function walkBack(n: number, m: number, trace: readonly Int32Array[]): Block[] {
  const removed = new Set<number>();
  const added = new Set<number>();
  let x = n;
  let y = m;

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const frontier = trace[d] as Int32Array;
    const at = (diagonal: number): number => frontier[diagonal + d + 1] ?? 0;
    const k = x - y;
    const previousK = descends(k, d, at) ? k + 1 : k - 1;
    const previousX = at(previousK);
    const previousY = previousX - previousK;

    // What lies between the step and (x, y) is a diagonal — equal lines, nothing to record. The step
    // itself is the change: down is a line of `b` inserted, right is a line of `a` removed.
    if (previousK === k + 1) {
      added.add(previousY);
    } else {
      removed.add(previousX);
    }

    x = previousX;
    y = previousY;
  }

  return runsOf(n, m, removed, added);
}

/** Groups single changed lines into runs, walking both sides in step. */
function runsOf(
  n: number,
  m: number,
  removed: ReadonlySet<number>,
  added: ReadonlySet<number>,
): Block[] {
  const blocks: Block[] = [];
  let x = 0;
  let y = 0;

  while (x < n || y < m) {
    if (!removed.has(x) && !added.has(y)) {
      x += 1;
      y += 1;
      continue;
    }

    const aStart = x;
    const bStart = y;
    while (removed.has(x)) {
      x += 1;
    }
    while (added.has(y)) {
      y += 1;
    }
    blocks.push({ aStart, aEnd: x, bStart, bEnd: y });
  }

  return blocks;
}

/**
 * The id of a hunk: where it is and what it changes, hashed.
 *
 * FNV-1a, twice with different seeds — a name, not a security property: what keeps a rejection
 * from landing on the wrong text is the revision it carries, checked before anything is written.
 */
function hunkIdOf(a: readonly string[], b: readonly string[], block: Block): string {
  const text = [
    `${String(block.aStart)}:${String(block.bStart)}`,
    a.slice(block.aStart, block.aEnd).join(''),
    b.slice(block.bStart, block.bEnd).join(''),
  ].join('\u0000');

  return `h${fnv(text, 0x811c9dc5)}${fnv(text, 0x01000193)}`;
}

function fnv(text: string, seed: number): string {
  let hash = seed >>> 0;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}
