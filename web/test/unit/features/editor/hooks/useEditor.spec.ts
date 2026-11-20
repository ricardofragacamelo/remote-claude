import { describe, expect, it } from 'vitest';

import { fileIsDirty } from '@/features/editor/hooks/useEditor';
import { aDocument, editorStoreOf } from '@/features/editor/store/editor.store';
import type { TextModel } from '@/features/editor/types/code-editor';

function fakeModel(): TextModel {
  return { getValue: () => '', dispose: () => undefined } as unknown as TextModel;
}

describe('fileIsDirty — plan 11, B-16', () => {
  it('answers false for a file never opened, or one read but never edited', () => {
    expect(fileIsDirty('/r/none', 'a.ts')).toBe(false);

    editorStoreOf('/r/clean').setState({ docs: { 'a.ts': aDocument('a.ts') } });
    expect(fileIsDirty('/r/clean', 'a.ts')).toBe(false);
  });

  it('answers true once the buffer’s version moves past what was saved', () => {
    editorStoreOf('/r/dirty').setState({
      docs: {
        'a.ts': { ...aDocument('a.ts'), model: fakeModel(), version: 2, savedVersion: 1 },
      },
    });

    expect(fileIsDirty('/r/dirty', 'a.ts')).toBe(true);
  });
});
