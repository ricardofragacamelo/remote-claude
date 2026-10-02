import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  askConflict,
  dismissSaveError,
  keepMine,
  postponeConflict,
} from '@/features/editor/hooks/answers';
import {
  CHOICE_MODE,
  encodingChoices,
  eolChoices,
  indentationChoices,
  languageChoices,
  offerChoice,
} from '@/features/editor/hooks/choices';
import {
  addFileToClaude,
  announce,
  changeEol,
  changeIndentation,
  changeLanguage,
  reopenWithEncoding,
  saveWithEncoding,
} from '@/features/editor/hooks/text-actions';
import { usePalette } from '@/features/commands';
import { editorStoreOf, isDirty, updateDoc } from '@/features/editor/store/editor.store';
import { useEditorChoice } from '@/features/editor/store/choice.store';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import { FOLDER, editorState, openedModel } from '../../../../support/editor';
import { fakeDisk, refused } from '../../../../support/editor-disk';
import { translator } from '../../../../support/render';

const t = translator('en') as unknown as Parameters<typeof languageChoices>[2];

afterEach(() => {
  vi.restoreAllMocks();
});

const doc = (path: string) => editorState().docs[path];

describe('the status bar actions — plan 07, B-37', () => {
  it('convert the line endings, which dirties the tab (S-248)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a\nb' });
    const model = await openedModel('a.ts');

    const crlf = eolChoices(FOLDER, 'a.ts').find((option) => option.id === 'crlf');
    expect(eolChoices(FOLDER, 'a.ts').map((option) => [option.label, option.current])).toEqual([
      ['LF', true],
      ['CRLF', false],
    ]);
    crlf?.run();
    expect(model.getValue()).toBe('a\r\nb');
    expect(isDirty(doc('a.ts'))).toBe(true);
    changeEol(FOLDER, 'nope.ts', 'lf');
  });

  it('change the language of the highlighting by hand (S-251)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    await openedModel('a.ts');

    const choices = languageChoices(FOLDER, 'a.ts', t);
    expect(choices[0]).toMatchObject({ id: 'plaintext', label: 'Plain text', current: false });
    expect(choices.find((option) => option.id === 'typescript')?.current).toBe(true);
    choices.find((option) => option.id === 'python')?.run();
    expect(doc('a.ts')?.language).toBe('python');
    changeLanguage(FOLDER, 'nope.ts', 'go');
  });

  it('convert the indentation, as one edit, and edit that way from then on (S-251)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a\n    b' });
    const model = await openedModel('a.ts');

    const [toSpaces, toTabs] = indentationChoices(FOLDER, 'a.ts', t);
    expect(toSpaces?.current).toBe(true);
    toTabs?.run();
    expect(model.getValue()).toBe('a\n\tb');
    expect(doc('a.ts')?.indentation).toEqual({ insertSpaces: false, size: 4 });
    expect(indentationChoices(FOLDER, 'a.ts', t)[1]?.current).toBe(true);
    toSpaces?.run();
    expect(model.getValue()).toBe('a\n    b');
    changeIndentation(FOLDER, 'nope.ts', true);
  });

  it('use the preferences for a file that says nothing of its indentation', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a\n\tb' });
    const model = await openedModel('a.ts');
    updateDoc(editorStoreOf(FOLDER), 'a.ts', () => ({ indentation: null }));

    changeIndentation(FOLDER, 'a.ts', true);
    expect(model.getValue()).toBe('a\n    b');
  });

  it('reopen with an encoding, only from a clean buffer (S-249)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.txt': 'café' });
    const model = await openedModel('a.txt');

    const [, windows] = encodingChoices(FOLDER, 'a.txt', 'reopen').filter((option) =>
      ['utf8', 'windows1252'].includes(option.id),
    );
    expect(encodingChoices(FOLDER, 'a.txt', 'reopen')[0]).toMatchObject({
      id: 'utf8',
      current: true,
    });
    windows?.run();
    await vi.waitFor(() => {
      expect(disk.calls.at(-1)?.route).toBe('/files/content');
    });

    model.setValue('mine');
    await reopenWithEncoding(FOLDER, 'a.txt', 'iso88591');
    expect(editorState().announcement).toMatchObject({
      key: 'editor.encoding.dirty',
      params: { path: 'a.txt' },
    });

    model.undo();
    disk.files.set('a.txt', {
      content: 'x',
      unreadable: refused('INVALID_INPUT', 'files.error.unknownEncoding'),
    });
    await reopenWithEncoding(FOLDER, 'a.txt', 'koi8');
    expect(doc('a.txt')?.saveError?.code).toBe('INVALID_INPUT');
    await reopenWithEncoding(FOLDER, 'nope.txt', 'utf8');
  });

  it('reopen with an encoding puts what the disk decoded in the editor', async () => {
    const disk = fakeDisk(FOLDER, { 'a.txt': 'raw' });
    const model = await openedModel('a.txt');

    disk.files.set('a.txt', { content: 'decoded', encoding: 'windows1252' });
    await reopenWithEncoding(FOLDER, 'a.txt', 'windows1252');
    expect(model.getValue()).toBe('decoded');
    expect(doc('a.txt')?.encoding).toBe('windows1252');
  });

  it('save with an encoding from the choice', async () => {
    const disk = fakeDisk(FOLDER, { 'a.txt': 'a' });
    await openedModel('a.txt');

    encodingChoices(FOLDER, 'a.txt', 'save')
      .find((option) => option.id === 'utf16le')
      ?.run();
    await vi.waitFor(() => {
      expect(disk.saves().at(-1)?.body?.['encoding']).toBe('utf16le');
    });
    await saveWithEncoding(FOLDER, 'a.txt', 'utf16le');
  });

  it('take a file that is not open as UTF-8', () => {
    expect(encodingChoices(FOLDER, 'nope.txt', 'save')[0]).toMatchObject({
      id: 'utf8',
      current: true,
    });
  });

  it('offer a choice in the palette, by name', () => {
    offerChoice('editor.choice.eol', []);

    expect(useEditorChoice.getState().titleKey).toBe('editor.choice.eol');
    expect(usePalette.getState()).toMatchObject({ open: true, mode: CHOICE_MODE });
  });
});

