import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_REMEMBERED_INPUT_CHARS,
  MAX_REMEMBERED_TOOLS,
  SessionChangeMemory,
} from '@application/session';
import type { Session } from '@domain/session';
import { aSession } from '../../../support/builders/session.builder';

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
      toolName: 'Edit',
      input: { file_path: path, old_string: 'a', new_string: 'b' },
      promptId,
    });
  };

  it('knows nothing of a tool it never saw, nor of a session it never met', () => {
    expect(memory.toolOf(session, 'toolu_none')).toBeNull();
    expect(memory.toolOf(aSession({ id: '01J0ABCDEFGHJKMNPQRSTVWXY1' }), 'toolu_1')).toBeNull();
  });

  it('keeps the input of a file tool, and only the name of any other', () => {
    edit('toolu_1', 'p1');
    memory.rememberTool(session, {
      toolUseId: 'toolu_2',
      toolName: 'Bash',
      input: { command: 'secret' },
      promptId: 'p1',
    });

    expect(memory.toolOf(session, 'toolu_1')?.input).toMatchObject({ file_path: FILE });
    expect(memory.toolOf(session, 'toolu_2')).toMatchObject({ toolName: 'Bash', input: {} });
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
        toolName: 'Read',
        input: {},
        promptId: 'p1',
      });
    }

    expect(memory.toolOf(session, 'toolu_0')).toBeNull();
    expect(memory.toolOf(session, `toolu_${String(MAX_REMEMBERED_TOOLS)}`)).not.toBeNull();
  });

  it('forgets the oldest writes once their inputs pass the ceiling — fron', () => {
    const half = 'x'.repeat(MAX_REMEMBERED_INPUT_CHARS / 2);

    for (const id of ['toolu_1', 'toolu_2', 'toolu_3']) {
      memory.rememberTool(session, {
        toolUseId: id,
        toolName: 'Write',
        input: { file_path: FILE, content: half },
        promptId: 'p1',
      });
    }

    expect(memory.toolOf(session, 'toolu_1')).toBeNull();
    expect(memory.toolOf(session, 'toolu_3')).not.toBeNull();
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
