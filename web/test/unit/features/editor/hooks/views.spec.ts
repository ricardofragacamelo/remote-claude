import { describe, expect, it, vi } from 'vitest';

import { activeView, focusEditor, showView } from '@/features/editor/hooks/views';
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
