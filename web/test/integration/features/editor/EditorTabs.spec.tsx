import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openFile } from '@/features/editor';
import {
  FOLDER,
  editorOf,
  editorState,
  press,
  renderEditor,
  stripOf,
  typeInto,
} from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

/** The tab button of a file in a strip, by its name. */
function tabOf(name: string, place = 1): HTMLElement {
  return within(stripOf(place)).getByRole('button', {
    name: new RegExp(`^${name.replace('.', '\\.')}`),
  });
}

function names(place = 1): string[] {
  return within(stripOf(place))
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('draggable'))
    .map((button) => button.querySelector('.truncate')?.textContent ?? '');
}

describe('editor tabs — plan 07, B-32', () => {
  it('open a single click as a preview, replace it with the next, and keep it on edit or double click (S-209)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    renderEditor();

    act(() => {
      openFile(FOLDER, 'a.ts', { preview: true });
    });
    await editorOf('a.ts');
    expect(tabOf('a.ts')).toHaveClass('italic');
    expect(tabOf('a.ts')).toHaveAccessibleName(`a.ts, ${t('editor.tab.preview')}`);

    act(() => {
      openFile(FOLDER, 'b.ts', { preview: true });
    });
    await editorOf('b.ts');
    expect(names()).toEqual(['b.ts']);

    await user.dblClick(tabOf('b.ts'));
    expect(tabOf('b.ts')).not.toHaveClass('italic');

    act(() => {
      openFile(FOLDER, 'c.ts', { preview: true });
    });
    typeInto(await editorOf('c.ts'), 'edited');
    act(() => {
      openFile(FOLDER, 'a.ts', { preview: true });
    });
    expect(names()).toEqual(['b.ts', 'c.ts', 'a.ts']);
  });

  it('marks a dirty tab with a dot instead of the close, and asks before closing it (S-210)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
    });
    typeInto(await editorOf('a.ts'), 'mine');

    await user.click(
      within(stripOf()).getByRole('button', { name: t('editor.tab.closeDirty', { name: 'a.ts' }) }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: t('editor.close.titleOne', { name: 'a.ts' }),
    });

    // "Don't save" loses work, and never has the focus first.
    expect(within(dialog).getByRole('button', { name: t('editor.close.save') })).toHaveFocus();
    expect(
      within(dialog).getByRole('list', { name: t('editor.close.listLabel') }),
    ).toHaveTextContent('a.ts');

    await user.click(within(dialog).getByRole('button', { name: t('editor.close.cancel') }));
    expect(names()).toEqual(['a.ts']);

    await user.click(
      within(stripOf()).getByRole('button', { name: t('editor.tab.closeDirty', { name: 'a.ts' }) }),
    );
    await user.click(await screen.findByRole('button', { name: t('editor.close.discard') }));
    expect(screen.getByText(t('editor.empty.title'))).toBeVisible();
  });

  it('saves from the question, then closes', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
    });
    typeInto(await editorOf('a.ts'), 'mine');

    await user.click(
      within(stripOf()).getByRole('button', { name: t('editor.tab.closeDirty', { name: 'a.ts' }) }),
    );
    await user.click(await screen.findByRole('button', { name: t('editor.close.save') }));

    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('mine');
    });
    expect(await screen.findByText(t('editor.empty.title'))).toBeVisible();
  });

  it('closes a clean tab without asking (S-211)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts');
    });
    await editorOf('b.ts');

    await user.click(
      within(stripOf()).getByRole('button', { name: t('editor.tab.close', { name: 'b.ts' }) }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(names()).toEqual(['a.ts']);
  });

  it('closes others, to the right, the saved ones and all from the tab menu, and reopens with Ctrl+Shift+T (S-212)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    renderEditor();
    act(() => {
      for (const path of ['a.ts', 'b.ts', 'c.ts']) openFile(FOLDER, path);
    });
    await editorOf('c.ts');

    await user.pointer({ keys: '[MouseRight]', target: tabOf('a.ts') });
    await user.click(await screen.findByRole('menuitem', { name: t('editor.tabMenu.closeRight') }));
    expect(names()).toEqual(['a.ts']);

    press(document.body, { key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(names()).toEqual(['a.ts', 'c.ts']);
    });

    await user.pointer({ keys: '[MouseRight]', target: tabOf('a.ts') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('editor.tabMenu.closeOthers') }),
    );
    expect(names()).toEqual(['a.ts']);

    await user.pointer({ keys: '[MouseRight]', target: tabOf('a.ts') });
    await user.click(await screen.findByRole('menuitem', { name: t('editor.tabMenu.closeAll') }));
    expect(await screen.findByText(t('editor.empty.title'))).toBeVisible();
  });

  it('reorders by the keyboard, and pins a tab at the left (S-213)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts');
    });
    await editorOf('b.ts');

    tabOf('b.ts').focus();
    await user.keyboard('{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}');
    expect(names()).toEqual(['b.ts', 'a.ts']);
    await user.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}');
    expect(names()).toEqual(['a.ts', 'b.ts']);
    await user.keyboard('{ArrowRight}');
    expect(names()).toEqual(['a.ts', 'b.ts']);

    await user.pointer({ keys: '[MouseRight]', target: tabOf('b.ts') });
    await user.click(await screen.findByRole('menuitem', { name: t('editor.tabMenu.pin') }));
    expect(names()).toEqual(['b.ts', 'a.ts']);
    expect(tabOf('b.ts')).toHaveAccessibleName(`b.ts, ${t('editor.tab.pinned')}`);
  });

  it('reorders by dragging a tab onto another, and onto the end of the strip (S-213)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    renderEditor();
    act(() => {
      for (const path of ['a.ts', 'b.ts', 'c.ts']) openFile(FOLDER, path);
    });
    await editorOf('c.ts');
    const transfer = dataTransfer();

    drag(tabOf('c.ts'), tabOf('a.ts'), transfer);
    expect(names()).toEqual(['c.ts', 'a.ts', 'b.ts']);
    drag(tabOf('c.ts'), within(stripOf()).getByRole('list'), transfer);
    expect(names()).toEqual(['a.ts', 'b.ts', 'c.ts']);
    // Something else dropped — a text, a file from the desktop — is not a tab of this strip.
    drop(tabOf('a.ts'), dataTransfer({ 'text/plain': 'x' }));
    expect(names()).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('focuses the tab that has the file when it is opened again (S-214)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts');
      openFile(FOLDER, 'a.ts');
    });

    await editorOf('a.ts');
    expect(names()).toEqual(['a.ts', 'b.ts']);
    expect(tabOf('a.ts')).toHaveAttribute('aria-current', 'page');
  });

  it('keeps 50 tabs in a strip that scrolls by itself, and the list reaches every one (S-215)', async () => {
    const user = userEvent.setup();
    const files = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`f${String(index)}.ts`, '']),
    );
    fakeDisk(FOLDER, files);
    renderEditor();
    act(() => {
      for (const path of Object.keys(files)) openFile(FOLDER, path);
    });
    await editorOf('f49.ts');

    expect(names()).toHaveLength(50);
    expect(within(stripOf()).getByRole('list')).toHaveClass('overflow-x-auto');
    await user.click(screen.getByRole('button', { name: t('editor.strip.list', { count: 50 }) }));
    const items = await screen.findAllByRole('menuitem');
    expect(items).toHaveLength(50);
    await user.click(items[3] as HTMLElement);
    expect(await editorOf('f3.ts')).toBeVisible();
  });

  it('lists every group’s tabs in "Open editors", dirty ones marked (S-218)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts', { toSide: true });
    });
    typeInto(await editorOf('b.ts'), 'mine');
    const section = screen.getByRole('region', { name: t('editor.openEditors.label') });

    expect(
      within(section).getByRole('heading', { name: t('editor.group.label', { place: 2 }) }),
    ).toBeVisible();
    expect(
      within(section).getByRole('button', { name: `b.ts, ${t('editor.tab.dirty')}` }),
    ).toBeVisible();
    await user.click(within(section).getByRole('button', { name: 'a.ts' }));
    expect(editorState().activeGroup).toBe(editorState().groups[0]?.id);
    await user.click(
      within(section).getByRole('button', { name: t('editor.tab.close', { name: 'a.ts' }) }),
    );
    expect(within(section).queryByRole('button', { name: 'a.ts' })).toBeNull();
    await user.click(
      within(section).getByRole('button', { name: t('editor.tab.closeDirty', { name: 'b.ts' }) }),
    );
    expect(await screen.findByRole('dialog')).toBeVisible();
  });

  it('navigates the folder from the trail above the editor (S-220)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, {
      'src/app/main.ts': 'm',
      'src/app/util.ts': 'u',
      'src/lib/x.ts': 'x',
      'top.ts': 't',
    });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'src/app/main.ts');
    });
    await editorOf('main.ts');
    const trail = screen.getByRole('navigation', {
      name: t('editor.breadcrumb.label', { place: 1 }),
    });
    const step = (name: string) =>
      within(trail).getByRole('button', { name: t('editor.breadcrumb.step', { name }) });
    expect(step('app')).toBeVisible();

    // A step lists what is beside it: the file's own step, the files of its directory.
    await user.click(step('main.ts'));
    await user.click(await screen.findByRole('menuitem', { name: 'util.ts' }));
    expect(await editorOf('util.ts')).toBeVisible();

    // A directory of the list goes into it.
    await user.click(step('src'));
    await user.click(await screen.findByRole('menuitem', { name: 'src' }));
    await user.click(await screen.findByRole('menuitem', { name: 'lib' }));
    await user.click(await screen.findByRole('menuitem', { name: 'x.ts' }));
    expect(await editorOf('x.ts')).toBeVisible();

    await user.click(
      within(trail).getByRole('button', { name: t('editor.breadcrumb.step', { name: 'lib' }) }),
    );
    await user.click(await screen.findByRole('menuitem', { name: t('editor.breadcrumb.up') }));
    expect(await screen.findByRole('menuitem', { name: 'top.ts' })).toBeVisible();
  });
});

