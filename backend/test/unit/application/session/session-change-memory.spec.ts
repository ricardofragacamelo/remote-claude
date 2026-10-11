import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_REMEMBERED_INPUT_CHARS,
  MAX_REMEMBERED_TOOLS,
  SessionChangeMemory,
} from '@application/session';
import type { Session } from '@domain/session';
import { aSession } from '../../../support/builders/session.builder';
import { claudeTool } from '../../../support/builders/tool.builder';

const FILE = '/srv/projects/app/a.js';

describe('what a live session remembers of its tools and rejections', () => {
  let memory: SessionChangeMemory;
  let session: Session;

  beforeEach(() => {
    memory = new SessionChangeMemory();
    session = aSession();
  });

  const edit = (toolUseId: string, promptId: string | null, path = FILE) => {
    memory.rememberTool(session, {
      toolUseId,
      tool: claudeTool('Edit', { file_path: path, old_string: 'a', new_string: 'b' }),
      promptId,
    });
  };

  it('knows nothing of a tool it never saw, nor of a session it never met', () => {
    expect(memory.toolOf(session, 'toolu_none')).toBeNull();
    expect(memory.toolOf(aSession({ id: '01J0ABCDEFGHJKMNPQRSTVWXY1' }), 'toolu_1')).toBeNull();
  });

  it('keeps the change of a call with a diff, and only the kind of any other — plan 28, B-16', () => {
    edit('toolu_1', 'p1');
    memory.rememberTool(session, {
      toolUseId: 'toolu_2',
      tool: claudeTool('Bash', { command: 'secret' }),
      promptId: 'p1',
    });

    expect(memory.toolOf(session, 'toolu_1')).toMatchObject({
      kind: 'file.edit',
      change: { path: FILE, op: 'edit', edits: [{ oldText: 'a', newText: 'b' }] },
    });
    expect(memory.toolOf(session, 'toolu_2')).toMatchObject({ kind: 'shell', change: null });
    expect(JSON.stringify(memory.toolOf(session, 'toolu_2'))).not.toContain('secret');
  });

  it('keeps no change of a cell of a notebook, which has no diff, nor ties it to the file', () => {
    // A notebook's cell is an `edit` with no replacements: the undo snapshots the file, no diff
    // is made of it — and it is no later write of the file for the edits around it either.
    edit('toolu_1', 'p1', '/srv/projects/app/n.ipynb');
    memory.rememberTool(session, {
      toolUseId: 'toolu_2',
      tool: claudeTool('NotebookEdit', { notebook_path: '/srv/projects/app/n.ipynb' }),
      promptId: 'p1',
    });

    expect(memory.toolOf(session, 'toolu_2')).toMatchObject({ kind: 'file.edit', change: null });
    expect(memory.toolOf(session, 'toolu_1')?.lastWrite).toBe(true);
  });

  it('ties a write to the edits of the same file — the change of a `write` is diffable too', () => {
    edit('toolu_1', 'p1');
    memory.rememberTool(session, {
      toolUseId: 'toolu_2',
      tool: claudeTool('Write', { file_path: FILE, content: 'new' }),
      promptId: 'p1',
    });

    expect(memory.toolOf(session, 'toolu_1')?.lastWrite).toBe(false);
    expect(memory.toolOf(session, 'toolu_2')).toMatchObject({
      kind: 'file.write',
      change: { path: FILE, op: 'write', content: 'new' },
      firstTouchInTurn: false,
      lastWrite: true,
    });
  });

  it('says which write was the first of its turn, and which the last of the session — S-106', () => {
    edit('toolu_1', 'p1');
    edit('toolu_2', 'p1');
    edit('toolu_3', 'p2');
    edit('toolu_4', 'p2', '/srv/projects/app/other.js');

    expect(memory.toolOf(session, 'toolu_1')).toMatchObject({
      firstTouchInTurn: true,
      lastWrite: false,
    });
    expect(memory.toolOf(session, 'toolu_2')).toMatchObject({
      firstTouchInTurn: false,
      lastWrite: false,
    });
    expect(memory.toolOf(session, 'toolu_3')).toMatchObject({
      firstTouchInTurn: true,
      lastWrite: true,
    });
  });

  it('names a turn the hook did not as the journal does — unknown', () => {
    edit('toolu_1', null);
    expect(memory.toolOf(session, 'toolu_1')?.promptId).toBe('unknown');
  });

  it('remembers a redelivered invocation once — idem', () => {
    edit('toolu_1', 'p1');
    edit('toolu_1', 'p1');
    edit('toolu_2', 'p1');

    expect(memory.toolOf(session, 'toolu_2')?.firstTouchInTurn).toBe(false);
  });

  it(`forgets the oldest past ${String(MAX_REMEMBERED_TOOLS)} invocations — fron`, () => {
    for (let index = 0; index <= MAX_REMEMBERED_TOOLS; index += 1) {
      memory.rememberTool(session, {
        toolUseId: `toolu_${String(index)}`,
        tool: claudeTool('Read'),
        promptId: 'p1',
      });
    }

    expect(memory.toolOf(session, 'toolu_0')).toBeNull();
    expect(memory.toolOf(session, `toolu_${String(MAX_REMEMBERED_TOOLS)}`)).not.toBeNull();
  });

  it('forgets the oldest writes once their changes pass the ceiling — fron', () => {
    const half = 'x'.repeat(MAX_REMEMBERED_INPUT_CHARS / 2);

    for (const id of ['toolu_1', 'toolu_2', 'toolu_3']) {
      memory.rememberTool(session, {
        toolUseId: id,
        tool: claudeTool('Write', { file_path: FILE, content: half }),
        promptId: 'p1',
      });
    }

    expect(memory.toolOf(session, 'toolu_1')).toBeNull();
    expect(memory.toolOf(session, 'toolu_3')).not.toBeNull();
  });

  it('measures what it keeps by the change alone, not by the input the call carried', () => {
    // A `shell` keeps no change, however long its line: it costs nothing against the ceiling.
    const long = 'x'.repeat(MAX_REMEMBERED_INPUT_CHARS);
    memory.rememberTool(session, {
      toolUseId: 'toolu_1',
      tool: claudeTool('Write', { file_path: FILE, content: 'a' }),
      promptId: 'p1',
    });
    for (const id of ['toolu_2', 'toolu_3']) {
      memory.rememberTool(session, {
        toolUseId: id,
        tool: claudeTool('Bash', { command: long }),
        promptId: 'p1',
      });
    }

    expect(memory.toolOf(session, 'toolu_1')).not.toBeNull();
  });

  it('keeps the last rejection of each file, until it is forgotten', () => {
    const rejection = { path: FILE, promptId: 'p1', replaced: null, left: 'h' };

    expect(memory.rejectionOf(session, FILE)).toBeNull();
    memory.rememberRejection(session, rejection);
    expect(memory.rejectionOf(session, FILE)).toEqual(rejection);

    memory.forgetRejection(session, FILE);
    memory.forgetRejection(aSession({ id: '01J0ABCDEFGHJKMNPQRSTVWXY1' }), FILE);
    expect(memory.rejectionOf(session, FILE)).toBeNull();
  });
});
