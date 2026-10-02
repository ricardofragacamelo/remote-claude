import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { commandRegistry, useCommands, usePalette } from '@/features/commands';
import { CHOICE_MODE } from '@/features/editor/hooks/choices';
import { openDiff, openFile } from '@/features/editor/hooks/tabs';
import {
  RECENT_FILES_MODE,
  REVEAL_IN_EXPLORER,
  useEditorCommands,
} from '@/features/editor/hooks/useEditorCommands';
import { showView } from '@/features/editor/hooks/views';
import { createPlainEngine } from '@/features/editor/lib/plain-engine';
import { editorStoreOf, isDirty } from '@/features/editor/store/editor.store';
import { useEditorUi } from '@/features/editor/store/ui.store';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import { FOLDER, editorState, openedModel } from '../../../../support/editor';
import { fakeDisk } from '../../../../support/editor-disk';
import { providers } from '../../../../support/render';

const stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
});

function RecentMenu(): null {
  return null;
}

function commands(): void {
  const hook = renderHook(
    () => {
      useEditorCommands(FOLDER, RecentMenu);
    },
    { wrapper: providers() },
  );
  stops.push(hook.unmount);
}

function command(id: string) {
  const found = commandRegistry.command(id);
  if (found === undefined) throw new Error(`${id} is not registered`);
  return found;
}

const available = (id: string) => command(id).when?.() !== false;
const run = async (id: string) => {
  await act(async () => {
    await command(id).run();
  });
};

/** A view of the group with the focus, as the editor makes it — to act on. */
function aView() {
  const host = document.createElement('div');
  document.body.append(host);
  const view = createPlainEngine().createView(host, {
    label: 'x',
    fontSize: 13,
    fontFamily: 'monospace',
    tabSize: 4,
    insertSpaces: true,
    wordWrap: false,
    minimap: false,
    readOnly: false,
    light: false,
  });
  stops.push(showView(FOLDER, editorState().activeGroup, view));
  return view;
}

