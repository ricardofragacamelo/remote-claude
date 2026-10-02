import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { explorerStore } from '@/features/explorer';
import { FileMenu } from '@/features/commands';
import { claudeContextTargets, FILES_DRAG_TYPE } from '@/shared/lib/files-drag';
import type { FilesDragPayload } from '@/shared/lib/files-drag';
import { editorFake, resetEditorFake, setActiveFile } from '../../../support/editor-fake';
import { APP, renderExplorer, row, theTree } from '../../../support/explorer';
import { etagOf, filesRefusal } from '../../../support/files-api';
import type { FakeCall, FakeFolder } from '../../../support/files-api';
import { render, translator } from '../../../support/render';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetEditorFake();
});

type User = ReturnType<typeof userEvent.setup>;

/** Whether a delete was the one kept in the local history (07 · B-58), not the definitive one. */
function keptInHistory(call: FakeCall): boolean {
  return call.query.get('keepInHistory') === 'true';
}

/** The definitive deletes the folder was sent — the ones asked for. */
function definitive(disk: FakeFolder): FakeCall[] {
  return disk.callsTo('DELETE', '/files').filter((call) => !keptInHistory(call));
}

/** Opens the context menu of a row, as a right click does. */
async function menuOf(name: string): Promise<HTMLElement> {
  fireEvent.contextMenu(await row(name));
  return screen.findByRole('menu', { name: t('explorer.menu.label') });
}

async function pick(user: User, name: string, actionKey: string): Promise<void> {
  const menu = await menuOf(name);
  await user.click(within(menu).getByRole('menuitem', { name: item(actionKey) }));
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A menu item by its label — followed by its key, or nothing; never by a longer label. */
function item(key: string): RegExp {
  return new RegExp(`^${escape(t(key))}(?![a-z ])`);
}

/** Puts the keyboard on a row, as a click does without opening it. */
async function onRow(name: string): Promise<HTMLElement> {
  const item = await row(name);
  act(() => {
    item.focus();
  });
  return item;
}

/** Runs a command from the palette, by what it says. */
async function fromPalette(user: User, label: string): Promise<void> {
  await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
  const palette = await screen.findByRole('dialog');
  await user.type(within(palette).getByRole('combobox'), label);
  await user.click(await within(palette).findByRole('option', { name: new RegExp(escape(label)) }));
}

describe('a new file and a new folder, named in place — S-168', () => {
  it('creates the file where the selection is, shows it and opens it in the editor', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'src/a.ts': 'a' });
    await user.click(await row('src'));
    await row('a.ts');

    await pick(user, 'src', 'explorer.action.newFile');
    const field = await screen.findByRole('textbox', { name: t('explorer.name.newFile') });
    await user.type(field, 'b.ts{Enter}');

    expect(await row('b.ts')).toHaveAttribute('aria-selected', 'true');
    expect(disk.entries.get('src/b.ts')?.content).toBe('');
    expect(editorFake.openFile).toHaveBeenCalledWith(APP, 'src/b.ts');
  });

  it('creates a folder, which does not open in the editor', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a' });
    await onRow('a.ts');

    await user.keyboard('{Shift>}{Alt>}n{/Alt}{/Shift}');
    await user.type(
      await screen.findByRole('textbox', { name: t('explorer.name.newFolder') }),
      'lib{Enter}',
    );

    expect(await row('lib')).toBeVisible();
    expect(disk.entries.get('lib')?.kind).toBe('directory');
    expect(editorFake.openFile).not.toHaveBeenCalledWith(APP, 'lib');
  });
});

