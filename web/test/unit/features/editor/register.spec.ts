import { afterEach, describe, expect, it, vi } from 'vitest';

import '@/features/editor';
import { settingsSections } from '@/features/settings';
import { editorAreas, folderTabKeepers, statusBarItems, tabRestorers } from '@/features/workbench';
import {
  EDITOR_RESTORER,
  guardUnload,
  registerEditor,
  unregisterEditor,
} from '@/features/editor/register';
import { openFile } from '@/features/editor/hooks/tabs';
import { editorStoreOf } from '@/features/editor/store/editor.store';
import { FOLDER, editorState, openedModel } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the editor in the places of the workbench — plan 07, F5', () => {
  it('fills the editor area, the status bar, Settings › Editor, and what a reload gives back', () => {
    expect(editorAreas.entries().map((entry) => entry.id)).toEqual(['editor']);
    expect(statusBarItems.entries().map((entry) => entry.id)).toContain('editor');
    expect(tabRestorers.entries().map((entry) => entry.id)).toContain('editor.tabs');
    expect(folderTabKeepers.entries().map((entry) => entry.id)).toEqual(['editor']);
    expect(settingsSections.entries().find((entry) => entry.id === 'editor')?.options).toHaveLength(
      10,
    );
  });

  it('refuses a second registration, and is taken back out whole', () => {
    expect(() => registerEditor()).toThrow(/already registered/);

    unregisterEditor();
    expect(editorAreas.entries()).toEqual([]);
    expect(tabRestorers.entries().map((entry) => entry.id)).not.toContain('editor.tabs');
    expect(settingsSections.entries().map((entry) => entry.id)).not.toContain('editor');

    registerEditor();
    expect(editorAreas.entries().map((entry) => entry.id)).toEqual(['editor']);
  });
});

describe('what a reload gives back — plan 07, S-216, S-261', () => {
  it('keeps paths only, and tells only when they change — typing is not one', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'secret text' });
    const listener = vi.fn();
    const stop = EDITOR_RESTORER.subscribe(FOLDER, listener);

    const model = await openedModel('a.ts');
    const told = listener.mock.calls.length;
    model.setValue('more secret text');
    expect(listener).toHaveBeenCalledTimes(told);
    expect(JSON.stringify(EDITOR_RESTORER.capture(FOLDER))).not.toContain('secret');
    stop();
  });

  it('puts the tabs back, each file to be read when it shows', () => {
    EDITOR_RESTORER.apply(`${FOLDER}/pkg`, {
      groups: [
        { tabs: [{ kind: 'file', path: 'x.ts', preview: false, pinned: false }], active: 0 },
      ],
      activeGroup: 0,
      recent: ['x.ts'],
    });

    const state = editorStoreOf(`${FOLDER}/pkg`).getState();
    expect(state.docs['x.ts']?.status).toBe('idle');
    expect(state.recent).toEqual(['x.ts']);
    expect(EDITOR_RESTORER.parse({ groups: [] })).toEqual({
      groups: [],
      activeGroup: 0,
      recent: [],
    });
  });
});

describe('leaving with unsaved changes — plan 07, S-261, S-262', () => {
  it('asks the browser first, and lists the files a closing folder tab would lose', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    const keeper = folderTabKeepers.entries()[0];
    const quiet = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;

    guardUnload(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    expect(keeper?.unsaved('/never/opened')).toEqual([]);

    const model = await openedModel('a.ts');
    openFile(FOLDER, 'b.ts');
    model.setValue('mine');
    const leaving = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(leaving);

    expect(leaving.defaultPrevented).toBe(true);
    expect(keeper?.unsaved(FOLDER)).toEqual(['a.ts']);
    expect(Object.keys(editorState().docs)).toEqual(['a.ts', 'b.ts']);
  });
});
