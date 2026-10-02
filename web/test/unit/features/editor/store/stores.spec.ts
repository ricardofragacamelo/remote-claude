import { describe, expect, it, vi } from 'vitest';

import {
  aDocument,
  editorFolders,
  editorStoreOf,
  forgetEditor,
  hasEditorStore,
  isDirty,
  onEditorStoreMade,
  updateDoc,
} from '@/features/editor/store/editor.store';
import {
  DEFAULT_PREFERENCES,
  initialPreferences,
  preferencesFrom,
  useEditorPreferences,
} from '@/features/editor/store/preferences.store';
import { mountedFolder, useEditorUi } from '@/features/editor/store/ui.store';
import { createPlainEngine } from '@/features/editor/lib/plain-engine';

describe('the editor of each folder tab — plan 07, S-12', () => {
  it('is one store per folder, made the first time it is asked for, and told about', () => {
    const made = vi.fn();
    const stop = onEditorStoreMade(made);

    expect(hasEditorStore('/r/app')).toBe(false);
    const app = editorStoreOf('/r/app');
    expect(editorStoreOf('/r/app')).toBe(app);
    expect(editorStoreOf('/r/app/pkg')).not.toBe(app);
    expect(made.mock.calls).toEqual([['/r/app'], ['/r/app/pkg']]);
    expect(editorFolders()).toEqual(['/r/app', '/r/app/pkg']);

    stop();
    editorStoreOf('/r/other');
    expect(made).toHaveBeenCalledTimes(2);
  });

  it('changes an open file only, and lets go of a folder — its texts disposed of', () => {
    const store = editorStoreOf('/r/app');
    const model = createPlainEngine().createModel({
      content: 'a',
      eol: 'lf',
      language: 'plaintext',
    });
    const dispose = vi.spyOn(model, 'dispose');
    store.setState({
      docs: { 'a.ts': { ...aDocument('a.ts'), model, version: 2, savedVersion: 1 } },
    });

    expect(isDirty(store.getState().docs['a.ts'])).toBe(true);
    expect(isDirty(aDocument('b.ts'))).toBe(false);
    expect(isDirty(undefined)).toBe(false);
    updateDoc(store, 'b.ts', () => ({ etag: '"x"' }));
    expect(store.getState().docs['b.ts']).toBeUndefined();

    forgetEditor('/r/app');
    expect(dispose).toHaveBeenCalled();
    expect(hasEditorStore('/r/app')).toBe(false);
    editorStoreOf('/r/one');
    forgetEditor(null);
    expect(editorFolders()).toEqual([]);
  });
});

describe('the preferences of the editor — plan 07, S-257, S-258', () => {
  it('are the defaults with auto-save off, for somebody who never changed one', () => {
    expect(DEFAULT_PREFERENCES.autoSave).toBe('off');
    expect(initialPreferences(() => ({ getItem: () => null, setItem: () => undefined }))).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it('are the defaults when the browser keeps nothing — never a broken editor', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };

    expect(initialPreferences(blocked)).toEqual(DEFAULT_PREFERENCES);
    useEditorPreferences.getState().set('fontSize', 16);
    expect(useEditorPreferences.getState().preferences.fontSize).toBe(16);
  });

  it('trust only the values each one can take', () => {
    expect(preferencesFrom('no')).toBeUndefined();
    expect(
      preferencesFrom({
        font: 'browser',
        fontSize: 99,
        zoom: 125,
        tabSize: 2,
        insertSpaces: 'yes',
        wordWrap: true,
        minimap: false,
        autoSave: 'afterDelay',
        trimTrailingWhitespace: true,
        insertFinalNewline: 1,
      }),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      font: 'browser',
      zoom: 125,
      tabSize: 2,
      wordWrap: true,
      minimap: false,
      autoSave: 'afterDelay',
      trimTrailingWhitespace: true,
    });
  });

  it('are kept for this browser once changed, for every tab', () => {
    useEditorPreferences.getState().set('minimap', false);
    expect(initialPreferences().minimap).toBe(false);
  });
});

describe('the editor on screen', () => {
  it('is the folder mounted last, until it goes', () => {
    const { mount } = useEditorUi.getState();

    expect(mountedFolder()).toBeNull();
    const first = mount('/r/a');
    const second = mount('/r/b');
    expect(mountedFolder()).toBe('/r/b');
    second();
    second();
    expect(mountedFolder()).toBe('/r/a');
    first();
    expect(mountedFolder()).toBeNull();
    useEditorUi.getState().setHelpOpen(true);
    expect(useEditorUi.getState().helpOpen).toBe(true);
  });
});