describe('from a template, and from this file — S-169, S-170', () => {
  it('suggests the extension and starts the file with the markers resolved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 9, 1, 12) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const { disk } = renderExplorer({ 'a.ts': 'a' });
    await onRow('a.ts');

    await user.keyboard('{Alt>}t{/Alt}');
    const dialog = await screen.findByRole('dialog', { name: t('explorer.template.title') });
    await user.click(
      within(dialog).getByRole('button', { name: new RegExp(t('explorer.template.markdown')) }),
    );

    const field = await screen.findByRole('textbox', { name: t('explorer.name.newFile') });
    expect(field).toHaveValue('notes.md');
    expect((field as HTMLInputElement).selectionEnd).toBe('notes'.length);
    await user.keyboard('plan{Enter}');

    await row('plan.md');
    expect(disk.entries.get('plan.md')?.content).toBe('# plan\n\n_2026-10-01_\n');
  });

  it('starts a new file with the text of the one selected', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'base.ts': 'export const base = 1;\n' });

    await pick(user, 'base.ts', 'explorer.action.newFromFile');
    const field = await screen.findByRole('textbox', { name: t('explorer.name.newFile') });
    expect(field).toHaveValue('base copy.ts');
    await user.clear(field);
    await user.type(field, 'derived.ts{Enter}');

    await row('derived.ts');
    expect(disk.entries.get('derived.ts')?.content).toBe('export const base = 1;\n');
    expect(disk.callsTo('POST', '/files')[0]?.body).toMatchObject({
      path: 'derived.ts',
      kind: 'file',
      content: 'export const base = 1;\n',
    });
  });
});

describe('renaming in place — S-171, S-172', () => {
  it('renames with F2, and Esc gives up with nothing sent', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'old.ts': 'o' });
    await onRow('old.ts');

    await user.keyboard('{F2}');
    const field = await screen.findByRole('textbox', {
      name: t('explorer.name.rename', { name: 'old.ts' }),
    });
    expect(field).toHaveValue('old.ts');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    expect(disk.callsTo('POST', '/files/move')).toHaveLength(0);

    await user.keyboard('{F2}');
    await user.clear(await screen.findByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'new.ts{Enter}');

    expect(await row('new.ts')).toBeVisible();
    expect(editorFake.entryMoved).toHaveBeenCalledWith(APP, 'old.ts', 'new.ts');
  });

  it('refuses an impossible name before sending anything', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'old.ts': 'o', 'other.ts': 'x' });
    await onRow('old.ts');
    await user.keyboard('{F2}');
    const field = await screen.findByRole('textbox');

    await user.clear(field);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('explorer.name.empty'));
    await user.type(field, 'a/b');
    expect(screen.getByRole('alert')).toHaveTextContent(t('explorer.name.separator'));
    await user.clear(field);
    await user.type(field, 'other.ts{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(t('explorer.name.exists'));

    expect(disk.callsTo('POST', '/files/move')).toHaveLength(0);
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('says a name the server finds taken, and keeps what was typed', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a' });
    disk.refuseNext(
      (call) => call.route === '/files',
      filesRefusal('FILE_EXISTS', 'files.error.exists', { path: 'b.ts' }),
    );
    await onRow('a.ts');

    await user.keyboard('{Alt>}n{/Alt}');
    await user.type(await screen.findByRole('textbox'), 'b.ts{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('files.error.exists', { path: 'b.ts' }),
    );
    expect(screen.getByRole('textbox')).toHaveValue('b.ts');
  });
});

describe('deleting — S-173, S-174, S-181', () => {
  it('asks first, keeps the focus off the destructive button, and asks again with the count', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'full/a.ts': 'a', 'full/inner/b.ts': 'b', 'z.ts': 'z' });
    await onRow('full');

    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.delete.titleOne', { path: 'full' }),
    });
    expect(within(dialog).getByRole('button', { name: t('explorer.delete.keep') })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: t('explorer.delete.confirm') }));

    expect(
      await screen.findByText(t('explorer.delete.holds', { path: 'full', count: 3 })),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: t('explorer.delete.confirm') })).not.toHaveFocus();
    await user.click(screen.getByRole('button', { name: t('explorer.delete.confirm') }));

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'full' })).toBeNull();
    });
    const last = disk.callsTo('DELETE', '/files').at(-1);
    expect(last?.query.get('recursive')).toBe('true');
    expect(last?.query.get('expectedEntries')).toBe('3');
  });

  it('sends one request however many times the button is pressed', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a' });
    const release = disk.hold((call) => call.method === 'DELETE' && !keptInHistory(call));
    await onRow('a.ts');
    await user.keyboard('{Delete}');
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', {
      name: t('explorer.delete.confirm'),
    });

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    release();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(definitive(disk)).toHaveLength(1);
  });

  it('deletes many with one confirmation, and keeps them when told to', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');

    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.delete.titleMany', { count: 2 }),
    });
    expect(
      within(dialog).getByRole('list', { name: t('explorer.delete.listLabel') }),
    ).toHaveTextContent('a.ts');
    await user.click(within(dialog).getByRole('button', { name: t('explorer.delete.keep') }));
    expect(definitive(disk)).toHaveLength(0);

    await user.keyboard('{Delete}');
    await user.click(await screen.findByRole('button', { name: t('explorer.delete.confirm') }));
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'a.ts' })).toBeNull();
    });
    expect(screen.queryByRole('treeitem', { name: 'b.ts' })).toBeNull();
    expect(await row('c.ts')).toBeVisible();
  });

  it('asks the second step for a file that changes what Claude may do — once', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ '.mcp.json': '{}' });
    await onRow('.mcp.json');

    await user.keyboard('{Delete}');
    const step = await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });
    await user.click(within(step).getByRole('button', { name: t('explorer.sensitive.confirm') }));
    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.delete.titleOne', { path: '.mcp.json' }),
    });
    await user.click(within(dialog).getByRole('button', { name: t('explorer.delete.confirm') }));

    await waitFor(() => {
      expect(disk.entries.has('.mcp.json')).toBe(false);
    });
    expect(disk.callsTo('DELETE', '/files').at(-1)?.query.get('confirmSensitive')).toBe('true');
  });
});

