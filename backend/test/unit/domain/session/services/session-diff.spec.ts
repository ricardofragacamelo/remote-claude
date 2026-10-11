import { describe, expect, it } from 'vitest';

import {
  diffableChangeOf,
  fileChangeOf,
  firstCheckpoints,
  isAsLeft,
  pendingDiffOf,
  SessionFileState,
  SessionId,
  toolDiffOf,
  TurnFileCheckpoint,
} from '@domain/session';
import type { ToolDiffFacts, TurnFileCheckpointSnapshot } from '@domain/session';
import { ConversationRef } from '@domain/engine';
import type { FileChange } from '@domain/engine';
import { CONVERSATION_ID, SESSION_ID } from '../../../../support/builders/session.builder';
import { claudeTool } from '../../../../support/builders/tool.builder';

const FILE = '/srv/projects/app/app.js';

/** The change a call of Claude Code makes, as its classifier reads it — the one a diff is made of. */
function changeOf(toolName: string, input: Record<string, unknown>): FileChange {
  const change = diffableChangeOf(claudeTool(toolName, input));
  if (change === null) {
    throw new Error(`${toolName} has no diffable change`);
  }
  return change;
}

/** The facts of a diff — of an edit of `app.js` unless [call] names another call. */
function facts(
  overrides: Partial<ToolDiffFacts> & {
    readonly toolName?: string;
    readonly input?: Record<string, unknown>;
  } = {},
): ToolDiffFacts {
  const {
    toolName = 'Edit',
    input = { file_path: FILE, old_string: "'hello'", new_string: "'hi'" },
    ...rest
  } = overrides;
  return {
    kind: claudeTool(toolName, input).kind,
    change: changeOf(toolName, input),
    firstTouchInTurn: true,
    lastWrite: true,
    snapshot: { kind: 'text', content: "const greeting = 'hello';\nlog(greeting);\n" },
    disk: { kind: 'text', content: "const greeting = 'hi';\nlog(greeting);\n", asLeft: true },
    ...rest,
  };
}

function checkpoint(overrides: Partial<TurnFileCheckpointSnapshot> = {}): TurnFileCheckpoint {
  return TurnFileCheckpoint.capture({
    sessionId: SessionId.create(SESSION_ID),
    conversation: ConversationRef.create('claude', CONVERSATION_ID),
    promptId: 'p1',
    path: FILE,
    existedBefore: 'present',
    blobPath: '/store/blob',
    hash: 'before',
    sizeBytes: 3,
    restorable: 'yes',
    promptText: null,
    capturedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  });
}

function leftAs(hash: string | null): SessionFileState {
  return SessionFileState.record({
    sessionId: SessionId.create(SESSION_ID),
    conversation: ConversationRef.create('claude', CONVERSATION_ID),
    path: FILE,
    hash,
    mtime: new Date(0),
    sizeBytes: 1,
    updatedAt: new Date(0),
  });
}

