import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openFile } from '@/features/editor';
import { FILES_DRAG_TYPE, claudeContextTargets, readFilesDrag } from '@/shared/lib/files-drag';
import { FOLDER, editorOf, press, renderEditor, stripOf } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { translator } from '../../../support/render';

const t = translator('en');
const stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
});

/** Claude's panel, as plan 08 will register it: whatever it is handed. */
function aClaudePanel(): ReturnType<typeof vi.fn> {
  const add = vi.fn();
  stops.push(claudeContextTargets.register({ id: 'claude-panel', position: 1, add }));
  return add;
}

async function opened(path: string): Promise<HTMLTextAreaElement> {
  act(() => {
    openFile(FOLDER, path);
  });
  return editorOf(path.slice(path.lastIndexOf('/') + 1));
}

describe('editor tabs towards Claude — plan 07, B-42', () => {
  it('drag as the file they show: the typed payload, and the path as text (S-272)', async () => {
    fakeDisk(FOLDER, { 'src/a.ts': 'a' });
    renderEditor();
    await opened('src/a.ts');
    const data = new Map<string, string>();
    const transfer = {
      effectAllowed: 'all',
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
    };

    act(() => {
      const start = new Event('dragstart', { bubbles: true });
      Object.assign(start, { dataTransfer: transfer });
      within(stripOf()).getByRole('button', { name: 'a.ts' }).dispatchEvent(start);
    });

    expect(JSON.parse(data.get(FILES_DRAG_TYPE) ?? 'null')).toEqual({
      folder: FOLDER,
      entries: [{ path: 'src/a.ts', kind: 'file' }],
    });
    expect(readFilesDrag(transfer)).toEqual({
      folder: FOLDER,
      entries: [{ path: 'src/a.ts', kind: 'file' }],
    });
    expect(data.get('text/plain')).toBe('src/a.ts');
  });

  it('publish nothing when the drag is let go of nowhere (S-279)', async () => {
    const add = aClaudePanel();
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    await opened('a.ts');
    const tab = within(stripOf()).getByRole('button', { name: 'a.ts' });
    const transfer = { effectAllowed: 'all', setData: vi.fn(), getData: () => '' };

    act(() => {
      const start = new Event('dragstart', { bubbles: true });
      Object.assign(start, { dataTransfer: transfer });
      tab.dispatchEvent(start);
      tab.dispatchEvent(new Event('dragend', { bubbles: true }));
    });

    expect(add).not.toHaveBeenCalled();
  });

  it('add the file from the tab menu, and the selection with its range from the keyboard (S-275, S-277)', async () => {
    const user = userEvent.setup();
    const add = aClaudePanel();
    fakeDisk(FOLDER, { 'a.ts': 'one\ntwo' });
    renderEditor();
    const area = await opened('a.ts');

    await user.pointer({
      keys: '[MouseRight]',
      target: within(stripOf()).getByRole('button', { name: 'a.ts' }),
    });
    await user.click(
      await screen.findByRole('menuitem', { name: t('editor.tabMenu.addToClaude') }),
    );
    expect(add).toHaveBeenLastCalledWith({
      folder: FOLDER,
      entries: [{ path: 'a.ts', kind: 'file' }],
    });

    act(() => {
      area.focus();
      area.setSelectionRange(1, 6);
    });
    press(area, { key: 'k', code: 'KeyK', ctrlKey: true });
    press(area, { key: 'a', code: 'KeyA' });

    expect(add).toHaveBeenLastCalledWith({
      folder: FOLDER,
      entries: [],
      selection: {
        path: 'a.ts',
        range: { startLine: 1, startColumn: 2, endLine: 2, endColumn: 3 },
      },
    });
    expect(await screen.findByText(t('editor.claude.added', { path: 'a.ts' }))).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('are not offered while nobody takes files into Claude’s context (S-276)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    const area = await opened('a.ts');

    await user.pointer({
      keys: '[MouseRight]',
      target: within(stripOf()).getByRole('button', { name: 'a.ts' }),
    });
    expect(await screen.findByRole('menuitem', { name: t('editor.tabMenu.close') })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: t('editor.tabMenu.addToClaude') })).toBeNull();
    await user.keyboard('{Escape}');

    press(area, { key: 'k', code: 'KeyK', ctrlKey: true });
    press(area, { key: 'a', code: 'KeyA' });
    expect(screen.queryByText(t('editor.claude.added', { path: 'a.ts' }))).toBeNull();
  });
});
