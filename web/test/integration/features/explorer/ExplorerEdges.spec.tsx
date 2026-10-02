import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { explorerStore } from '@/features/explorer';
import { FILES_DRAG_TYPE } from '@/shared/lib/files-drag';
import { resetEditorFake, setActiveFile } from '../../../support/editor-fake';
import { APP, renderExplorer, row, theTree } from '../../../support/explorer';
import { filesRefusal } from '../../../support/files-api';
import { translator } from '../../../support/render';
import { aViewport } from '../../../support/viewport';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetEditorFake();
});

type User = ReturnType<typeof userEvent.setup>;

async function onRow(name: string): Promise<HTMLElement> {
  const item = await row(name);
  act(() => {
    item.focus();
  });
  return item;
}

async function escapeCloses(user: User): Promise<void> {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });
}

/** A `DataTransfer` jsdom does not have. */
function dataTransfer(seed: Record<string, string> = {}): DataTransfer {
  const data = new Map<string, string>(Object.entries(seed));

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

describe('every dialog of the Explorer closes on Esc, with nothing sent', () => {
  it('delete, move, the second step and the outcome', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a', '.mcp.json': '{}' });

    await onRow('a.ts');
    await user.keyboard('{Delete}');
    await screen.findByRole('dialog');
    await escapeCloses(user);

    await onRow('a.ts');
    await user.keyboard('{Alt>}m{/Alt}');
    await screen.findByRole('dialog');
    await escapeCloses(user);

    await onRow('.mcp.json');
    await user.keyboard('{F2}');
    const field = await screen.findByRole('textbox');
    await user.clear(field);
    await user.type(field, 'mcp.json{Enter}');
    const step = await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });
    await user.click(within(step).getByRole('button', { name: t('explorer.sensitive.cancel') }));
    await onRow('.mcp.json');
    await user.keyboard('{Delete}');
    await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });
    await escapeCloses(user);

    expect(disk.callsTo('POST', '/files/move')).toHaveLength(1);
    expect(disk.entries.has('.mcp.json')).toBe(true);

    disk.refuseNext(
      (call) => call.method === 'POST',
      filesRefusal('STORAGE_FULL', 'files.error.storageFull', { path: 'a copy.ts' }),
    );
    await user.click(await row('a.ts'));
    await user.keyboard('{Control>}d{/Control}');
    await screen.findByRole('dialog', { name: t('explorer.outcome.duplicateFailed') });
    await escapeCloses(user);
  });

  it('the second step asked for a name in place, closed with Esc', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a' });
    await onRow('a.ts');
    await user.keyboard('{Alt>}n{/Alt}');
    await user.type(await screen.findByRole('textbox'), '.mcp.json{Enter}');
    await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });

    await escapeCloses(user);
  });
});

describe('deleting, where it does not all go', () => {
  it('is not dismissed by a press outside it — the second click of a double click', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a' });
    await onRow('a.ts');
    await user.keyboard('{Delete}');
    await screen.findByRole('dialog');

    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);

    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('says "at least" for a count the server capped, and what was refused', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'big/a.ts': 'a', 'gone.ts': 'g' });
    disk.refuseNext(
      (call) =>
        call.method === 'DELETE' &&
        call.query.get('path') === 'big' &&
        call.query.get('keepInHistory') === null,
      filesRefusal('DIRECTORY_NOT_EMPTY', 'files.error.directoryNotEmpty', {
        path: 'big',
        entryCount: 5000,
        entryCountCapped: true,
      }),
    );
    disk.refuseNext(
      (call) =>
        call.method === 'DELETE' &&
        call.query.get('path') === 'gone.ts' &&
        call.query.get('keepInHistory') === null,
      filesRefusal('FILE_NOT_FOUND', 'files.error.notFound', { path: 'gone.ts' }),
    );
    await onRow('gone.ts');
    act(() => {
      explorerStore(APP).getState().select(['big', 'gone.ts'], 'gone.ts');
    });
    await user.keyboard('{Delete}');
    await user.click(await screen.findByRole('button', { name: t('explorer.delete.confirm') }));

    expect(
      await screen.findByText(t('explorer.delete.holdsAtLeast', { path: 'big', count: 5000 })),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('explorer.delete.confirm') }));

    const outcome = await screen.findByRole('dialog', { name: t('explorer.outcome.deleteFailed') });
    expect(outcome).toHaveTextContent(t('files.error.notFound', { path: 'gone.ts' }));
    expect(outcome).toHaveTextContent(t('files.error.changed', { path: 'big' }));
    await user.click(within(outcome).getByRole('button', { name: t('explorer.outcome.close') }));
    expect(disk.entries.has('big/a.ts')).toBe(true);
  });
});

