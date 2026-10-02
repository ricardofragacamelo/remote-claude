import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { explorerStore } from '@/features/explorer';
import { editorFake, resetEditorFake } from '../../../support/editor-fake';
import { APP, ExplorerHarness, fakeWatches, row } from '../../../support/explorer';
import { etagOf, FakeFolder } from '../../../support/files-api';
import { render, translator } from '../../../support/render';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  resetEditorFake();
});

type User = ReturnType<typeof userEvent.setup>;

function open(tree: Record<string, string | { kind: 'directory' }>, folder = APP) {
  const disk = new FakeFolder(folder, tree).install();
  fakeWatches();
  render(<ExplorerHarness folder={folder} />);
  return disk;
}

async function onRow(name: string): Promise<HTMLElement> {
  const item = await row(name);
  act(() => {
    item.focus();
  });
  return item;
}

async function undo(user: User): Promise<void> {
  await user.keyboard('{Control>}z{/Control}');
}

async function renameTo(user: User, from: string, to: string): Promise<void> {
  await onRow(from);
  await user.keyboard('{F2}');
  const field = await screen.findByRole('textbox');
  await user.clear(field);
  await user.type(field, `${to}{Enter}`);
  await row(to);
}

describe('Ctrl+Z in the tree undoes the last file operation — S-184', () => {
  it('undoes a rename by renaming back, with the version it left', async () => {
    const user = userEvent.setup();
    const disk = open({ 'a.ts': 'a' });
    await renameTo(user, 'a.ts', 'b.ts');

    await undo(user);

    expect(await row('a.ts')).toBeVisible();
    const back = disk.callsTo('POST', '/files/move').at(-1);
    expect(back?.body).toMatchObject({ from: 'b.ts', to: 'a.ts', ifMatch: etagOf('a') });
    expect(editorFake.entryMoved).toHaveBeenLastCalledWith(APP, 'b.ts', 'a.ts');
    expect(await screen.findByText(t('explorer.done.undone'))).toBeInTheDocument();
  });

  it('undoes a new file by deleting it, only as it was made', async () => {
    const user = userEvent.setup();
    const disk = open({ 'a.ts': 'a' });
    await onRow('a.ts');
    await user.keyboard('{Alt>}n{/Alt}');
    await user.type(await screen.findByRole('textbox'), 'n.ts{Enter}');
    await onRow('n.ts');

    await undo(user);

    await waitFor(() => {
      expect(disk.entries.has('n.ts')).toBe(false);
    });
    expect(disk.callsTo('DELETE', '/files').at(-1)?.headers['if-match']).toBe(etagOf(''));
  });

  it('undoes a copy, and a move, by their inverses', async () => {
    const user = userEvent.setup();
    const disk = open({ 'a.ts': 'a', lib: { kind: 'directory' } });
    await onRow('a.ts');
    await user.keyboard('{Control>}d{/Control}');
    await row('a copy.ts');

    await user.click(await row('a.ts'));
    await user.keyboard('{Alt>}m{/Alt}');
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox'), 'lib');
    await user.click(within(dialog).getByRole('button', { name: t('explorer.move.confirm') }));
    await waitFor(() => {
      expect(disk.entries.has('lib/a.ts')).toBe(true);
    });

    await onRow('lib');
    await undo(user);
    await waitFor(() => {
      expect(disk.entries.has('a.ts')).toBe(true);
    });

    await undo(user);
    await waitFor(() => {
      expect(disk.entries.has('a copy.ts')).toBe(false);
    });
  });
});

describe('an undo the disk no longer allows — S-185', () => {
  it('is refused with the reason when the file changed since — Claude wrote to it', async () => {
    const user = userEvent.setup();
    const disk = open({ 'a.ts': 'a' });
    await renameTo(user, 'a.ts', 'b.ts');
    disk.put('b.ts', 'written by Claude');

    await undo(user);

    const outcome = await screen.findByRole('dialog', { name: t('explorer.outcome.undoFailed') });
    expect(outcome).toHaveTextContent(t('explorer.undo.changed', { path: 'b.ts' }));
    expect(disk.entries.get('b.ts')?.content).toBe('written by Claude');
    await user.click(within(outcome).getByRole('button', { name: t('explorer.outcome.close') }));
  });

  it('does not delete a folder it made that has something in it now', async () => {
    const user = userEvent.setup();
    const disk = open({ 'a.ts': 'a' });
    await onRow('a.ts');
    await user.keyboard('{Shift>}{Alt>}n{/Alt}{/Shift}');
    await user.type(await screen.findByRole('textbox'), 'made{Enter}');
    await onRow('made');
    disk.put('made/claude.ts', 'c');

    await undo(user);

    expect(
      await screen.findByRole('dialog', { name: t('explorer.outcome.undoFailed') }),
    ).toHaveTextContent(t('explorer.undo.notEmpty', { path: 'made' }));
    expect(disk.entries.has('made/claude.ts')).toBe(true);
  });
});

describe('undoing twice — S-186', () => {
  it('sends one inverse however fast the keys are pressed', async () => {
    const user = userEvent.setup();
    const disk = open({ 'a.ts': 'a' });
    await renameTo(user, 'a.ts', 'b.ts');
    const release = disk.hold((call) => call.route === '/files/move');

    await undo(user);
    await undo(user);
    release();

    expect(await row('a.ts')).toBeVisible();
    expect(disk.callsTo('POST', '/files/move')).toHaveLength(2);
    expect(explorerStore(APP).getState().undo).toHaveLength(0);

    await undo(user);
    expect(disk.callsTo('POST', '/files/move')).toHaveLength(2);
  });
});

describe('one undo stack per folder tab — S-187', () => {
  it('does not undo in tab B what was done in tab A', async () => {
    const user = userEvent.setup();
    const B = `${APP}/pkg`;
    open({ 'a.ts': 'a' });
    await renameTo(user, 'a.ts', 'b.ts');
    cleanup();
    vi.restoreAllMocks();

    const other = open({ 'x.ts': 'x' }, B);
    await onRow('x.ts');
    await undo(user);

    expect(other.callsTo('POST', '/files/move')).toHaveLength(0);
    expect(explorerStore(APP).getState().undo).toHaveLength(1);
    expect(explorerStore(B).getState().undo).toHaveLength(0);
  });
});
