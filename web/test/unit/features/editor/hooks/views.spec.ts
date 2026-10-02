import { describe, expect, it, vi } from 'vitest';

import { openAndRecentFiles } from '@/features/editor/hooks/tabs';
import { activeSelections, activeView, focusEditor, showView } from '@/features/editor/hooks/views';
import { editorStoreOf } from '@/features/editor/store/editor.store';
import type { CodeView } from '@/features/editor/types/code-editor';

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
  });
});