describe('two presses, one operation', () => {
  it('pastes once while a paste is on its way', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a' });
    const release = disk.hold((call) => call.route === '/files/copy');
    await onRow('a.ts');

    await user.keyboard('{Control>}c{/Control}{Control>}v{/Control}{Control>}v{/Control}');
    release();

    expect(await row('a copy.ts')).toBeVisible();
    expect(disk.callsTo('POST', '/files/copy')).toHaveLength(1);
  });

  it('sends a typed name once, however many times Enter is pressed', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a' });
    const release = disk.hold((call) => call.route === '/files');
    await onRow('a.ts');
    await user.keyboard('{Alt>}n{/Alt}');
    await user.type(await screen.findByRole('textbox'), 'n.ts{Enter}{Enter}');
    release();

    expect(await row('n.ts')).toBeVisible();
    expect(disk.callsTo('POST', '/files')).toHaveLength(1);
  });

  it('gives up a rename that keeps the name, with nothing sent', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ lib: { kind: 'directory' } });
    await onRow('lib');

    await user.keyboard('{F2}');
    const field = await screen.findByRole('textbox', {
      name: t('explorer.name.rename', { name: 'lib' }),
    });
    expect(field).toHaveValue('lib');
    expect((field as HTMLInputElement).selectionEnd).toBe(3);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    expect(disk.callsTo('POST', '/files/move')).toHaveLength(0);
  });
});

describe('the tree and the disk, at the edges', () => {
  it('reads the tree again by hand without asking for another watcher while it follows', async () => {
    const user = userEvent.setup();
    const { disk, watches } = renderExplorer({ 'a.ts': 'a' });
    await row('a.ts');
    act(() => {
      explorerStore(APP).getState().setFilter('');
    });

    disk.put('b.ts', 'b');
    await user.click(screen.getByRole('button', { name: t('explorer.action.refresh') }));

    expect(await row('b.ts')).toBeVisible();
    expect(watches.watched).toEqual([APP]);
  });

  it('selects nothing when the last entry goes', async () => {
    const user = userEvent.setup();
    const { disk, watches } = renderExplorer({ 'only.ts': 'o' });
    await user.click(await row('only.ts'));

    disk.remove('only.ts');
    act(() => {
      watches.subscriber(APP).onChanges([{ path: 'only.ts', kind: 'deleted' }], false);
    });

    expect(await screen.findByText(t('explorer.empty.title'))).toBeVisible();
    expect(explorerStore(APP).getState().selection).toEqual([]);
  });
});

describe('the keyboard and the pointer, at the edges', () => {
  it('ignores keys a failed level does not take, and → on a file', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'src/a.ts': 'a', 'z.ts': 'z' });
    disk.refuseNext(
      (call) => call.query.get('path') === 'src',
      filesRefusal('FILE_ACCESS_DENIED', 'files.error.accessDenied', { path: 'src' }),
    );
    await user.click(await row('src'));
    const failed = (await screen.findByText(/src/, { selector: '.text-destructive *' })).closest(
      '[role="treeitem"]',
    ) as HTMLElement;
    act(() => {
      failed.focus();
    });

    await user.keyboard('x');
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(document.activeElement).toBe(await row('z.ts'));
  });

  it('does not drag what cannot be acted on, nor take a drag of something else', async () => {
    const { disk } = renderExplorer({
      'bad�': { kind: 'file', unreadableName: true },
      lib: { kind: 'directory' },
    });

    const refused = fireEvent.dragStart(await row('bad�'), { dataTransfer: dataTransfer() });
    expect(refused).toBe(false);

    const lib = await row('lib');
    const plain = dataTransfer({ 'text/plain': 'x' });
    expect(fireEvent.dragOver(lib, { dataTransfer: plain })).toBe(true);
    fireEvent.dragLeave(lib, { dataTransfer: plain });

    const foreign = dataTransfer({
      [FILES_DRAG_TYPE]: JSON.stringify({
        folder: '/elsewhere',
        entries: [{ path: 'x', kind: 'file' }],
      }),
    });
    fireEvent.drop(lib, { dataTransfer: foreign });
    fireEvent.drop(lib, { dataTransfer: dataTransfer({ [FILES_DRAG_TYPE]: 'not json' }) });

    expect(disk.callsTo('POST', '/files/move')).toHaveLength(0);
  });

  it('puts the keyboard nowhere new when the tree itself takes the focus', async () => {
    renderExplorer({ 'a.ts': 'a' });
    const tree = await theTree();
    await row('a.ts');

    act(() => {
      tree.focus();
    });

    expect(explorerStore(APP).getState().focused).toBeNull();
  });
});