describe('"Open recent file" of the File menu — plan 07, S-219', () => {
  it('lists the files opened last in this folder tab, newest first, and opens the one picked', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts');
    });
    await editorOf('b.ts');
    act(() => {
      editorState();
    });

    await user.click(screen.getByRole('menuitem', { name: t('fileMenu.file.title') }));
    await user.click(
      await screen.findByRole('menuitem', { name: t('command.editor.openRecentFile') }),
    );
    const items = await screen.findAllByRole('menuitem', { name: /\.ts/ });
    expect(items.map((item) => item.textContent)).toEqual(['b.tsb.ts', 'a.tsa.ts']);

    // Picked from the keyboard: a submenu of the menubar follows the focus, as a person walks it.
    act(() => {
      (items[1] as HTMLElement).focus();
    });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(tabOf('a.ts')).toHaveAttribute('aria-current', 'page');
    });
  });

  it('lists the same files in the palette, narrowed as it is typed', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts');
    });
    await editorOf('b.ts');

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), t('command.editor.openRecentFile'));
    await user.click(
      await screen.findByRole('option', { name: new RegExp(t('command.editor.openRecentFile')) }),
    );
    await user.type(screen.getByRole('combobox'), 'zzz');
    expect(await screen.findByText(t('editor.recent.empty'))).toBeVisible();
    await user.clear(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'a.tsa.ts' }));
    await waitFor(() => {
      expect(tabOf('a.ts')).toHaveAttribute('aria-current', 'page');
    });
  });
});

/** A drag's data, as the browser hands it — with what a drag of a test wrote to it. */
function dataTransfer(initial: Readonly<Record<string, string>> = {}): DataTransfer {
  const data = new Map(Object.entries(initial));

  return {
    effectAllowed: 'all',
    dropEffect: 'move',
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
    getData: (format: string) => data.get(format) ?? '',
  } as unknown as DataTransfer;
}

function drop(target: Element, transfer: DataTransfer): void {
  act(() => {
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.assign(over, { dataTransfer: transfer });
    target.dispatchEvent(over);
    const dropped = new Event('drop', { bubbles: true, cancelable: true });
    Object.assign(dropped, { dataTransfer: transfer });
    target.dispatchEvent(dropped);
  });
}

function drag(source: Element, target: Element, transfer: DataTransfer): void {
  act(() => {
    const start = new Event('dragstart', { bubbles: true });
    Object.assign(start, { dataTransfer: transfer });
    source.dispatchEvent(start);
  });
  drop(target, transfer);
}
