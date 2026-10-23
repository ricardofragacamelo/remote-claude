import type { Hunk, HunkLine } from '@/shared/lib/diff-hunk';
import type { McpProjectVariable, ProjectMcpServer } from '@remote-claude/contracts';

/** The shape both sides of the diff share — a current entry, or what an approval kept of one. */
export interface DiffableEntry {
  readonly transport: ProjectMcpServer['transport'];
  readonly command: string | null;
  readonly args: readonly string[];
  readonly url: string | null;
  readonly env: readonly McpProjectVariable[];
  readonly headers: readonly McpProjectVariable[];
}

const NONE = '(none)';

function variableLines(entries: readonly McpProjectVariable[]): readonly string[] {
  return entries.length === 0
    ? [`  ${NONE}`]
    : [...entries]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((v) => `  ${v.name}=${v.value}`);
}

/**
 * [entry] as a small, deterministic block of text — one field per line, sorted where order is not
 * meaningful (`env`, `headers`): the chosen representation for the line diff of S-136, plain enough
 * that a changed field shows as exactly the lines that changed, never a reshuffle of ones that did
 * not (plan 13, B-28). Not the por-extenso description: that reads as a sentence, which a line diff
 * would tear apart at every word a value changes.
 */
export function linesOf(entry: DiffableEntry): readonly string[] {
  return [
    `transport: ${entry.transport}`,
    `command: ${entry.command ?? NONE}`,
    `args: ${entry.args.length === 0 ? NONE : entry.args.join(' ')}`,
    `url: ${entry.url ?? NONE}`,
    'env:',
    ...variableLines(entry.env),
    'headers:',
    ...variableLines(entry.headers),
  ];
}

/**
 * The longest common subsequence of [a] and [b], by index — the classic dynamic-programming table,
 * fine for the handful of lines an MCP entry ever has (plan 13, B-28). Answers the matched index
 * pairs, in order.
 */
function lcsPairs(a: readonly string[], b: readonly string[]): readonly [number, number][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/** A plain line diff of [before] against [after] — context, removed and added lines, in order. */
export function diffLines(before: readonly string[], after: readonly string[]): HunkLine[] {
  const pairs = lcsPairs(before, after);
  const lines: HunkLine[] = [];
  let i = 0;
  let j = 0;

  for (const [matchI, matchJ] of pairs) {
    while (i < matchI) {
      lines.push({ kind: 'removed', text: before[i]! });
      i += 1;
    }
    while (j < matchJ) {
      lines.push({ kind: 'added', text: after[j]! });
      j += 1;
    }
    lines.push({ kind: 'context', text: before[matchI]! });
    i = matchI + 1;
    j = matchJ + 1;
  }
  while (i < before.length) {
    lines.push({ kind: 'removed', text: before[i]! });
    i += 1;
  }
  while (j < after.length) {
    lines.push({ kind: 'added', text: after[j]! });
    j += 1;
  }

  return lines;
}

/**
 * The diff of a project MCP entry that changed since it was approved (S-136): one hunk, the
 * approved snapshot on the left, the file's current content on the right. `null` when the approval
 * kept no snapshot — a decision from before D-80, which has nothing to diff against.
 */
export function projectEntryDiffHunks(
  approved: DiffableEntry | null,
  current: DiffableEntry,
): readonly Hunk[] {
  if (approved === null) {
    return [];
  }

  const lines = diffLines(linesOf(approved), linesOf(current));
  return [{ id: 'project-entry', oldStart: 1, newStart: 1, lines }];
}