describe('reaching the Explorer from anywhere', () => {
  it('shows and focuses the Explorer, and on a phone switches to it', async () => {
    const user = userEvent.setup();
    aViewport('phone');
    setActiveFile('a.ts');
    renderExplorer({ 'a.ts': 'a' });
    await row('a.ts');

    await user.keyboard('{Control>}{Shift>}e{/Shift}{/Control}');
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'a.ts' }));
    });

    await user.keyboard('{Shift>}{Alt>}r{/Alt}{/Shift}');
    expect(explorerStore(APP).getState().selection).toEqual(['a.ts']);
  });

  it('focuses the filter from its key, and sorts from the palette', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'b.ts': 'b', 'a.md': 'a' });
    await onRow('a.md');

    await user.keyboard('{Shift>}{Alt>}f{/Alt}{/Shift}');
    expect(screen.getByRole('searchbox', { name: t('explorer.filter.label') })).toHaveFocus();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(
      within(await screen.findByRole('dialog')).getByRole('combobox'),
      t('explorer.action.sortByType'),
    );
    await user.click(
      await screen.findByRole('option', { name: new RegExp(t('explorer.action.sortByType')) }),
    );

    await waitFor(() => {
      expect(explorerStore(APP).getState().sort).toBe('type');
    });
  });
});

describe('the second step of an operation of many — 07 · D-15', () => {
  it('asks before copying a file that changes what Claude may do, and copies once confirmed', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ '.mcp.json': '{}' });
    await onRow('.mcp.json');

    await user.keyboard('{Control>}d{/Control}');
    const step = await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });
    await user.click(within(step).getByRole('button', { name: t('explorer.sensitive.confirm') }));

    expect(await row('.mcp copy.json')).toBeVisible();
    expect(disk.callsTo('POST', '/files/copy').at(-1)?.body).toMatchObject({
      confirmSensitive: true,
    });
  });

  it('says it when the confirmed operation is refused all the same', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ '.mcp.json': '{}' });
    await onRow('.mcp.json');
    await user.keyboard('{Control>}d{/Control}');
    disk.refuseNext(
      (call) => call.route === '/files/copy',
      filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
        path: '.mcp.json',
        reason: 'sensitiveFile',
      }),
    );
    await user.click(await screen.findByRole('button', { name: t('explorer.sensitive.confirm') }));

    expect(
      await screen.findByRole('dialog', { name: t('explorer.outcome.duplicateFailed') }),
    ).toHaveTextContent(t('files.error.preconditionRequired', { path: '.mcp.json' }));
  });
});

describe('a reveal with nothing left to reveal', () => {
  it('does nothing when the editor closed the file meanwhile', async () => {
    const user = userEvent.setup();
    setActiveFile('a.ts');
    renderExplorer({ 'a.ts': 'a' });
    await row('a.ts');
    setActiveFile(null);

    await user.keyboard('{Shift>}{Alt>}r{/Alt}{/Shift}');

    expect(explorerStore(APP).getState().selection).toEqual([]);
  });

  it('finds no row by typing what no row is called, from nowhere', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a' });
    const tree = await theTree();
    await row('a.ts');
    act(() => {
      tree.focus();
    });

    await user.keyboard('q');

    expect(explorerStore(APP).getState().focused).toBeNull();
  });
});
