import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openFile } from '@/features/editor';
import { editorStoreOf } from '@/features/editor/store/editor.store';
import {
  FOLDER,
  editorOf,
  editorState,
  pressSave,
  renderEditor,
  stripOf,
  typeInto,
  watched,
} from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { aLiveSocket } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { translator } from '../../../support/render';

const t = translator('en');
let socket: LiveSocket;

beforeEach(() => {
  socket = aLiveSocket();
  socket.connect();
});

afterEach(() => {
  socket.close();
  vi.restoreAllMocks();
});

async function opened(path: string): Promise<HTMLTextAreaElement> {
  act(() => {
    openFile(FOLDER, path);
  });
  return editorOf(path);
}

describe('when the disk changes under the editor — plan 07, B-35', () => {
  it('reloads a clean tab Claude changed, keeping the cursor (S-238)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'line one\nline two' });
    renderEditor();
    const area = await opened('a.ts');
    const folder = await watched(socket);

    act(() => {
      area.setSelectionRange(5, 5);
      area.dispatchEvent(new Event('select'));
    });
    disk.write('a.ts', 'line ONE\nline two\nline three');
    folder.changed([{ path: 'a.ts', kind: 'changed', origin: 'claude' }]);

    await waitFor(() => {
      expect(area.value).toBe('line ONE\nline two\nline three');
    });
    expect(area.selectionStart).toBe(5);
    expect(screen.queryByText(t('editor.external.claude', { path: 'a.ts' }))).toBeNull();
  });

  it('warns about a dirty tab without blocking — Compare, Reload, Keep — and loses nothing (S-239)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');
    const folder = await watched(socket);

    typeInto(area, 'mine');
    disk.write('a.ts', 'claude');
    folder.changed([{ path: 'a.ts', kind: 'changed', origin: 'claude' }]);

    const warning = await screen.findByText(t('editor.external.claude', { path: 'a.ts' }));
    expect(warning.closest('[role="status"]')).not.toBeNull();
    expect(area.value).toBe('mine');

    await user.click(screen.getByRole('button', { name: t('editor.external.compare') }));
    expect(await screen.findByText(t('editor.diff.readOnly'))).toBeVisible();
    await user.click(
      within(stripOf()).getByRole('button', { name: `a.ts, ${t('editor.tab.dirty')}` }),
    );
    await user.click(await screen.findByRole('button', { name: t('editor.external.keep') }));
    expect(screen.queryByText(t('editor.external.claude', { path: 'a.ts' }))).toBeNull();

    // Kept: the next save meets the conflict — never an overwrite in silence.
    pressSave(await editorOf('a.ts'));
    expect(
      await screen.findByRole('dialog', { name: t('editor.conflict.title', { name: 'a.ts' }) }),
    ).toBeVisible();
  });

  it('reloads from the warning when asked', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');
    const folder = await watched(socket);

    typeInto(area, 'mine');
    disk.write('a.ts', 'theirs');
    folder.changed([{ path: 'a.ts', kind: 'changed' }]);
    await user.click(await screen.findByRole('button', { name: t('editor.external.reload') }));

    await waitFor(() => {
      expect(area.value).toBe('theirs');
    });
  });

  it('marks a file deleted on disk, and saving offers to recreate it with a create (S-240)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');
    const folder = await watched(socket);

    disk.remove('a.ts');
    folder.changed([{ path: 'a.ts', kind: 'deleted', origin: 'claude' }]);
    expect(await screen.findByText(t('editor.deleted.notice', { path: 'a.ts' }))).toBeVisible();
    expect(
      within(stripOf()).getByRole('button', { name: `a.ts, ${t('editor.tab.deleted')}` }),
    ).toHaveClass('line-through');

    typeInto(area, 'again');
    pressSave(area);
    const dialog = await screen.findByRole('dialog', {
      name: t('editor.recreate.title', { name: 'a.ts' }),
    });
    expect(within(dialog).getByRole('button', { name: t('editor.recreate.cancel') })).toHaveFocus();
    expect(disk.saves()).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: t('editor.recreate.confirm') }));
    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('again');
    });
    expect(disk.saves()).toEqual([]);
  });

  it('stays silent on the echo of its own save (S-241)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');
    const folder = await watched(socket);

    typeInto(area, 'two');
    pressSave(area);
    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('two');
    });
    folder.changed([{ path: 'a.ts', kind: 'changed', origin: 'user' }]);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText(t('editor.external.other', { path: 'a.ts' }))).toBeNull();
    expect(editorState().docs['a.ts']?.external).toBeNull();
  });

  it('says "changed outside the editor" when nobody could tell who did it (S-242)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');
    const folder = await watched(socket);

    typeInto(area, 'mine');
    disk.write('a.ts', 'someone');
    folder.changed([{ path: 'a.ts', kind: 'changed' }]);

    expect(await screen.findByText(t('editor.external.other', { path: 'a.ts' }))).toBeVisible();
  });

  it('checks every open file again when the socket comes back — nothing is replayed (S-259)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');
    await watched(socket);

    disk.write('a.ts', 'while away');
    act(() => {
      socket.close();
    });
    socket = aLiveSocket();
    socket.connect();
    await watched(socket, FOLDER, 'w-2');

    await waitFor(() => {
      expect(area.value).toBe('while away');
    });
    expect(editorStoreOf(FOLDER).getState().docs['a.ts']?.etag).toBe(disk.versionOf('a.ts'));
  });
});
