import { describe, expect, it, vi } from 'vitest';

import { openAndRecentFiles, openFiles } from '@/features/editor/hooks/tabs';
import {
  activeSelections,
  activeSelectionText,
  activeView,
  focusEditor,
  showView,
} from '@/features/editor/hooks/views';
import { aDocument, editorStoreOf } from '@/features/editor/store/editor.store';
import type { CodeView } from '@/features/editor/types/code-editor';
import type { TextModel } from '@/features/editor/types/code-editor';

const FOLDER = '/r/app';

function aView(): CodeView {
  return { focus: vi.fn() } as unknown as CodeView;
}

describe('the views on screen', () => {
  it('are the group’s with the focus — the one shown last — and lose nobody else’s on release', () => {
    const group = editorStoreOf(FOLDER).getState().activeGroup;
    const first = aView();
    const second = aView();

    const releaseFirst = showView(FOLDER, group, first);
    const releaseSecond = showView(FOLDER, group, second);
    releaseFirst();
    expect(activeView(FOLDER)).toBe(second);

    focusEditor(FOLDER);
    expect(second.focus).toHaveBeenCalledTimes(1);
    releaseSecond();
    expect(activeView(FOLDER)).toBeNull();
    focusEditor(FOLDER);
  });
});

describe('what the panel of Claude reads of the editor — plan 08, B-48, B-51', () => {
  const range = { startLine: 1, startColumn: 1, endLine: 2, endColumn: 3 };
  const fileTab = (path: string) => ({
    id: `t:${path}`,
    kind: 'file' as const,
    path,
    preview: false,
    pinned: false,
  });

  it('answers the selections of the active file, and nothing without one', () => {
    const store = editorStoreOf('/r/sel');
    const group = store.getState().activeGroup;
    expect(activeSelections('/r/sel')).toBeNull();

    store.setState({ groups: [{ id: group, tabs: [fileTab('a.ts')], active: 't:a.ts' }] });
    const release = showView('/r/sel', group, {
      focus: vi.fn(),
      selections: () => [range],
    } as unknown as CodeView);
    expect(activeSelections('/r/sel')).toEqual({ path: 'a.ts', ranges: [range] });

    release();
    expect(activeSelections('/r/sel')).toBeNull();
    store.setState({
      groups: [{ id: group, tabs: [{ id: 'd', kind: 'diff' } as never], active: 'd' }],
    });
    showView('/r/sel', group, { selections: () => [range] } as unknown as CodeView);
    expect(activeSelections('/r/sel')).toBeNull();
  });

  function fakeModel(text: string): TextModel {
    return { getValue: () => text, dispose: () => undefined } as unknown as TextModel;
  }

  it('answers the text of the first selection, read from the model of its own file', () => {
    const store = editorStoreOf('/r/text');
    const group = store.getState().activeGroup;
    expect(activeSelectionText('/r/text')).toBeNull();

    store.setState({
      groups: [{ id: group, tabs: [fileTab('a.ts')], active: 't:a.ts' }],
      docs: { 'a.ts': { ...aDocument('a.ts'), model: fakeModel('one\ntwo\nthree') } },
    });
    showView('/r/text', group, {
      focus: vi.fn(),
      selections: () => [{ startLine: 2, startColumn: 1, endLine: 2, endColumn: 4 }],
    } as unknown as CodeView);

    expect(activeSelectionText('/r/text')).toBe('two');
  });

  it('answers nothing for a file not read yet — no model to read from', () => {
    const store = editorStoreOf('/r/unread');
    const group = store.getState().activeGroup;
    store.setState({
      groups: [{ id: group, tabs: [fileTab('a.ts')], active: 't:a.ts' }],
      docs: { 'a.ts': aDocument('a.ts') },
    });
    showView('/r/unread', group, {
      focus: vi.fn(),
      selections: () => [{ startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 }],
    } as unknown as CodeView);

    expect(activeSelectionText('/r/unread')).toBeNull();
  });

  it('lists the active file first, then the open ones, then the recent ones, once each', () => {
    const store = editorStoreOf('/r/open');
    const group = store.getState().activeGroup;
    expect(openAndRecentFiles('/r/open')).toEqual([]);

    store.setState({
      groups: [
        {
          id: group,
          tabs: [fileTab('b.ts'), fileTab('a.ts'), { id: 'p', kind: 'preview' } as never],
          active: 't:a.ts',
        },
      ],
      recent: ['c.ts', 'b.ts'],
    });

    expect(openAndRecentFiles('/r/open')).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(openFiles('/r/open')).toEqual(['b.ts', 'a.ts']);
  });
});