describe('the commands of the editor — plan 07, S-265', () => {
  it('are unavailable while nothing is open, and the help is always there', async () => {
    fakeDisk(FOLDER, {});
    commands();

    for (const id of [
      'editor.save',
      'editor.saveAs',
      'editor.saveAll',
      'editor.revert',
      'editor.closeTab',
      'editor.reopenClosed',
      'editor.openToSide',
      'editor.focusNextGroup',
      'editor.find',
      'editor.undo',
      'editor.changeEol',
      'editor.addToClaude',
      'editor.revealInExplorer',
      'editor.openRecentFile',
    ]) {
      expect(available(id)).toBe(false);
    }
    await run('editor.showHelp');
    expect(useEditorUi.getState().helpOpen).toBe(true);
    for (const id of [
      'editor.save',
      'editor.saveAs',
      'editor.revert',
      'editor.compareWithSaved',
      'editor.closeTab',
      'editor.closeOthers',
      'editor.openToSide',
      'editor.addToClaude',
      'editor.changeEol',
    ]) {
      await run(id);
    }
    expect(editorState().saveAs).toBeNull();
  });

  it('save, save as, save all, revert and compare the file on screen', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a' });
    commands();
    const model = await openedModel('a.ts');

    expect(available('editor.revert')).toBe(false);
    model.setValue('b');
    expect(available('editor.saveAll')).toBe(true);
    await run('editor.compareWithSaved');
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toContain(
      'diff:disk:a.ts|buffer:a.ts',
    );
    openFile(FOLDER, 'a.ts');

    await run('editor.revert');
    await vi.waitFor(() => {
      expect(model.getValue()).toBe('a');
    });
    model.setValue('c');
    await run('editor.save');
    await vi.waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('c');
    });
    model.setValue('d');
    await run('editor.saveAll');
    expect(disk.files.get('a.ts')?.content).toBe('d');
    await run('editor.saveAs');
    expect(editorState().saveAs).toEqual({ path: 'a.ts', taken: null, failure: null });
  });

  it('close, reopen, open to the side and move between groups', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    commands();
    await openedModel('a.ts');
    await openedModel('b.ts');

    await run('editor.closeOthers');
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual(['file:b.ts']);
    await run('editor.closeTab');
    expect(isDirty(editorState().docs['b.ts'])).toBe(false);
    expect(available('editor.reopenClosed')).toBe(true);
    await run('editor.reopenClosed');
    await run('editor.closeSaved');
    await run('editor.reopenClosed');
    await run('editor.closeAll');
    await run('editor.reopenClosed');

    await run('editor.openToSide');
    expect(editorState().groups).toHaveLength(2);
    expect(available('editor.focusNextGroup')).toBe(true);
    const second = editorState().activeGroup;
    await run('editor.focusNextGroup');
    expect(editorState().activeGroup).not.toBe(second);
    await run('editor.focusPreviousGroup');
    expect(editorState().activeGroup).toBe(second);
  });

  it('find, replace, go to a line, undo and redo in the view on screen', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    commands();
    const model = await openedModel('a.ts');
    const view = aView();
    const find = vi.spyOn(view, 'find');
    const goToLine = vi.spyOn(view, 'goToLine');

    // The simplified mode has no find of its own: the commands are not offered there.
    expect(available('editor.find')).toBe(false);
    Object.defineProperty(view, 'capabilities', { value: { find: true, goToLine: true } });
    expect(available('editor.find')).toBe(true);
    await run('editor.find');
    await run('editor.replace');
    await run('editor.goToLine');
    expect(find.mock.calls).toEqual([[false], [true]]);
    expect(goToLine).toHaveBeenCalledTimes(1);

    model.setValue('b');
    expect(available('editor.undo')).toBe(true);
    await run('editor.undo');
    expect(model.getValue()).toBe('a');
    expect(available('editor.redo')).toBe(true);
    await run('editor.redo');
    expect(model.getValue()).toBe('b');
  });

  it('offer the choices of the status bar in the palette, and the files opened last', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    commands();
    await openedModel('a.ts');

    for (const id of [
      'editor.changeEol',
      'editor.changeLanguage',
      'editor.convertIndentation',
      'editor.reopenWithEncoding',
      'editor.saveWithEncoding',
    ]) {
      usePalette.getState().close();
      await run(id);
      expect(usePalette.getState()).toMatchObject({ open: true, mode: CHOICE_MODE });
    }

    usePalette.getState().close();
    expect(available('editor.openRecentFile')).toBe(true);
    await run('editor.openRecentFile');
    expect(usePalette.getState().mode).toBe(RECENT_FILES_MODE);
    expect(command('editor.openRecentFile').fileMenu?.submenu).toBe(RecentMenu);
  });

  it('add to Claude’s context and reveal in the explorer only when somebody does them (S-276)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    commands();
    await openedModel('a.ts');
    const add = vi.fn();
    const reveal = vi.fn();

    expect(available('editor.addToClaude')).toBe(false);
    stops.push(claudeContextTargets.register({ id: 'chat', position: 1, add }));
    expect(available('editor.addToClaude')).toBe(true);
    await run('editor.addToClaude');
    expect(add).toHaveBeenCalledWith({ folder: FOLDER, entries: [{ path: 'a.ts', kind: 'file' }] });

    const explorer = renderHook(
      () => {
        useCommands([
          {
            id: REVEAL_IN_EXPLORER,
            labelKey: 'command.editor.revealInExplorer',
            category: 'view',
            run: reveal,
          },
        ]);
      },
      { wrapper: providers() },
    );
    expect(available('editor.revealInExplorer')).toBe(true);
    await run('editor.revealInExplorer');
    expect(reveal).toHaveBeenCalledTimes(1);
    explorer.unmount();
  });

  it('act on nothing when the tab on screen is a diff', async () => {
    fakeDisk(FOLDER, {});
    commands();
    openDiff(FOLDER, { path: 'a', source: 'disk' }, { path: 'b', source: 'disk' });

    expect(available('editor.closeTab')).toBe(true);
    expect(available('editor.save')).toBe(false);
    expect(editorStoreOf(FOLDER).getState().groups[0]?.tabs).toHaveLength(1);
  });
});