describe('the diff of a tool', () => {
  it('knows the calls that write one file, and the change they make — plan 28, B-16', () => {
    // By the change, never by a name: a `write` with its content, an `edit` with its replacements.
    expect(diffableChangeOf(claudeTool('Edit', { file_path: FILE }))).toMatchObject({
      path: FILE,
      op: 'edit',
    });
    expect(diffableChangeOf(claudeTool('MultiEdit', { file_path: FILE, edits: [] }))).toEqual({
      path: FILE,
      op: 'edit',
      edits: [],
    });
    expect(diffableChangeOf(claudeTool('Write', { file_path: FILE }))).toEqual({
      path: FILE,
      op: 'write',
      content: '',
    });
    // A cell of a notebook is an edit with no replacements; a shell, a relative path: no change.
    expect(diffableChangeOf(claudeTool('NotebookEdit', { notebook_path: FILE }))).toBeNull();
    expect(diffableChangeOf(claudeTool('Bash', { command: 'rm a.js' }))).toBeNull();
    expect(diffableChangeOf(claudeTool('Edit', { file_path: 'relative.js' }))).toBeNull();
  });

  it('diffs the first change that can be, skipping a delete or a move before it', () => {
    const write: FileChange = { path: '/b', op: 'write', content: 'x' };

    expect(
      diffableChangeOf({
        changes: [{ path: '/a', op: 'delete' }, { path: '/c', op: 'move', to: '/d' }, write],
      }),
    ).toBe(write);
    expect(diffableChangeOf({ changes: [{ path: '/a', op: 'delete' }] })).toBeNull();
  });

  it('names the kind of the call, and says it is not pending', () => {
    expect(toolDiffOf(facts())).toMatchObject({ path: FILE, kind: 'file.edit', pending: false });
    expect(
      toolDiffOf(facts({ toolName: 'Write', input: { file_path: FILE, content: 'x' } })),
    ).toMatchObject({ kind: 'file.write', pending: false });
  });

  it('of an edit, is the whole file when the snapshot and the disk are both known — S-103', () => {
    const diff = toolDiffOf(facts());

    expect(diff).toMatchObject({ scope: 'file', before: { state: 'content' } });
    expect(diff.after).toEqual({
      state: 'content',
      content: "const greeting = 'hi';\nlog(greeting);\n",
    });
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0]).toMatchObject({ oldStart: 1, newStart: 1 });
  });

  it('of a multi-edit with the disk changed since, is one hunk per edit, in order — S-104', () => {
    const diff = toolDiffOf(
      facts({
        toolName: 'MultiEdit',
        input: {
          file_path: FILE,
          edits: [
            { old_string: 'one', new_string: 'ONE' },
            { old_string: 'two', new_string: 'TWO' },
            'not an edit',
          ],
        },
        disk: { kind: 'text', content: 'somebody else', asLeft: false },
      }),
    );

    expect(diff.scope).toBe('edit');
    expect(diff.after).toEqual({ state: 'unavailable', reason: 'changedSince' });
    expect(diff.hunks.map((hunk) => hunk.lines)).toEqual([
      [
        { kind: 'removed', text: 'one' },
        { kind: 'added', text: 'ONE' },
      ],
      [
        { kind: 'removed', text: 'two' },
        { kind: 'added', text: 'TWO' },
      ],
    ]);
  });

  it('of a write over a file, is against the snapshot; of a new file, all added — S-105, S-128', () => {
    const over = toolDiffOf(
      facts({
        toolName: 'Write',
        input: { file_path: FILE, content: 'new\n' },
        disk: { kind: 'other' },
      }),
    );
    expect(over).toMatchObject({ scope: 'file', after: { state: 'content', content: 'new\n' } });

    const created = toolDiffOf(
      facts({
        toolName: 'Write',
        input: { file_path: FILE, content: 'a\nb\n' },
        snapshot: { kind: 'absent' },
      }),
    );
    expect(created.before).toEqual({ state: 'absent' });
    expect(created.hunks[0]?.lines.every((line) => line.kind === 'added')).toBe(true);
  });

  it('of a write with no content in its input, is an empty file', () => {
    expect(toolDiffOf(facts({ toolName: 'Write', input: { file_path: FILE } })).after).toEqual({
      state: 'content',
      content: '',
    });
  });

  it('of a second edit in the same turn says the before is not known, and shows its strings — S-106', () => {
    const diff = toolDiffOf(facts({ firstTouchInTurn: false }));

    expect(diff.before).toEqual({ state: 'unavailable', reason: 'laterTouch' });
    expect(diff.scope).toBe('edit');
    expect(diff.hunks[0]?.lines).toEqual([
      { kind: 'removed', text: "'hello'" },
      { kind: 'added', text: "'hi'" },
    ]);
  });

  it('of a file too large to snapshot says so, and keeps the edit — S-107', () => {
    const diff = toolDiffOf(facts({ snapshot: { kind: 'notRestorable', reason: 'tooLarge' } }));

    expect(diff.before).toEqual({ state: 'notRestorable', reason: 'tooLarge' });
    expect(diff.hunks).toHaveLength(1);
  });

  it('says no snapshot was kept, and that a later write of the session replaced the after', () => {
    const diff = toolDiffOf(facts({ snapshot: { kind: 'missing' }, lastWrite: false }));

    expect(diff.before).toEqual({ state: 'unavailable', reason: 'noSnapshot' });
    expect(diff.after).toEqual({ state: 'unavailable', reason: 'laterWrite' });
  });

  it('of a write with no before has no hunks — nothing honest to compare it with', () => {
    const diff = toolDiffOf(
      facts({
        toolName: 'Write',
        input: { file_path: FILE, content: 'x' },
        firstTouchInTurn: false,
      }),
    );

    expect(diff).toMatchObject({ scope: 'edit', hunks: [] });
  });

  it('reads an edit whose strings are missing as empty ones', () => {
    const diff = toolDiffOf(facts({ input: { file_path: FILE }, firstTouchInTurn: false }));
    expect(diff.hunks).toEqual([]);
  });
});

