import { describe, expect, it } from 'vitest';

import {
  diffablePathOf,
  fileChangeOf,
  firstCheckpoints,
  isAsLeft,
  isDiffableTool,
  SessionFileState,
  SessionId,
  toolDiffOf,
  TurnFileCheckpoint,
} from '@domain/session';
import type { ToolDiffFacts, TurnFileCheckpointSnapshot } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { CONVERSATION_ID, SESSION_ID } from '../../../../support/builders/session.builder';

const FILE = '/srv/projects/app/app.js';

function facts(overrides: Partial<ToolDiffFacts> = {}): ToolDiffFacts {
  return {
    toolName: 'Edit',
    path: FILE,
    input: { file_path: FILE, old_string: "'hello'", new_string: "'hi'" },
    firstTouchInTurn: true,
    lastWrite: true,
    snapshot: { kind: 'text', content: "const greeting = 'hello';\nlog(greeting);\n" },
    disk: { kind: 'text', content: "const greeting = 'hi';\nlog(greeting);\n", asLeft: true },
    ...overrides,
  };
}

function checkpoint(overrides: Partial<TurnFileCheckpointSnapshot> = {}): TurnFileCheckpoint {
  return TurnFileCheckpoint.capture({
    sessionId: SessionId.create(SESSION_ID),
    claudeSessionId: ClaudeSessionId.create(CONVERSATION_ID),
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
    claudeSessionId: ClaudeSessionId.create(CONVERSATION_ID),
    path: FILE,
    hash,
    mtime: new Date(0),
    sizeBytes: 1,
    updatedAt: new Date(0),
  });
}

describe('the diff of a tool', () => {
  it('knows the tools that write one file, and the file they write', () => {
    expect(['Edit', 'MultiEdit', 'Write'].every(isDiffableTool)).toBe(true);
    expect(isDiffableTool('Bash')).toBe(false);
    expect(isDiffableTool('NotebookEdit')).toBe(false);
    expect(diffablePathOf({ file_path: FILE })).toBe(FILE);
    expect(diffablePathOf({ file_path: 'relative.js' })).toBeNull();
    expect(diffablePathOf({})).toBeNull();
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
