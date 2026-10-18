import { describe, expect, it } from 'vitest';

import { classifyTestTool } from '../../../fakes/engine/test-tool-classifier';

const FOLDER = '/srv/projects/app';

/**
 * Scenario matrix (AGENTS.md rule 4) for the test engine's own classification table — the fake's
 * equivalent of `tool-classifier.ts`'s own coverage, over its three native tools.
 *
 * - equivalência: each of `write_file`, `run_shell`, `ask_user` reads as its canonical kind, with the
 *   origin carrying the engine's own native name.
 * - fronteira: an empty `content` writes no lines; an `ask_user` with no `options` still classifies.
 * - erro: a name the table has no classification for is `other`, never a thrown error.
 * - transição de estado: not applicable — classification is a pure function of its arguments, with no
 *   state of its own to transition (unlike the session that calls it).
 * - concorrência: not applicable, for the same reason — nothing here is shared mutable state.
 * - idempotência: classifying the same call twice yields the same result both times.
 */
describe('classifyTestTool', () => {
  it('reads write_file as a file.write, with the path relative to the folder and the lines added', () => {
    const tool = classifyTestTool(
      'write_file',
      { path: 'notes.txt', content: 'one\ntwo\n' },
      FOLDER,
    );

    expect(tool.kind).toBe('file.write');
    expect(tool.label).toEqual({
      messageKey: 'sessions.tool.fileWrite',
      params: { path: 'notes.txt', lines: 3 },
    });
    expect(tool.subject).toEqual({ paths: [`${FOLDER}/notes.txt`] });
    expect(tool.changes).toEqual([
      { path: `${FOLDER}/notes.txt`, op: 'write', content: 'one\ntwo\n' },
    ]);
    expect(tool.origin).toEqual({ engine: 'test', native: 'write_file' });
  });

  it('resolves an already-absolute path as itself, outside the folder included', () => {
    const tool = classifyTestTool('write_file', { path: '/elsewhere/a.txt', content: '' }, FOLDER);

    expect(tool.subject).toEqual({ paths: ['/elsewhere/a.txt'] });
    expect(tool.changes).toEqual([{ path: '/elsewhere/a.txt', op: 'write', content: '' }]);
  });

  it('reads run_shell as a shell, with the command as its subject and its first line as the label', () => {
    const tool = classifyTestTool('run_shell', { command: 'echo one\necho two' }, FOLDER);

    expect(tool.kind).toBe('shell');
    expect(tool.label).toEqual({
      messageKey: 'sessions.tool.shell',
      params: { command: 'echo one' },
    });
    expect(tool.subject).toEqual({ command: 'echo one\necho two' });
    expect(tool.changes).toEqual([]);
  });

  it('reads ask_user as a question, normalised the way every question-asking engine is', () => {
    const tool = classifyTestTool(
      'ask_user',
      { header: 'Which?', prompt: 'Which file?', options: ['a.txt', 'b.txt'], multiSelect: true },
      FOLDER,
    );

    expect(tool.kind).toBe('question');
    expect(tool.label).toEqual({
      messageKey: 'sessions.tool.question',
      params: { header: 'Which?' },
    });
    expect(tool.interaction).toEqual({
      kind: 'question',
      malformed: false,
      questions: [
        {
          id: 'q1',
          header: 'Which?',
          prompt: 'Which file?',
          originalPrompt: 'Which file?',
          multiSelect: true,
          options: [
            { label: 'a.txt', description: '', preview: null, originalLabel: 'a.txt' },
            { label: 'b.txt', description: '', preview: null, originalLabel: 'b.txt' },
          ],
        },
      ],
    });
  });

  it('writes no lines for empty content — fronteira', () => {
    const tool = classifyTestTool('write_file', { path: 'empty.txt', content: '' }, FOLDER);

    expect(tool.label.params).toMatchObject({ lines: 0 });
  });

  it('classifies ask_user with no options as a question with none, never throwing — fronteira', () => {
    const tool = classifyTestTool('ask_user', { header: 'Which?', prompt: 'p' }, FOLDER);

    expect(tool.interaction).toMatchObject({ questions: [{ options: [] }] });
  });

  it('reads a name it has no classification for as other, and keeps the native name — erro, R-01', () => {
    const tool = classifyTestTool('delete_everything', { anything: true }, FOLDER);

    expect(tool.kind).toBe('other');
    expect(tool.label).toEqual({
      messageKey: 'sessions.tool.other',
      params: { name: 'delete_everything' },
    });
    expect(tool.origin).toEqual({ engine: 'test', native: 'delete_everything' });
  });

  it('is idempotent: the same call classified twice reads exactly the same', () => {
    const input = { command: 'echo hi' };

    expect(classifyTestTool('run_shell', input, FOLDER)).toEqual(
      classifyTestTool('run_shell', input, FOLDER),
    );
  });
});