describe('the diff of a call still waiting for an answer — plan 28, B-17 / S-53', () => {
  const TEXT = "const greeting = 'hello';\nlog(greeting);\n";
  const disk = (content: string) => ({ kind: 'text', content }) as const;
  const edit = (input: Record<string, unknown>) =>
    pendingDiffOf('file.edit', changeOf('Edit', { file_path: FILE, ...input }), disk(TEXT));

  it('of an edit, is the disk now against the disk with the replacement applied', () => {
    const diff = edit({ old_string: "'hello'", new_string: "'hi'" });

    expect(diff).toMatchObject({
      path: FILE,
      kind: 'file.edit',
      pending: true,
      scope: 'file',
      before: { state: 'content', content: TEXT },
      after: { state: 'content', content: "const greeting = 'hi';\nlog(greeting);\n" },
    });
    expect(diff.hunks).toHaveLength(1);
  });

  it('applies the replacement as text, never as a pattern of `$` substitutions', () => {
    const diff = edit({ old_string: "'hello'", new_string: "'$&$1'" });

    expect(diff.after).toEqual({
      state: 'content',
      content: "const greeting = '$&$1';\nlog(greeting);\n",
    });
  });

  it('of a write over a file, is its content against the disk; of an absent one, all added', () => {
    const over = pendingDiffOf(
      'file.write',
      changeOf('Write', { file_path: FILE, content: 'new\n' }),
      disk('old\n'),
    );
    expect(over).toMatchObject({
      scope: 'file',
      before: { state: 'content', content: 'old\n' },
      after: { state: 'content', content: 'new\n' },
    });

    const created = pendingDiffOf(
      'file.write',
      changeOf('Write', { file_path: FILE, content: 'a\nb\n' }),
      { kind: 'absent' },
    );
    expect(created.before).toEqual({ state: 'absent' });
    expect(created.hunks[0]?.lines).toEqual([
      { kind: 'added', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
  });

  it('of an edit of a file not there, applies to the empty text — and so is missing', () => {
    expect(
      pendingDiffOf('file.edit', changeOf('Edit', { file_path: FILE, old_string: 'a' }), {
        kind: 'absent',
      }).after,
    ).toEqual({ state: 'unavailable', reason: 'editMissing', edit: 0 });
  });

  it('replaces every occurrence with `replace_all`, and refuses two without it', () => {
    const twice = 'a a\n';
    const all = pendingDiffOf(
      'file.edit',
      changeOf('Edit', { file_path: FILE, old_string: 'a', new_string: 'b', replace_all: true }),
      disk(twice),
    );
    expect(all.after).toEqual({ state: 'content', content: 'b b\n' });

    const one = pendingDiffOf(
      'file.edit',
      changeOf('Edit', { file_path: FILE, old_string: 'a', new_string: 'b' }),
      disk(twice),
    );
    expect(one).toMatchObject({
      scope: 'edit',
      before: { state: 'content', content: twice },
      after: { state: 'unavailable', reason: 'editAmbiguous', edit: 0 },
    });
    expect(one.hunks[0]?.lines).toEqual([
      { kind: 'removed', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
  });

  it('applies the replacements of a multi-edit in order, each on what the one before left', () => {
    const change = changeOf('MultiEdit', {
      file_path: FILE,
      edits: [
        { old_string: 'hello', new_string: 'hey' },
        { old_string: "'hey'", new_string: "'hey you'" },
      ],
    });

    expect(pendingDiffOf('file.edit', change, disk(TEXT)).after).toEqual({
      state: 'content',
      content: "const greeting = 'hey you';\nlog(greeting);\n",
    });
  });

  it('says which replacement of a multi-edit would not apply, by its index — missing', () => {
    const change = changeOf('MultiEdit', {
      file_path: FILE,
      edits: [
        { old_string: 'hello', new_string: 'hey' },
        { old_string: 'nowhere', new_string: 'x' },
        { old_string: 'log', new_string: 'print' },
      ],
    });

    const diff = pendingDiffOf('file.edit', change, disk(TEXT));

    expect(diff.after).toEqual({ state: 'unavailable', reason: 'editMissing', edit: 1 });
    expect(diff.scope).toBe('edit');
    expect(diff.hunks).toHaveLength(3);
  });

  it('refuses a replacement of the empty text, which is everywhere and nowhere', () => {
    expect(edit({ old_string: '', new_string: 'x' }).after).toEqual({
      state: 'unavailable',
      reason: 'editMissing',
      edit: 0,
    });
  });

  it('of a file that is not text it can read, says why, and shows the replaced strings', () => {
    const diff = pendingDiffOf(
      'file.edit',
      changeOf('Edit', { file_path: FILE, old_string: 'one', new_string: 'ONE' }),
      { kind: 'notRestorable', reason: 'tooLarge' },
    );

    expect(diff).toMatchObject({
      pending: true,
      scope: 'edit',
      before: { state: 'notRestorable', reason: 'tooLarge' },
      after: { state: 'unavailable', reason: 'changedSince' },
    });
    expect(diff.hunks.map((hunk) => hunk.lines)).toEqual([
      [
        { kind: 'removed', text: 'one' },
        { kind: 'added', text: 'ONE' },
      ],
    ]);

    const write = pendingDiffOf(
      'file.write',
      changeOf('Write', { file_path: FILE, content: 'x' }),
      { kind: 'notRestorable', reason: 'unreadable' },
    );
    expect(write).toMatchObject({
      before: { state: 'notRestorable', reason: 'unreadable' },
      hunks: [],
    });
  });

  it('applies an edit with no replacements as no change at all', () => {
    // Not one the classifier builds (a notebook cell has none, and is not diffable): the rule
    // still answers it rather than throwing.
    expect(pendingDiffOf('file.edit', { path: FILE, op: 'edit' }, disk('same\n'))).toMatchObject({
      scope: 'file',
      after: { state: 'content', content: 'same\n' },
      hunks: [],
    });
  });
});

describe('what a session changed in one file', () => {
  it('is created, modified or deleted against before the session — S-113', () => {
    expect(
      fileChangeOf(checkpoint({ existedBefore: 'absent', hash: null }), leftAs('n'), {
        kind: 'file',
        hash: 'n',
      }),
    ).toMatchObject({ kind: 'created', modifiedOutside: false });
    expect(
      fileChangeOf(checkpoint(), leftAs('after'), { kind: 'file', hash: 'after' }),
    ).toMatchObject({ kind: 'modified', promptId: 'p1' });
    expect(fileChangeOf(checkpoint(), leftAs(null), { kind: 'absent' })).toMatchObject({
      kind: 'deleted',
      modifiedOutside: false,
    });
  });

  it('is no change once the file is back to how it was — S-115', () => {
    expect(
      fileChangeOf(checkpoint(), leftAs('before'), { kind: 'file', hash: 'before' }),
    ).toBeNull();
    expect(
      fileChangeOf(checkpoint({ existedBefore: 'absent', hash: null }), null, { kind: 'absent' }),
    ).toBeNull();
  });

  it('is modified outside when the disk is not what the session left — S-114', () => {
    expect(
      fileChangeOf(checkpoint(), leftAs('after'), { kind: 'file', hash: 'by hand' })
        ?.modifiedOutside,
    ).toBe(true);
    expect(fileChangeOf(checkpoint(), null, { kind: 'file', hash: 'after' })?.modifiedOutside).toBe(
      true,
    );
    expect(
      fileChangeOf(checkpoint({ hash: null, restorable: 'tooLarge' }), leftAs('x'), {
        kind: 'unsafe',
      }),
    ).toMatchObject({ kind: 'modified', modifiedOutside: true });
  });

  it('tells "as the session left it" for a file it removed', () => {
    expect(isAsLeft(leftAs(null), { kind: 'absent' })).toBe(true);
    expect(isAsLeft(leftAs(null), { kind: 'file', hash: 'x' })).toBe(false);
    expect(isAsLeft(null, { kind: 'absent' })).toBe(false);
  });

  it('starts from the first turn that touched each path, by time and then by turn', () => {
    const first = firstCheckpoints([
      checkpoint({ promptId: 'p2', capturedAt: new Date('2026-10-01T11:00:00.000Z') }),
      checkpoint({ promptId: 'p1', capturedAt: new Date('2026-10-01T10:00:00.000Z') }),
      checkpoint({ promptId: 'p0', capturedAt: new Date('2026-10-01T10:00:00.000Z') }),
      checkpoint({ path: '/srv/projects/app/b.js', promptId: 'p3' }),
    ]);

    expect(first.get(FILE)?.promptId).toBe('p0');
    expect(first.get('/srv/projects/app/b.js')?.promptId).toBe('p3');
  });
});