describe('moving — S-175, S-176, S-183', () => {
  it('moves by dragging onto a folder', async () => {
    const { disk } = renderExplorer({ 'a.ts': 'a', lib: { kind: 'directory' } });
    const data = dataTransfer();

    fireEvent.dragStart(await row('a.ts'), { dataTransfer: data });
    fireEvent.dragOver(await row('lib'), { dataTransfer: data });
    fireEvent.drop(await row('lib'), { dataTransfer: data });

    await waitFor(() => {
      expect(disk.entries.has('lib/a.ts')).toBe(true);
    });
    expect(editorFake.entryMoved).toHaveBeenCalledWith(APP, 'a.ts', 'lib/a.ts');
  });

  it('moves from the keyboard with "Move to…", and refuses a folder into itself', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'src/a.ts': 'a', 'b.ts': 'b' });
    await user.click(await row('src'));
    await row('a.ts');
    await user.click(await row('src'));
    await onRow('src');

    await user.keyboard('{Alt>}m{/Alt}');
    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.move.title', { count: 1 }),
    });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: t('explorer.move.destination') }),
      'src',
    );
    await user.click(within(dialog).getByRole('button', { name: t('explorer.move.confirm') }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      t('explorer.invalid.intoItself', { path: 'src' }),
    );
    expect(disk.callsTo('POST', '/files/move')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: t('explorer.move.cancel') }));

    await user.click(await row('b.ts'));
    await user.keyboard('{Alt>}m{/Alt}');
    const again = await screen.findByRole('dialog');
    await user.selectOptions(within(again).getByRole('combobox'), 'src');
    await user.click(within(again).getByRole('button', { name: t('explorer.move.confirm') }));

    await waitFor(() => {
      expect(disk.entries.has('src/b.ts')).toBe(true);
    });
  });

  it('refuses a dragged batch into one of its own folders whole, before any request', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'src/a.ts': 'a', 'b.ts': 'b' });
    await user.click(await row('src'));
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    const data = dataTransfer();

    fireEvent.dragStart(await row('b.ts'), { dataTransfer: data });
    fireEvent.drop(await row('src'), { dataTransfer: data });

    expect(
      await screen.findByRole('dialog', { name: t('explorer.outcome.moveFailed') }),
    ).toHaveTextContent(t('explorer.invalid.intoItself', { path: 'src' }));
    expect(disk.callsTo('POST', '/files/move')).toHaveLength(0);
  });
});

