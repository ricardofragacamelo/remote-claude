import { describe, expect, it } from 'vitest';

import { diffableChangeOf, hunksBetween, snippetHunk, toolDiffOf } from '@domain/session';
import type { DiffHunk, DiskText, SnapshotText } from '@domain/session';
import { claudeTool } from '../../../../support/builders/tool.builder';

/**
 * The diff over the input of `Edit`, `MultiEdit` and `Write` as it was before plan 28 · F2, kept here
 * as the oracle: its "after" and its hunks, verbatim in substance
 * (`git show 925fdc4:backend/src/domain/session/services/session-diff.ts`). The "before" was never
 * read from the input, so the oracle takes it as the facts give it.
 */
type OldTool = 'Edit' | 'MultiEdit' | 'Write';

interface OldFacts {
  readonly toolName: OldTool;
  readonly input: Readonly<Record<string, unknown>>;
  readonly firstTouchInTurn: boolean;
  readonly lastWrite: boolean;
  readonly snapshot: SnapshotText;
  readonly disk: DiskText;
}

function oldBefore(facts: OldFacts): string | null {
  if (!facts.firstTouchInTurn) {
    return null;
  }
  if (facts.snapshot.kind === 'text') {
    return facts.snapshot.content;
  }
  return facts.snapshot.kind === 'absent' ? '' : null;
}

function oldAfter(facts: OldFacts): string | null {
  if (facts.toolName === 'Write') {
    const content = facts.input['content'];
    return typeof content === 'string' ? content : '';
  }
  if (!facts.lastWrite) {
    return null;
  }
  return facts.disk.kind === 'text' && facts.disk.asLeft ? facts.disk.content : null;
}

function oldReplacement(edit: Readonly<Record<string, unknown>>) {
  const from = edit['old_string'];
  const to = edit['new_string'];
  return { from: typeof from === 'string' ? from : '', to: typeof to === 'string' ? to : '' };
}

function oldEdits(facts: OldFacts) {
  if (facts.toolName === 'Edit') {
    return [oldReplacement(facts.input)];
  }
  if (facts.toolName === 'MultiEdit' && Array.isArray(facts.input['edits'])) {
    return (facts.input['edits'] as unknown[]).flatMap((edit) =>
      typeof edit === 'object' && edit !== null
        ? [oldReplacement(edit as Readonly<Record<string, unknown>>)]
        : [],
    );
  }
  return [];
}

function oldDiff(facts: OldFacts): {
  scope: 'file' | 'edit';
  after: string | null;
  hunks: DiffHunk[];
} {
  const before = oldBefore(facts);
  const after = oldAfter(facts);

  if (before !== null && after !== null) {
    return { scope: 'file', after, hunks: hunksBetween(before, after) };
  }

  return {
    scope: 'edit',
    after,
    hunks: oldEdits(facts).flatMap(({ from, to }) => {
      const hunk = snippetHunk(from, to);
      return hunk === null ? [] : [hunk];
    }),
  };
}

const FILE = '/srv/projects/app/app.js';
const BEFORE = "const greeting = 'hello';\nlog(greeting);\nexport {};\n";
const AFTER = "const greeting = 'hi';\nlog(greeting);\nexport {};\n";

/** The inputs each tool was called with — well formed, and the shapes the old reader tolerated. */
const CALLS: readonly (readonly [OldTool, Readonly<Record<string, unknown>>])[] = [
  ['Edit', { file_path: FILE, old_string: "'hello'", new_string: "'hi'" }],
  ['Edit', { file_path: FILE, old_string: 'a', new_string: 'b', replace_all: true }],
  ['Edit', { file_path: FILE }],
  ['Edit', { file_path: FILE, old_string: 'line\nother', new_string: '' }],
  [
    'MultiEdit',
    {
      file_path: FILE,
      edits: [
        { old_string: 'one', new_string: 'ONE' },
        { old_string: 'two', new_string: 'TWO', replace_all: true },
        'not an edit',
        null,
      ],
    },
  ],
  ['MultiEdit', { file_path: FILE, edits: [] }],
  ['MultiEdit', { file_path: FILE, edits: 'not a list' }],
  ['Write', { file_path: FILE, content: 'new\nfile\n' }],
  ['Write', { file_path: FILE }],
];

/** The facts besides the call: which side of the file is known, and what it holds. */
const SITUATIONS: readonly (readonly [string, Omit<OldFacts, 'toolName' | 'input'>])[] = [
  [
    'both sides known',
    {
      firstTouchInTurn: true,
      lastWrite: true,
      snapshot: { kind: 'text', content: BEFORE },
      disk: { kind: 'text', content: AFTER, asLeft: true },
    },
  ],
  [
    'a file the turn created',
    {
      firstTouchInTurn: true,
      lastWrite: true,
      snapshot: { kind: 'absent' },
      disk: { kind: 'text', content: AFTER, asLeft: true },
    },
  ],
  [
    'the disk changed since by hand',
    {
      firstTouchInTurn: true,
      lastWrite: true,
      snapshot: { kind: 'text', content: BEFORE },
      disk: { kind: 'text', content: 'by hand', asLeft: false },
    },
  ],
  [
    'a later write of the session',
    {
      firstTouchInTurn: true,
      lastWrite: false,
      snapshot: { kind: 'text', content: BEFORE },
      disk: { kind: 'other' },
    },
  ],
  [
    'a second touch of the turn',
    {
      firstTouchInTurn: false,
      lastWrite: true,
      snapshot: { kind: 'text', content: BEFORE },
      disk: { kind: 'text', content: AFTER, asLeft: true },
    },
  ],
  [
    'no snapshot, and a disk that is not text',
    {
      firstTouchInTurn: true,
      lastWrite: true,
      snapshot: { kind: 'missing' },
      disk: { kind: 'other' },
    },
  ],
  [
    'a snapshot too large to keep',
    {
      firstTouchInTurn: true,
      lastWrite: true,
      snapshot: { kind: 'notRestorable', reason: 'tooLarge' },
      disk: { kind: 'text', content: AFTER, asLeft: true },
    },
  ],
];

/**
 * S-50: the diff over the `FileChange` the classifier reads from a call is the diff the old code made
 * over the call's input — the same scope, the same "after", the same hunks, for every tool that had a
 * diff and every situation of the file (plan 28, B-16).
 */
describe('the diff over the change, against the diff over the input — plan 28, S-50', () => {
  const cases = CALLS.flatMap(([toolName, input]) =>
    SITUATIONS.map(
      ([situation, rest]) => [toolName, situation, { toolName, input, ...rest }] as const,
    ),
  );

  it.each(cases)('of %s, with %s, is what it always was', (_tool, _situation, facts) => {
    const tool = claudeTool(facts.toolName, facts.input);
    const change = diffableChangeOf(tool);

    expect(change).not.toBeNull();
    if (change === null) {
      return;
    }

    const diff = toolDiffOf({ kind: tool.kind, change, ...facts });
    const old = oldDiff(facts);

    expect(diff.scope).toBe(old.scope);
    expect(diff.after.state === 'content' ? diff.after.content : null).toBe(old.after);
    expect(diff.hunks).toEqual(old.hunks);
    expect(diff.path).toBe(FILE);
  });
});