describe('adding to Claude’s context — plan 07, B-42', () => {
  it('hands the file, or the selection with its range, to whoever takes it, and says so (S-275, S-277)', () => {
    const add = vi.fn();
    const unregister = claudeContextTargets.register({ id: 'chat', position: 1, add });
    const range = { startLine: 1, startColumn: 1, endLine: 2, endColumn: 3 };

    addFileToClaude(FOLDER, 'src/a.ts', null);
    addFileToClaude(FOLDER, 'src/a.ts', range);
    addFileToClaude(FOLDER, 'src/a.ts', null);

    expect(add.mock.calls).toEqual([
      [{ folder: FOLDER, entries: [{ path: 'src/a.ts', kind: 'file' }] }],
      [{ folder: FOLDER, entries: [], selection: { path: 'src/a.ts', range } }],
      // The same action again hands the same payload again — dropping repeats is the target's (S-278).
      [{ folder: FOLDER, entries: [{ path: 'src/a.ts', kind: 'file' }] }],
    ]);
    expect(editorState().announcement).toMatchObject({
      key: 'editor.claude.added',
      params: { path: 'src/a.ts' },
    });
    unregister();
  });

  it('says nothing took it when nobody does (S-276)', () => {
    addFileToClaude(FOLDER, 'a.ts', null);
    expect(editorState().announcement?.key).toBe('editor.claude.unavailable');
    announce(FOLDER, 'editor.claude.added');
    expect(editorState().announcement?.params).toEqual({});
  });
});

describe('the answers to the questions of a file', () => {
  it('put the conflict off and ask it again, keep mine, and dismiss a save error', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    await openedModel('a.ts');
    const store = editorStoreOf(FOLDER);

    updateDoc(store, 'a.ts', () => ({ conflict: { currentEtag: '"v"', asking: true } }));
    postponeConflict(FOLDER, 'a.ts');
    expect(doc('a.ts')?.conflict?.asking).toBe(false);
    askConflict(FOLDER, 'a.ts');
    expect(doc('a.ts')?.conflict?.asking).toBe(true);

    updateDoc(store, 'a.ts', () => ({
      conflict: null,
      external: { origin: 'claude' },
      saveError: refused('X', 'x'),
    }));
    postponeConflict(FOLDER, 'a.ts');
    askConflict(FOLDER, 'a.ts');
    expect(doc('a.ts')?.conflict).toBeNull();
    keepMine(FOLDER, 'a.ts');
    dismissSaveError(FOLDER, 'a.ts');
    expect(doc('a.ts')).toMatchObject({ external: null, saveError: null });
  });
});