describe('copy, cut, paste and duplicate — S-177, S-182', () => {
  it('copies beside itself under a new name, and pastes a cut into a folder', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a', lib: { kind: 'directory' } });
    await onRow('a.ts');

    await user.keyboard('{Control>}c{/Control}');
    await user.keyboard('{Control>}v{/Control}');
    expect(await row('a copy.ts')).toBeVisible();

    await user.click(await row('a.ts'));
    await user.keyboard('{Control>}d{/Control}');
    expect(await row('a copy 2.ts')).toBeVisible();

    await user.click(await row('a.ts'));
    await user.keyboard('{Control>}x{/Control}');
    expect(await row('a.ts')).toHaveClass('opacity-60');
    await user.click(await row('lib'));
    await user.keyboard('{Control>}v{/Control}');
    await waitFor(() => {
      expect(disk.entries.has('lib/a.ts')).toBe(true);
    });
    expect(disk.entries.has('a.ts')).toBe(false);
  });

  it('tells, for a batch, what went, what did not and why', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a', 'b.ts': 'b', lib: { kind: 'directory' } });
    disk.refuseNext(
      (call) => call.route === '/files/copy' && call.body?.['from'] === 'b.ts',
      filesRefusal('FILE_EXISTS', 'files.error.exists', { path: 'lib/b.ts' }),
    );
    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}{Control>}c{/Control}');
    await user.click(await row('lib'));
    await user.keyboard('{Control>}v{/Control}');

    const outcome = await screen.findByRole('dialog', { name: t('explorer.outcome.pasteFailed') });
    const lines = within(outcome).getAllByRole('listitem');
    expect(lines[0]).toHaveTextContent(t('explorer.outcome.done'));
    expect(lines[1]).toHaveTextContent(t('files.error.exists', { path: 'lib/b.ts' }));
    expect(disk.entries.has('lib/a.ts')).toBe(true);
  });
});

describe('paths, reveal, open to the side, compare — S-178, S-179', () => {
  it('copies the absolute and the relative path', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'src/a.ts': 'a' });
    await onRow('src');

    await user.keyboard('{Shift>}{Alt>}c{/Alt}{/Shift}');
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe(`${APP}/src`);
    });
    await user.keyboard('{Control>}{Shift>}{Alt>}c{/Alt}{/Shift}{/Control}');
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe('src');
    });
  });

  it('reveals the active file of the editor: opens the folders above it and selects it', async () => {
    const user = userEvent.setup();
    setActiveFile('src/deep/a.ts');
    renderExplorer({ 'src/deep/a.ts': 'a', 'src/b.ts': 'b' });
    await row('src');

    await user.keyboard('{Shift>}{Alt>}r{/Alt}{/Shift}');

    const revealed = await row('a.ts');
    expect(revealed).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(revealed).toHaveFocus();
    });
  });

  it('opens a file to the side, and compares two selected files', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a', 'b.ts': 'b' });
    await onRow('a.ts');

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(editorFake.openFile).toHaveBeenCalledWith(APP, 'a.ts', { toSide: true });

    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}{Alt>}k{/Alt}');
    expect(editorFake.openDiff).toHaveBeenCalledWith(
      APP,
      { path: 'a.ts', source: 'disk' },
      { path: 'b.ts', source: 'disk' },
    );
  });
});

describe('every action in three places — S-180, S-13, S-201', () => {
  it('opens the context menu without hiding the page from a screen reader — S-289', async () => {
    renderExplorer({ 'a.ts': 'a' });
    const tree = await theTree();

    await menuOf('a.ts');

    // A menu is not a dialog: nothing outside it is `aria-hidden` while it stays focusable.
    expect(tree.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.querySelectorAll('[data-aria-hidden="true"]')).toHaveLength(0);
  });

  it('is in the context menu, with its key', async () => {
    const menu = await (async () => {
      renderExplorer({ 'a.ts': 'a' });
      return menuOf('a.ts');
    })();

    for (const key of [
      'explorer.action.newFile',
      'explorer.action.rename',
      'explorer.action.delete',
      'explorer.action.copy',
      'explorer.action.moveTo',
      'explorer.action.copyPath',
      'explorer.action.openToSide',
    ]) {
      expect(within(menu).getByRole('menuitem', { name: item(key) })).toBeVisible();
    }

    expect(
      within(menu).getByRole('menuitem', { name: item('explorer.action.rename') }),
    ).toHaveAttribute('aria-keyshortcuts', 'F2');
    expect(
      within(menu).queryByRole('menuitem', {
        name: new RegExp(escape(t('explorer.action.addToContext'))),
      }),
    ).toBeNull();
  });

  it('is in the palette, filed under File, with its key — and runs from it', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a' });
    await onRow('a.ts');

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    const palette = await screen.findByRole('dialog');
    await user.type(within(palette).getByRole('combobox'), t('explorer.action.rename'));
    const option = await within(palette).findByRole('option', {
      name: new RegExp(escape(`${t('command.category.file')}: ${t('explorer.action.rename')}`)),
    });
    expect(option).toHaveTextContent('F2');
    await user.click(option);

    expect(
      await screen.findByRole('textbox', { name: t('explorer.name.rename', { name: 'a.ts' }) }),
    ).toBeVisible();
  });

  it('puts the actions that make something new in the File menu', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a' });
    await row('a.ts');
    render(<FileMenu />);

    await user.click(screen.getByRole('menuitem', { name: t('fileMenu.file.title') }));
    for (const key of [
      'explorer.action.newFile',
      'explorer.action.newFolder',
      'explorer.action.newFromTemplate',
    ]) {
      expect(await screen.findByRole('menuitem', { name: item(key) })).toBeVisible();
    }
    await user.click(screen.getByRole('menuitem', { name: item('explorer.action.newFolder') }));
    expect(
      await screen.findByRole('textbox', { name: t('explorer.name.newFolder') }),
    ).toBeVisible();
  });

  it('runs a toolbar action from the palette too — Show hidden entries', async () => {
    const user = userEvent.setup();
    renderExplorer({ '.env': { kind: 'file', content: '', hidden: true }, 'a.ts': 'a' });
    await row('a.ts');

    await fromPalette(user, t('explorer.action.showHidden'));

    expect(await row('.env')).toBeVisible();
    expect(explorerStore(APP).getState().showHidden).toBe(true);
  });
});

