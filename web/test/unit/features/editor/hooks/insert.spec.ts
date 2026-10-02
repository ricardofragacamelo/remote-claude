import { describe, expect, it, vi } from 'vitest';

import { openFile } from '@/features/editor';
import { insertBlocker, insertIntoEditor } from '@/features/editor/hooks/insert';
import { showView } from '@/features/editor/hooks/views';
import { isDirty } from '@/features/editor/store/editor.store';
import type { CodeView, TextPosition } from '@/features/editor/types/code-editor';
import { FOLDER, editorState, openedModel } from '../../../../support/editor';
import { fakeDisk } from '../../../../support/editor-disk';

/** A view on screen whose cursor is where a test puts it. */
function aView(at: TextPosition): CodeView & { readonly cursor: () => TextPosition } {
  let cursor = at;

  return {
    focus: vi.fn(),
    position: () => cursor,
    setPosition: vi.fn((position: TextPosition) => {
      cursor = position;
    }),
    cursor: () => cursor,
  } as unknown as CodeView & { readonly cursor: () => TextPosition };
}

function onScreen(view: CodeView): () => void {
  return showView(FOLDER, editorState().activeGroup, view);
}

describe('putting text at the cursor of the editor — plan 08 B-15', () => {
  it('says there is no editor when no file is open, nor a view on screen — S-68', async () => {
    expect(insertBlocker(FOLDER)).toBe('noEditor');
    expect(insertIntoEditor(FOLDER, 'x')).toBe(false);

    fakeDisk(FOLDER, { 'a.ts': 'a' });
    await openedModel('a.ts');
    expect(insertBlocker(FOLDER)).toBe('noEditor');
  });

  it('says the file is not read yet while its text is not there', () => {
    fakeDisk(FOLDER, { 'slow.ts': 'a' });
    openFile(FOLDER, 'slow.ts');
    const release = onScreen(aView({ line: 1, column: 1 }));

    expect(insertBlocker(FOLDER)).toBe('notLoaded');
    expect(insertIntoEditor(FOLDER, 'x')).toBe(false);
    release();
  });

  it('puts the text at the cursor, dirties the tab, and moves the cursor after it — S-67', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'const a = 1;\nconst b = 2;' });
    const model = await openedModel('a.ts');
    const view = aView({ line: 2, column: 7 });
    const release = onScreen(view);

    expect(insertBlocker(FOLDER)).toBeNull();
    expect(insertIntoEditor(FOLDER, 'x')).toBe(true);

    expect(model.getValue()).toBe('const a = 1;\nconst xb = 2;');
    expect(view.cursor()).toEqual({ line: 2, column: 8 });
    expect(view.focus).toHaveBeenCalled();
    expect(isDirty(editorState().docs['a.ts'])).toBe(true);
    release();
  });

  it('ends the cursor on the last line of a text of several', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'ab' });
    const model = await openedModel('a.ts');
    const view = aView({ line: 1, column: 2 });
    const release = onScreen(view);

    insertIntoEditor(FOLDER, 'one\ntwo');

    expect(model.getValue()).toBe('aone\ntwob');
    expect(view.cursor()).toEqual({ line: 2, column: 4 });
    release();
  });

  it('puts the text at the end for a cursor on a line past the last', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'ab' });
    const model = await openedModel('a.ts');
    const release = onScreen(aView({ line: 9, column: 3 }));

    insertIntoEditor(FOLDER, '!');

    expect(model.getValue()).toBe('ab!');
    release();
  });

  it('keeps a cursor past the end of its line at the end of it', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'ab\ncd' });
    const model = await openedModel('a.ts');
    const release = onScreen(aView({ line: 1, column: 99 }));

    insertIntoEditor(FOLDER, '!');

    expect(model.getValue()).toBe('ab!\ncd');
    release();
  });
});

describe('opening a file at a line — plan 08 B-16', () => {
  it('puts the cursor of its document on the line, the first at least — S-69', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a\nb\nc' });
    openFile(FOLDER, 'a.ts', { line: 3.7 });
    expect(editorState().docs['a.ts']?.cursor).toEqual({ line: 3, column: 1 });

    openFile(FOLDER, 'a.ts', { line: -4 });
    expect(editorState().docs['a.ts']?.cursor).toEqual({ line: 1, column: 1 });
  });

  it('moves the view already on screen too', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a\nb\nc' });
    await openedModel('a.ts');
    const view = aView({ line: 1, column: 1 });
    const release = onScreen(view);

    openFile(FOLDER, 'a.ts', { line: 2 });

    expect(view.cursor()).toEqual({ line: 2, column: 1 });
    release();
  });
});