describe("Claude's context, from the tree — S-269, S-270, S-276, S-277, S-279", () => {
  it('drags one entry, or the selection in the order of the tree, folders as folders', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'b.ts': 'b', 'a.ts': 'a', lib: { kind: 'directory' } });
    const single = dataTransfer();
    fireEvent.dragStart(await row('a.ts'), { dataTransfer: single });
    expect(JSON.parse(single.getData(FILES_DRAG_TYPE))).toEqual({
      folder: APP,
      entries: [{ path: 'a.ts', kind: 'file' }],
    });
    expect(single.getData('text/plain')).toBe('a.ts');

    await user.click(await row('lib'));
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    const many = dataTransfer();
    fireEvent.dragStart(await row('b.ts'), { dataTransfer: many });
    expect((JSON.parse(many.getData(FILES_DRAG_TYPE)) as FilesDragPayload).entries).toEqual([
      { path: 'lib', kind: 'directory' },
      { path: 'a.ts', kind: 'file' },
      { path: 'b.ts', kind: 'file' },
    ]);

    fireEvent.dragEnd(await row('b.ts'), { dataTransfer: many });
    expect(explorerStore(APP).getState().selection).toHaveLength(3);
  });

  it('offers "Add to Claude\'s context" only with somebody to take it, and says what it did', async () => {
    const user = userEvent.setup();
    const add = vi.fn();
    const unregister = claudeContextTargets.register({ id: 'panel', position: 1, add });
    renderExplorer({ 'a.ts': 'a', escape: { kind: 'symlink', outside: true } });

    try {
      const menu = await menuOf('a.ts');
      expect(
        within(menu).getByRole('menuitem', {
          name: new RegExp(escape(t('explorer.action.addToContext'))),
        }),
      ).toBeVisible();
      await user.keyboard('{Escape}');

      await onRow('a.ts');
      await user.keyboard('{Shift>}{Alt>}a{/Alt}{/Shift}');
      expect(add).toHaveBeenCalledWith({ folder: APP, entries: [{ path: 'a.ts', kind: 'file' }] });
      expect(
        await screen.findByText(t('explorer.context.added', { count: 1 })),
      ).toBeInTheDocument();
    } finally {
      unregister();
    }
  });
});

describe('new entries of a sensitive name ask the second step — 07 · D-15', () => {
  it('asks, and creates once confirmed', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a' });
    await onRow('a.ts');

    await user.keyboard('{Alt>}n{/Alt}');
    await user.type(await screen.findByRole('textbox'), '.mcp.json{Enter}');
    const step = await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });
    await user.click(within(step).getByRole('button', { name: t('explorer.sensitive.confirm') }));

    await waitFor(() => {
      expect(disk.entries.get('.mcp.json')?.content).toBe('');
    });
    expect(etagOf('')).toBe('"0:"');
  });
});

/** A `DataTransfer` jsdom does not have. */
function dataTransfer(): DataTransfer {
  const data = new Map<string, string>();

  return {
    get types() {
      return [...data.keys()];
    },
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
    getData: (format: string) => data.get(format) ?? '',
    dropEffect: 'none',
    effectAllowed: 'all',
  } as unknown as DataTransfer;
}

void theTree;
